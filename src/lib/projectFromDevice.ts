/**
 * Project from the connected keyboard: matrix size, layers, encoders, macros and lighting —
 * from what was read over VIA; geometry — a template if the keyboard is known, otherwise a grid.
 * All facts are marked “device” with a date.
 */
import { LATEST_SPEC_VERSION } from '../core/keycodes/spec';
import { createDilemmaProject, createProject, emptyHardware } from '../core/project/factory';
import { activeKeymap } from '../core/project/ops';
import type { Fact, Project } from '../core/project/types';
import { gridGeometry } from '../core/layout/templates';
import { snapshotToKeymap } from '../core/via/sync';
import type { DeviceListItem } from '../store/deviceStore';
import type { DeviceCapabilities, DeviceSnapshot } from '../core/via/probe';
import { newId } from '../core/layout/geometry';

export function projectFromDevice(device: DeviceListItem, caps: DeviceCapabilities, snapshot: DeviceSnapshot): Project {
  const at = new Date().toISOString();
  const isDilemma = device.vendorId === 0xafc5 && device.productId === 0xbfc5 && snapshot.rows === 10 && snapshot.cols === 6;
  let project: Project;
  if (isDilemma) {
    project = createDilemmaProject(device.productName);
  } else {
    const hw = emptyHardware(snapshot.rows, snapshot.cols);
    hw.name = device.productName;
    hw.usb = { vid: device.vendorId, pid: device.productId, product: device.productName };
    hw.encoders.count = caps.encoderMap ? snapshot.encoderCount : null;
    hw.lighting.kind = caps.lighting.rgbMatrix ? 'rgb_matrix' : caps.lighting.rgblight ? 'rgblight' : caps.lighting.ledMatrix ? 'led_matrix' : caps.lighting.backlight ? 'backlight' : 'unknown';
    const facts: Fact[] = [
      { key: 'usb', value: `VID 0x${device.vendorId.toString(16).toUpperCase()}, PID 0x${device.productId.toString(16).toUpperCase()}, «${device.productName}»`, evidence: 'device', at },
      { key: 'via.protocol', value: String(caps.protocol), evidence: 'device', at },
      { key: 'matrix', value: `${snapshot.rows} × ${snapshot.cols}`, evidence: 'device', at },
      { key: 'layers', value: String(caps.layers), evidence: 'device', at },
    ];
    if (caps.encoderMap) facts.push({ key: 'encoders', value: `${snapshot.encoderCount} (encoder map)`, evidence: 'device', at });
    if (caps.macros) facts.push({ key: 'macros', value: `${caps.macros.count}, ${caps.macros.bufferSize} B`, evidence: 'device', at });
    hw.facts = facts;
    const geometry = gridGeometry(snapshot.rows, snapshot.cols, false);
    // Positions empty on every layer (KC_NO) — most likely there are no keys there: removed from the grid.
    geometry.keys = geometry.keys.filter((k) => !k.matrix || snapshot.keymap.some((l) => l[k.matrix![0] * snapshot.cols + k.matrix![1]] !== 0));
    geometry.encoders = Array.from({ length: caps.encoderMap ? snapshot.encoderCount : 0 }, (_, i) => ({
      id: newId('enc'),
      index: i,
      x: snapshot.cols + 1 + i * 1.4,
      y: -1,
      d: 0.9,
      half: 'center' as const,
      pressMatrix: null,
      label: `E${i}`,
      approximate: true,
    }));
    project = createProject({ name: device.productName, hardware: hw, geometry, layers: caps.layers, encoderCount: caps.encoderMap ? snapshot.encoderCount : 0 });
    project.device = { vid: device.vendorId, pid: device.productId, product: device.productName };
    project.firmware.flags = {
      via: { state: 'on', evidence: 'device' },
      encoder_map: { state: caps.encoderMap ? 'on' : 'off', evidence: 'device' },
      dynamic_macro_via: { state: caps.macros ? 'on' : 'off', evidence: 'device' },
      rgb_matrix: caps.lighting.rgbMatrix ? { state: 'on', evidence: 'device' } : { state: 'unknown', evidence: 'device' },
      rgblight: caps.lighting.rgblight ? { state: 'on', evidence: 'device' } : { state: 'unknown', evidence: 'device' },
    };
  }
  // Keycode version: protocol 13 reports it; 12 does not (firmware 2023–2026), take 0.0.8.
  project.firmware.keycodeSpec = caps.keycodesVersion && /^\d+\.\d+\.\d+$/.test(caps.keycodesVersion) ? caps.keycodesVersion : caps.protocol >= 13 ? LATEST_SPEC_VERSION : '0.0.8';
  const km = snapshotToKeymap(activeKeymap(project), snapshot);
  project.keymaps = [{ ...km, name: 'from keyboard' }];
  project.activeKeymapId = km.id;
  project.macros = (snapshot.macros ?? [])
    .map((steps, index) => ({ id: newId('macro'), index, name: `M${index}`, steps }))
    .filter((m) => m.steps.length > 0);
  if (snapshot.rgbMatrix) project.lighting.rgbMatrix = snapshot.rgbMatrix;
  if (snapshot.rgblight) project.lighting.rgblight = snapshot.rgblight;
  project.name = device.productName;
  return project;
}
