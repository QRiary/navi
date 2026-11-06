/** The keymap folder's files from the project: one function for Firmware → files (useGenerated) and “build + flash”. */
import type { KeycodeSpec } from '../core/keycodes/spec';
import { effectiveMaxBrightness, rgbTargetDefaults } from '../core/lighting/buildDefaults';
import { activeKeymap } from '../core/project/ops';
import type { Project } from '../core/project/types';
import { generateKeymap, viaInBuild, type GenerateResult } from '../core/qmk/generate';
import type { QmkState } from '../store/qmkStore';

export function generateFiles(project: Project, spec: KeycodeSpec, info: NonNullable<QmkState['sources']>['info'] | undefined, ownCode: QmkState['ownCode']): GenerateResult {
  const via = viaInBuild(project);
  const encoderCount = info?.encoders ?? project.hardware.encoders.count ?? Math.max(0, ...activeKeymap(project).layers.map((l) => l.encoders.length));
  const maxBrightness = effectiveMaxBrightness(rgbTargetDefaults(info), project.firmware.buildConfig);
  const own = ownCode && ownCode.keyboard === project.firmware.keyboard && ownCode.keymap === project.firmware.keymap ? ownCode.files : null;
  return generateKeymap({ project, keymap: activeKeymap(project), spec, via, encoderCount, maxBrightness, ownCode: own });
}
