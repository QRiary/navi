import { describe, expect, it } from 'vitest';
import { withLanguage } from '../i18n';
import { issueLevelLabel } from './issueLevel';

describe('issueLevelLabel', () => {
  it('names every level in both languages, never the raw code', () => {
    for (const lang of ['en', 'ru'] as const) {
      const labels = (['error', 'warning', 'note', 'info'] as const).map((l) => withLanguage(lang, () => issueLevelLabel(l)));
      expect(new Set(labels).size).toBe(4);
      for (const raw of ['err', 'warn']) expect(labels).not.toContain(raw);
    }
    expect(withLanguage('en', () => issueLevelLabel('warning'))).toBe('warning');
    expect(withLanguage('ru', () => issueLevelLabel('error'))).toBe('ошибка');
  });
});
