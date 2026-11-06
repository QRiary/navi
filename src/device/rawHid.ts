/**
 * One packet to a keyboard's Raw HID interface by its usage page / usage (QMK's RAW_USAGE_PAGE / RAW_USAGE_ID, which a
 * build may change: the owner's is 0xFF71). Used for NAVI's "restart into the bootloader" message, which gets no
 * reply: whether it worked is decided only by the bootloader appearing (src/lib/buildFlash.ts).
 * Windows opens HID devices shared, so a program keeping its handle open (py_qmk) doesn't block this.
 */
import { REPORT_SIZE } from '../core/via/protocol';
import { hidSupported } from './webhid';

export type RawTarget = { vendorId: number; productId: number; productName: string };

const hasCollection = (d: HIDDevice, page: number, usage: number) => d.collections.some((c) => c.usagePage === page && c.usage === usage);

/** Connected devices with that interface (permission is asked once; in Electron main answers without a picker). */
async function devicesWith(page: number, usage: number): Promise<HIDDevice[]> {
  if (!hidSupported()) return [];
  let devices = (await navigator.hid.getDevices()).filter((d) => hasCollection(d, page, usage));
  if (!devices.length) {
    try {
      await navigator.hid.requestDevice({ filters: [{ usagePage: page, usage }] });
    } catch {
      // nothing connected, or the request was declined
    }
    devices = (await navigator.hid.getDevices()).filter((d) => hasCollection(d, page, usage));
  }
  return devices;
}

/**
 * Pick the keyboard to send to: the project's VID:PID when known, else the only device with the interface.
 * Several candidates and no VID:PID to tell them apart → none (sending to the wrong keyboard would restart it).
 */
export function pickRawTarget<T extends RawTarget>(devices: readonly T[], expect: { vid: number; pid: number } | null): T | 'none' | 'several' {
  const byId = expect ? devices.filter((d) => d.vendorId === expect.vid && d.productId === expect.pid) : [];
  const pool = byId.length ? byId : devices;
  if (pool.length === 0) return 'none';
  // One physical keyboard can show up as several HIDDevice objects (one per interface): same VID:PID and name.
  const keys = new Set(pool.map((d) => `${d.vendorId}:${d.productId}:${d.productName}`));
  if (keys.size > 1 && !byId.length) return 'several';
  return pool[0]!;
}

export type RawSendResult = { sent: true; device: RawTarget; error?: string } | { sent: false; why: 'none' | 'several' | 'unsupported' | 'unopened'; error?: string };

export async function sendRawPacket(page: number, usage: number, packet: Uint8Array, expect: { vid: number; pid: number } | null): Promise<RawSendResult> {
  if (!hidSupported()) return { sent: false, why: 'unsupported' };
  const pick = pickRawTarget(await devicesWith(page, usage), expect);
  if (pick === 'none' || pick === 'several') return { sent: false, why: pick };
  const device = pick;
  const target = { vendorId: device.vendorId, productId: device.productId, productName: device.productName };
  const openedHere = !device.opened;
  try {
    if (openedHere) await device.open();
  } catch (err) {
    return { sent: false, why: 'unopened', error: err instanceof Error ? err.message : String(err) };
  }
  try {
    const payload = new Uint8Array(REPORT_SIZE);
    payload.set(packet.subarray(0, REPORT_SIZE));
    await device.sendReport(0, payload);
    return { sent: true, device: target };
  } catch (err) {
    // The keyboard may restart before the write is acknowledged: the bootloader appearing decides, not this error.
    return { sent: true, device: target, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (openedHere) {
      try {
        if (device.opened) await device.close();
      } catch {
        // already gone (it restarted)
      }
    }
  }
}
