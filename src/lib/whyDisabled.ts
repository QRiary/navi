/**
 * The one convention for disabled controls: a control is disabled only by a reason, and the reason is its tooltip.
 *   <button {...whyDisabled(full && t('At most 32 layers', '…'), t('Add a layer', '…'))}>
 * `reason` falsy → enabled, with `title` (its normal tooltip, if any). A disabled control gets `aria-disabled="true"`,
 * not `disabled`: it stays focusable, the `title` is its accessible description, and `ariaDisabled.ts` (installed in
 * main.tsx) blocks its click. Its disabled look is the `[aria-disabled="true"]` rules in base.css.
 * A limit the user runs into (a list is full) is also said in text next to the control where it fits.
 * `hintsConvention.test.ts` rejects a bare `disabled` attribute in .tsx files.
 */
export function whyDisabled(reason: string | false | null | undefined, title?: string): { 'aria-disabled': true | undefined; title: string | undefined } {
  return reason ? { 'aria-disabled': true, title: reason } : { 'aria-disabled': undefined, title };
}
