/**
 * WebHID TRANSPORT: the keyboard's Raw HID interface (usage page 0xFF60) in the app window.
 * HID permission is granted only by the main process and only to our own interface (electron/main.cjs).
 * The VIA answer is the next incoming report; requests go one by one (ViaClient ensures that).
 */
import type { HidTransport, TransportInfo } from '../core/via/client';
import { RAW_USAGE, RAW_USAGE_PAGE, REPORT_SIZE, ViaDisconnectedError, ViaTimeoutError } from '../core/via/protocol';

export const hidSupported = () => typeof navigator !== 'undefined' && 'hid' in navigator;

/** Whether an HID device has the VIA interface (Raw HID 0xFF60 / 0x61). */
export function isViaInterface(device: HIDDevice): boolean {
  return device.collections.some((c) => c.usagePage === RAW_USAGE_PAGE && c.usage === RAW_USAGE);
}

export function deviceKey(device: HIDDevice): string {
  return `${device.vendorId.toString(16).padStart(4, '0')}:${device.productId.toString(16).padStart(4, '0')}:${device.productName}`;
}

/** All connected devices with the VIA interface. */
export async function listViaDevices(): Promise<HIDDevice[]> {
  if (!hidSupported()) return [];
  let devices = await navigator.hid.getDevices();
  if (!devices.some(isViaInterface)) {
    // Permission not granted yet — request it (in Electron no picker is shown, main answers itself).
    try {
      await navigator.hid.requestDevice({ filters: [{ usagePage: RAW_USAGE_PAGE, usage: RAW_USAGE }] });
    } catch {
      // no devices or the request was declined
    }
    devices = await navigator.hid.getDevices();
  }
  const seen = new Set<string>();
  return devices.filter((d) => {
    if (!isViaInterface(d)) return false;
    const k = deviceKey(d);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export class WebHidTransport implements HidTransport {
  readonly info: TransportInfo;
  private disconnected = false;
  private onDisconnect = (e: HIDConnectionEvent) => {
    if (e.device === this.device) this.disconnected = true;
  };

  private constructor(private readonly device: HIDDevice) {
    this.info = { vendorId: device.vendorId, productId: device.productId, productName: device.productName, key: deviceKey(device) };
    navigator.hid.addEventListener('disconnect', this.onDisconnect);
  }

  static async open(device: HIDDevice): Promise<WebHidTransport> {
    if (!device.opened) await device.open();
    return new WebHidTransport(device);
  }

  get hidDevice() {
    return this.device;
  }

  exchange(data: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
    if (this.disconnected || !this.device.opened) return Promise.reject(new ViaDisconnectedError('the keyboard is disconnected'));
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.device.removeEventListener('inputreport', onReport);
      };
      const onReport = (e: HIDInputReportEvent) => {
        cleanup();
        resolve(new Uint8Array(e.data.buffer, e.data.byteOffset, Math.min(e.data.byteLength, REPORT_SIZE)).slice());
      };
      this.device.addEventListener('inputreport', onReport);
      timer = setTimeout(() => {
        cleanup();
        reject(this.disconnected ? new ViaDisconnectedError('the keyboard is disconnected') : new ViaTimeoutError(`no response in ${timeoutMs} ms`));
      }, timeoutMs);
      const payload = new Uint8Array(REPORT_SIZE);
      payload.set(data.subarray(0, REPORT_SIZE));
      this.device.sendReport(0, payload).catch((err: unknown) => {
        cleanup();
        reject(this.disconnected ? new ViaDisconnectedError('the keyboard is disconnected') : new ViaDisconnectedError(`send failed: ${(err as Error).message}`));
      });
    });
  }

  async close(): Promise<void> {
    navigator.hid.removeEventListener('disconnect', this.onDisconnect);
    try {
      if (this.device.opened) await this.device.close();
    } catch {
      // already closed
    }
  }
}
