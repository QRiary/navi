import { afterEach, describe, expect, it } from 'vitest';
import { count, plural, setLanguage, t } from './index';

describe('interface language', () => {
  afterEach(() => setLanguage('en'));

  it('English by default, switches to Russian', () => {
    expect(t('Layers', 'Слои')).toBe('Layers');
    setLanguage('ru');
    expect(t('Layers', 'Слои')).toBe('Слои');
  });

  it('numbers with words by the rules of Russian', () => {
    setLanguage('ru');
    expect(count(1, ['key', 'keys'], ['клавиша', 'клавиши', 'клавиш'])).toBe('1 клавиша');
    expect(count(3, ['key', 'keys'], ['клавиша', 'клавиши', 'клавиш'])).toBe('3 клавиши');
    expect(count(11, ['key', 'keys'], ['клавиша', 'клавиши', 'клавиш'])).toBe('11 клавиш');
    expect(count(58, ['key', 'keys'], ['клавиша', 'клавиши', 'клавиш'])).toBe('58 клавиш');
    setLanguage('en');
    expect(plural(1, ['key', 'keys'], ['клавиша', 'клавиши', 'клавиш'])).toBe('key');
    expect(count(2, ['key', 'keys'], ['клавиша', 'клавиши', 'клавиш'])).toBe('2 keys');
  });
});
