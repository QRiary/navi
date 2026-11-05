/**
 * Links the project with labels and the catalog: names of layers, tap dances, macros, own keycodes.
 */
import { useMemo } from 'react';
import type { CatalogContext } from '../core/keycodes/catalog';
import type { LabelContext } from '../core/keycodes/labels';
import type { KeycodeSpec } from '../core/keycodes/spec';
import { aliasLookup } from '../core/project/aliases';
import { activeGeometry, activeKeymap } from '../core/project/ops';
import { tapHoldActionLookup } from '../core/project/tapHoldActions';
import type { Project } from '../core/project/types';
import { useProjectStore, useSpec } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';

/** Value of an own keycode: QK_USER_0 + number (like SAFE_RANGE in keymap.c). */
export function customKeycodeValue(spec: KeycodeSpec, index: number): number {
  const start = spec.rangeByDefine.get('QK_USER')?.start ?? 0x7e40;
  return start + index;
}

export function labelContext(project: Project, spec: KeycodeSpec, settings: { os: LabelContext['os']; hostLayout: string }): LabelContext {
  const km = activeKeymap(project);
  const custom = new Map(project.customKeycodes.map((c, i) => [customKeycodeValue(spec, i), c.name]));
  const aliases = aliasLookup(project.keyAliases);
  const tapHoldActions = tapHoldActionLookup(project);
  return {
    os: settings.os,
    hostLanguage: settings.hostLayout === 'none' ? undefined : settings.hostLayout,
    unicode: project.firmware.unicode,
    layerName: (l) => {
      const name = km.layers[l]?.name;
      return name && name.length <= 6 ? name : undefined;
    },
    layerTitle: (l) => km.layers[l]?.name || undefined,
    tapDanceName: (i) => project.tapDances.find((t) => t.index === i)?.name,
    macroName: (i) => {
      const m = project.macros.find((x) => x.index === i);
      return m?.name ? m.name.slice(0, 8) : undefined;
    },
    customName: (v) => custom.get(v),
    alias: (v) => aliases.get(v),
    unicodeEntry: (i) => project.unicodeMap[i]?.codepoint,
    tapHoldAction: (v) => tapHoldActions.get(v),
  };
}

export function catalogContext(project: Project, spec: KeycodeSpec, label: LabelContext, macroCount?: number): CatalogContext {
  const km = activeKeymap(project);
  return {
    ...label,
    layerCount: km.layers.length,
    tapDances: project.tapDances.map((t) => ({ index: t.index, name: t.name })),
    macroCount,
    customKeycodes: project.customKeycodes.map((c, i) => ({ value: customKeycodeValue(spec, i), name: c.name, description: c.description })),
    aliases: [...aliasLookup(project.keyAliases)].map(([value, a]) => ({ value, ...a })),
  };
}

export function useLabelContext(): LabelContext | null {
  const project = useProjectStore((s) => s.project);
  const spec = useSpec();
  const os = useSettingsStore((s) => s.settings.keyboard.os);
  const hostLayout = useSettingsStore((s) => s.settings.keyboard.hostLayout);
  return useMemo(() => (project ? labelContext(project, spec, { os, hostLayout }) : null), [project, spec, os, hostLayout]);
}

export function useActive() {
  const project = useProjectStore((s) => s.project);
  return useMemo(() => (project ? { project, keymap: activeKeymap(project), geometry: activeGeometry(project) } : null), [project]);
}
