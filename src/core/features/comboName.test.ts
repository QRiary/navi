import { describe, expect, it } from 'vitest';
import { comboAutoName, comboNamePart, isOldDefaultComboName } from './advanced';

describe('combo default names', () => {
  it('takes the readable name when it is plain ASCII, else the QMK expression without KC_', () => {
    expect(comboNamePart('J', 'KC_J')).toBe('J');
    expect(comboNamePart('Space · hold Num', 'LT(1, 0xC3)')).toBe('SPACE_HOLD_NUM');
    expect(comboNamePart('Ctrl+Z', 'C(KC_Z)')).toBe('CTRL_Z');
    expect(comboNamePart('!', 'KC_EXLM')).toBe('EXLM');
    expect(comboNamePart('Пробел', 'KC_SPC')).toBe('SPC');
    expect(comboNamePart('TD 3', 'TD(3)')).toBe('TD_3');
  });

  it('cuts a long piece without a trailing underscore', () => {
    const part = comboNamePart('Very long alias name here', 'KC_A');
    expect(part.length).toBeLessThanOrEqual(16);
    expect(part.endsWith('_')).toBe(false);
  });

  it('builds CM_<keys>_<result> and stays unique', () => {
    expect(comboAutoName(['J', 'K'], 'ESC', new Set())).toBe('CM_J_K_ESC');
    expect(comboAutoName(['J', 'K'], null, new Set())).toBe('CM_J_K');
    expect(comboAutoName(['J', 'K'], 'ESC', new Set(['CM_J_K_ESC', 'CM_J_K_ESC_2']))).toBe('CM_J_K_ESC_3');
    expect(comboAutoName([], null, new Set())).toBe('CM');
    expect(comboAutoName(['ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP'], 'X', new Set()).length).toBeLessThanOrEqual(48);
  });

  it('knows the old combo_N defaults', () => {
    expect(isOldDefaultComboName('combo_12')).toBe(true);
    expect(isOldDefaultComboName('CM_HM_END')).toBe(false);
  });
});
