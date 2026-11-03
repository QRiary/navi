/**
 * LIGHTING IN YOUR OWN BUILD (pure QMK, no VIA): defaults are written to config.h —
 * RGB_MATRIX_DEFAULT_ON / _MODE / _HUE / _SAT / _VAL / _SPD (stored in firmware.buildConfig).
 * The keyboard remembers lighting changed with RM_* keys; it takes the firmware values
 * when its memory is empty (first flash with other settings or an EE_CLR reset).
 */
import { Slider } from '../Slider';
import { buildLightingFrom, BUILD_LIGHTING_KEYS as KEYS, effectiveMaxBrightness, QMK_RGB_DEFAULTS, rgbTargetDefaults, type BuildLightingKey as Key } from '../../core/lighting/buildDefaults';
import { effectName, humanEffect, RGB_MATRIX_EFFECTS } from '../../core/lighting/effects';
import type { LightingState, Project } from '../../core/project/types';
import { useProjectStore } from '../../store/projectStore';
import { useQmkStore } from '../../store/qmkStore';
import { t } from '../../i18n';


function num(v: unknown, fallback: number): number {
  return typeof v === 'number' ? v : fallback;
}

export function BuildLighting({ preset }: { preset: LightingState | null }) {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const sourceInfo = useQmkStore((s) => s.sources?.info);
  if (!project) return null;
  const bc = project.firmware.buildConfig;
  const isSet = KEYS.some((k) => k in bc);
  // As set by the keyboard itself (if a target is chosen and its files were read), otherwise the QMK values.
  const target = rgbTargetDefaults(sourceInfo);
  const limit = effectiveMaxBrightness(target, bc);
  const maxBrightness = limit ?? QMK_RGB_DEFAULTS.maxBrightness;
  const base = { val: target.val ?? maxBrightness, speed: target.speed ?? QMK_RGB_DEFAULTS.speed, hue: target.hue ?? QMK_RGB_DEFAULTS.hue, sat: target.sat ?? QMK_RGB_DEFAULTS.sat };

  const patch = (values: Partial<Record<Key, string | number | boolean | null>>, label: string) =>
    apply(
      (p: Project) => {
        const buildConfig = { ...p.firmware.buildConfig };
        for (const [k, v] of Object.entries(values)) {
          if (v === null) delete buildConfig[k];
          else buildConfig[k] = v;
        }
        return { ...p, firmware: { ...p.firmware, buildConfig } };
      },
      label,
      { coalesce: 'build-lighting' },
    );

  const mode = typeof bc.RGB_MATRIX_DEFAULT_MODE === 'string' ? bc.RGB_MATRIX_DEFAULT_MODE.replace(/^RGB_MATRIX_/, '') : '';
  const presetName = preset ? effectName(project.lighting.rgbMatrixEffects, preset.effect) : null;

  return (
    <section className="panel-box" style={{ marginTop: 'var(--gap)' }}>
      <div className="panel-box-head">
        <span className="cell-label">{t('in your build (pure QMK)', 'в своей сборке (чистый QMK)')}</span>
        <span className="kicker">config.h</span>
      </div>
      <div className="panel-box-body field">
        <p className="field-hint">
          {t(
            'Without VIA the app cannot change lighting live — it is set in the firmware. These values go into config.h of your build. The keyboard remembers lighting changed with RM_* keys; it starts from these values when its memory is empty (press EE_CLR once after flashing to reset it).',
            'Без VIA приложение не меняет подсветку вживую — она задаётся в прошивке. Эти значения попадают в config.h вашей сборки. Подсветку, изменённую клавишами RM_*, клавиатура запоминает; с этих значений она начинает, когда её память пуста (после прошивки один раз нажмите EE_CLR, чтобы сбросить память).',
          )}
        </p>
        <label className="checkbox">
          <input type="checkbox" checked={bc.RGB_MATRIX_DEFAULT_ON !== false} onChange={(e) => patch({ RGB_MATRIX_DEFAULT_ON: e.target.checked }, t('lighting on by default', 'подсветка включена по умолчанию'))} />{' '}
          {t('lighting on after power-up', 'подсветка включена при включении')}
        </label>
        <div className="field">
          <span className="field-label">{t('effect', 'эффект')}</span>
          <select className="select" value={mode} onChange={(e) => patch({ RGB_MATRIX_DEFAULT_MODE: e.target.value ? `RGB_MATRIX_${e.target.value}` : null }, t('default effect', 'эффект по умолчанию'))} aria-label={t('Default effect', 'Эффект по умолчанию')}>
            <option value="">{t('— as set by the keyboard —', '— как задано у клавиатуры —')}</option>
            {RGB_MATRIX_EFFECTS.map((e) => (
              <option key={e.id} value={e.id}>
                {humanEffect(e.id)}
              </option>
            ))}
          </select>
          {mode && !project.lighting.rgbMatrixEffects?.includes(mode) && (
            <span className="field-hint">{t('This effect will also be enabled in the build (ENABLE_RGB_MATRIX_…).', 'Этот эффект будет ещё и включён в сборке (ENABLE_RGB_MATRIX_…).')}</span>
          )}
        </div>
        <div className="field">
          <span className="field-label">
            {t('brightness', 'яркость')} · {num(bc.RGB_MATRIX_DEFAULT_VAL, base.val)}
            {limit !== null ? ` / ${t('limit', 'предел')} ${limit}` : ''}
          </span>
          <Slider value={Math.min(num(bc.RGB_MATRIX_DEFAULT_VAL, base.val), maxBrightness)} min={0} max={maxBrightness} step={1} label={t('Default brightness', 'Яркость по умолчанию')} onChange={(v) => patch({ RGB_MATRIX_DEFAULT_VAL: v }, t('default brightness', 'яркость по умолчанию'))} />
        </div>
        <div className="field">
          <span className="field-label">
            {t('speed', 'скорость')} · {num(bc.RGB_MATRIX_DEFAULT_SPD, base.speed)}
          </span>
          <Slider value={num(bc.RGB_MATRIX_DEFAULT_SPD, base.speed)} min={0} max={255} step={1} label={t('Default speed', 'Скорость по умолчанию')} onChange={(v) => patch({ RGB_MATRIX_DEFAULT_SPD: v }, t('default speed', 'скорость по умолчанию'))} />
        </div>
        <div className="field">
          <span className="field-label">
            {t('color', 'цвет')} · H {num(bc.RGB_MATRIX_DEFAULT_HUE, base.hue)} · S {num(bc.RGB_MATRIX_DEFAULT_SAT, base.sat)}
          </span>
          <Slider value={num(bc.RGB_MATRIX_DEFAULT_HUE, base.hue)} min={0} max={255} step={1} label={t('Default hue', 'Оттенок по умолчанию')} onChange={(v) => patch({ RGB_MATRIX_DEFAULT_HUE: v }, t('default hue', 'оттенок по умолчанию'))} />
          <Slider value={num(bc.RGB_MATRIX_DEFAULT_SAT, base.sat)} min={0} max={255} step={1} label={t('Default saturation', 'Насыщенность по умолчанию')} onChange={(v) => patch({ RGB_MATRIX_DEFAULT_SAT: v }, t('default saturation', 'насыщенность по умолчанию'))} />
        </div>
        {limit === null && (
          <p className="field-hint">
            {t('The keyboard brightness limit is not known yet (choose the target in Firmware). Do not set the brightness higher than the keyboard maker allows.', 'Предел яркости клавиатуры пока неизвестен (выберите target в «Прошивке»). Не ставьте яркость выше, чем допускает производитель.')}
          </p>
        )}
        <div className="field-row">
          <button className="btn" disabled={!preset} onClick={() => preset && patch(buildLightingFrom(preset, project.lighting.rgbMatrixEffects, limit), t('lighting into the build', 'подсветка в сборку'))}>
            {t('take values from above', 'взять значения сверху')}
          </button>
          <button className="btn btn--ghost" disabled={!isSet} onClick={() => patch(Object.fromEntries(KEYS.map((k) => [k, null])), t('lighting from the keyboard', 'подсветка как у клавиатуры'))}>
            {t('as set by the keyboard', 'как задано у клавиатуры')}
          </button>
        </div>
        {preset && preset.effect !== 0 && !presetName && (
          <p className="field-hint">{t('The effect number above has no known name, so only the color, brightness and speed are taken. Choose the effect in the list.', 'У номера эффекта сверху нет известного названия, поэтому берутся только цвет, яркость и скорость. Эффект выберите в списке.')}</p>
        )}
      </div>
    </section>
  );
}
