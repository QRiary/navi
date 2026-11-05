/**
 * QMK documentation links shown by InfoTips ("QMK docs"). Every URL here was opened and its anchor checked when it was
 * added (`node scripts/check-docs-links.mjs` fetches each page and looks for the anchor's id). The main process opens
 * only https://docs.qmk.fm/… and a few other hosts (`navi:open-external` in `electron/main.cjs`).
 */
import { FEATURE_BY_ID, type FeatureId } from '../core/features/registry';
import { navi } from '../desktop/bridge';

export const QMK_DOCS = {
  tapHold: 'https://docs.qmk.fm/tap_hold',
  tappingTerm: 'https://docs.qmk.fm/tap_hold#tapping-term',
  tapHoldModes: 'https://docs.qmk.fm/tap_hold#tap-or-hold-decision-modes',
  permissiveHold: 'https://docs.qmk.fm/tap_hold#permissive-hold',
  holdOnOtherKeyPress: 'https://docs.qmk.fm/tap_hold#hold-on-other-key-press',
  quickTapTerm: 'https://docs.qmk.fm/tap_hold#quick-tap-term',
  flowTap: 'https://docs.qmk.fm/tap_hold#flow-tap',
  chordalHold: 'https://docs.qmk.fm/tap_hold#chordal-hold',
  retroTapping: 'https://docs.qmk.fm/tap_hold#retro-tapping',
  modTap: 'https://docs.qmk.fm/mod_tap',
} as const satisfies Record<string, `https://${string}`>;

export type QmkDocsLink = (typeof QMK_DOCS)[keyof typeof QMK_DOCS];

/** The docs page of a firmware feature (the registry's `docs` path), if it has one. */
export function featureDocs(id: FeatureId): string | undefined {
  const path = FEATURE_BY_ID.get(id)?.docs;
  return path ? `https://docs.qmk.fm/${path}` : undefined;
}

/** Opens a docs page in the system browser (a new tab in the browser build). */
export function openDocs(url: string): void {
  if (navi) void navi.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}
