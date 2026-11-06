/**
 * The firmware-status sentence at the top of an Advanced tab (tap dance, combos, overrides, leader, unicode): whether
 * the feature goes into the user's own build, why, and what it takes to work on the keyboard. Plain sentences, so
 * "Current firmware: UNKNOWN · your build: off" never has to be decoded.
 */
import type { KeycodeSpec } from '../keycodes/spec';
import { activeKeymap } from '../project/ops';
import type { Project } from '../project/types';
import { FEATURE_BY_ID, featureStatus, type FeatureId, type HardwareFacts, type Text } from './registry';
import { requiredFeatures } from './required';

export type BuildNoteState = 'in-use' | 'turned-on' | 'not-yet' | 'unsupported';

export interface BuildNote {
  state: BuildNoteState;
  /** The whole note, one or two sentences. */
  text: Text;
}

/** True when the generator turns the feature on in rules.mk by itself (generate.ts: hasTd, hasCombos, leaders…). */
function inUse(project: Project, feature: FeatureId, spec: KeycodeSpec): boolean {
  if (feature === 'leader') return project.leaderSequences.length > 0;
  if (feature === 'unicodemap') return project.firmware.unicode === 'unicodemap' && project.unicodeMap.length > 0;
  return requiredFeatures(project, activeKeymap(project), spec).has(feature);
}

/**
 * `firstUse`: what turns the feature on by itself, finishing "…it's turned on by itself when you …"
 * (default: "add the first one here").
 */
export function buildNote(project: Project, feature: FeatureId, spec: KeycodeSpec, hw: HardwareFacts, firstUse?: Text): BuildNote {
  const info = FEATURE_BY_ID.get(feature);
  const name: Text = info?.title ?? { en: feature, ru: feature };
  const st = featureStatus(feature, project.firmware.flags, hw);
  if (st.state === 'unsupported')
    return {
      state: 'unsupported',
      text: {
        en: `${name.en}: ${st.reason.en}`,
        ru: `${name.ru}: ${st.reason.ru}`,
      },
    };

  const onKeyboard: Text =
    st.state === 'available'
      ? {
          en: 'The firmware on the keyboard has it too.',
          ru: 'В прошивке на клавиатуре это тоже есть.',
        }
      : {
          en: 'It works on the keyboard once you build and flash your firmware (Firmware → build).',
          ru: 'На клавиатуре это заработает, когда вы соберёте и прошьёте свою прошивку (Прошивка → сборка).',
        };
  const join = (a: Text, b: Text): Text => ({
    en: `${a.en} ${b.en}`,
    ru: `${a.ru} ${b.ru}`,
  });

  if (inUse(project, feature, spec)) {
    return {
      state: 'in-use',
      text: join(
        {
          en: `${name.en}: in your build, the project uses it.`,
          ru: `${name.ru}: в вашей сборке, проект это использует.`,
        },
        onKeyboard,
      ),
    };
  }
  if (project.firmware.buildFeatures[feature] === true) {
    return {
      state: 'turned-on',
      text: join(
        {
          en: `${name.en}: turned on in your build.`,
          ru: `${name.ru}: включено в вашей сборке.`,
        },
        onKeyboard,
      ),
    };
  }
  const when = firstUse ?? {
    en: 'add the first one here',
    ru: 'добавите первый элемент здесь',
  };
  return {
    state: 'not-yet',
    text: {
      en: `${name.en}: not in your build yet. It turns on by itself when you ${when.en}.`,
      ru: `${name.ru}: пока нет в вашей сборке. Включится само, когда вы ${when.ru}.`,
    },
  };
}
