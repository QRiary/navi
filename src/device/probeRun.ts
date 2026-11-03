/**
 * Connection check with a real keyboard: npm run device:probe.
 * The window opens hidden, the interface finds the keyboard over WebHID, reads (read-only!)
 * everything VIA gives and sends the result to the main process — which prints JSON and exits.
 */
import { ViaClient } from '../core/via/client';
import { detectMatrix, probeCapabilities, readSnapshot } from '../core/via/probe';
import { listViaDevices, WebHidTransport } from './webhid';

export async function runDeviceProbe(): Promise<Record<string, unknown>> {
  const started = performance.now();
  const devices = await listViaDevices();
  if (devices.length === 0) return { ok: false, error: 'no VIA keyboard found over WebHID' };
  const results: Record<string, unknown>[] = [];
  for (const device of devices) {
    const transport = await WebHidTransport.open(device);
    try {
      const client = new ViaClient(transport);
      const caps = await probeCapabilities(client);
      const matrix = await detectMatrix(client, 24, 24);
      const snap = await readSnapshot(client, caps, { rows: matrix.rows, cols: matrix.cols, encoderCount: null });
      results.push({
        device: { vendorId: `0x${device.vendorId.toString(16)}`, productId: `0x${device.productId.toString(16)}`, productName: device.productName },
        capabilities: caps,
        matrix,
        layer0: snap.keymap[0].map((v) => `0x${v.toString(16)}`),
        encoderCount: snap.encoderCount,
        encodersLayer0: snap.encoders[0],
        macrosNonEmpty: snap.macros?.filter((m) => m.length > 0).length ?? null,
        macroIssues: snap.macroIssues,
        rgbMatrix: snap.rgbMatrix,
        commands: client.commands,
      });
    } catch (err) {
      results.push({ device: device.productName, error: (err as Error).message });
    } finally {
      await transport.close();
    }
  }
  return { ok: results.every((r) => !('error' in r)), ms: Math.round(performance.now() - started), results };
}
