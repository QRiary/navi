/**
 * What is known about the hardware — in a form convenient for featureStatus (core/features/registry.ts).
 */
import type { HardwareFacts } from '../core/features/registry';
import type { Project } from '../core/project/types';

export function hardwareFacts(project: Project): HardwareFacts {
  const hw = project.hardware;
  const lighting = hw.lighting.kind;
  const rgb = lighting === 'rgb_matrix' || lighting === 'rgblight';
  const mono = lighting === 'led_matrix' || lighting === 'backlight';
  return {
    // Addressable RGB and single-color LEDs are different hardware: on an RGB board LED Matrix/backlight will not work.
    rgbLeds: lighting === 'unknown' ? 'unknown' : rgb,
    monoLeds: lighting === 'unknown' ? 'unknown' : mono,
    encoders: hw.encoders.count ?? 'unknown',
    pointing: hw.pointing.kind === 'unknown' ? 'unknown' : hw.pointing.kind !== 'none',
    audio: 'unknown',
    haptic: 'unknown',
    oled: 'unknown',
    bluetooth: 'unknown',
    split: hw.split.enabled,
  };
}
