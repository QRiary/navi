/** For the list filters: every name a key value goes by (friendly text and QMK name), as one searchable string. */
import { friendlyName } from '../core/keycodes/friendly';
import { useSpec } from '../store/projectStore';
import { useLabelContext } from './projectContext';

export function useKeyWords(): (value: number) => string {
  const spec = useSpec();
  const ctx = useLabelContext();
  return (value) => {
    if (!value) return '';
    const f = friendlyName(spec, value, ctx ?? {});
    return `${f.text} ${f.qmk}`;
  };
}
