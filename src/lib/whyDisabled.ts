/**
 * The one convention for disabled controls: a control is disabled only by a reason, and the reason is its tooltip.
 *   <button {...whyDisabled(full && t('At most 32 layers', '…'), t('Add a layer', '…'))}>
 * `reason` falsy → enabled, with `title` (its normal tooltip, if any). Chromium shows the tooltip on a disabled button.
 * A limit the user runs into (a list is full) is also said in text next to the control where it fits.
 * `hintsConvention.test.ts` rejects a bare `disabled={…}` in .tsx files.
 */
export function whyDisabled(reason: string | false | null | undefined, title?: string): { disabled: boolean; title: string | undefined } {
  return reason ? { disabled: true, title: reason } : { disabled: false, title };
}
