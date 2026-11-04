/**
 * Firmware → keyboard in QMK (keyboard target) and keymap: choice from qmk_firmware/keyboards,
 * reading the sources (matrix, controller, bootloader, features), comparison with the project.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { effectListFromAnimations } from '../../core/lighting/effects';
import { patchProject } from '../../core/project/ops';
import { useProjectStore } from '../../store/projectStore';
import { useQmkStore } from '../../store/qmkStore';
import { toast } from '../../store/toastStore';
import { OwnTarget } from './OwnTarget';
import { t } from '../../i18n';

export function TargetTab() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const env = useQmkStore((s) => s.env);
  const keyboards = useQmkStore((s) => s.keyboards);
  const sources = useQmkStore((s) => s.sources);
  const keymapSources = useQmkStore((s) => s.keymapSources);
  const loadKeyboards = useQmkStore((s) => s.loadKeyboards);
  const loadSources = useQmkStore((s) => s.loadSources);
  const error = useQmkStore((s) => s.error);
  const [query, setQuery] = useState(project?.firmware.keyboard ?? '');
  const [keymap, setKeymap] = useState(project?.firmware.keymap ?? 'navi');

  useEffect(() => {
    if (env?.homeValid && !keyboards) void loadKeyboards();
  }, [env, keyboards, loadKeyboards]);
  useEffect(() => {
    if (project?.firmware.keyboard && env?.homeValid && (sources?.keyboard !== project.firmware.keyboard || sources?.keymap !== project.firmware.keymap)) void loadSources(project.firmware.keyboard, project.firmware.keymap);
  }, [project?.firmware.keyboard, project?.firmware.keymap, env, sources?.keyboard, sources?.keymap, loadSources]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!keyboards || q.length < 2) return [];
    return keyboards.filter((k) => k.toLowerCase().includes(q)).slice(0, 60);
  }, [keyboards, query]);

  if (!project) return null;
  if (!env?.homeValid)
    return (
      <div className="page">
        <p className="field-hint">{t('Set up QMK first (tab “environment”) to choose an existing target. Your own target can be prepared already:', 'Чтобы выбрать существующий target, сначала настройте QMK (вкладка «окружение»). Свой target можно подготовить уже сейчас:')}</p>
        <OwnTarget />
      </div>
    );

  const info = sources?.info;
  const matrixOk = info?.matrix ? info.matrix.rows === project.hardware.matrix.rows && info.matrix.cols === project.hardware.matrix.cols : null;
  const usb = (info?.info.usb ?? {}) as Record<string, unknown>;
  const vid = typeof usb.vid === 'string' ? Number.parseInt(usb.vid, 16) : null;
  const pid = typeof usb.pid === 'string' ? Number.parseInt(usb.pid, 16) : null;
  const sameUsb = vid !== null && pid !== null && project.hardware.usb.vid !== null ? vid === project.hardware.usb.vid && pid === project.hardware.usb.pid : null;

  const choose = (kb: string) => {
    setQuery(kb);
    apply((p) => patchProject(p, { firmware: { ...p.firmware, keyboard: kb, keymap } }), t('firmware target', 'target прошивки'));
    void loadSources(kb, keymap);
  };

  const adoptAsCurrent = () => {
    if (!info) return;
    const at = new Date().toISOString();
    apply((p) => {
      const anim = ((info.info.rgb_matrix as Record<string, unknown> | undefined)?.animations ?? null) as Record<string, boolean> | null;
      return {
        ...p,
        hardware: {
          ...p.hardware,
          processor: info.processor ?? p.hardware.processor,
          bootloader: info.bootloader ?? p.hardware.bootloader,
          facts: [...p.hardware.facts, { key: 'firmware.source', value: `${sources!.keyboard}:${keymap}`, evidence: 'source' as const, at }],
        },
        firmware: { ...p.firmware, flags: { ...p.firmware.flags, ...info.flags } },
        lighting: anim ? { ...p.lighting, rgbMatrixEffects: effectListFromAnimations(anim), effectsEvidence: 'source' } : p.lighting,
      };
    }, t('firmware facts from source', 'факты из исходников'));
    toast(t('Facts about the current firmware are taken from these sources', 'Факты о текущей прошивке взяты из этих исходников'));
  };

  return (
    <div className="page">
      <div className="grid-2">
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('keyboard target', 'клавиатура в QMK (target)')}</span>
            <span className="kicker">{keyboards ? `${keyboards.length} ${t('in qmk_firmware', 'в qmk_firmware')}` : '…'}</span>
          </div>
          <div className="panel-box-body field">
            <label className="search-box" style={{ maxWidth: 'none' }}>
              <Search size={14} strokeWidth={1.5} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="bastardkb/dilemma/4x6_4" spellCheck={false} aria-label={t('Keyboard target', 'Target клавиатуры')} />
            </label>
            {matches.length > 0 && query !== project.firmware.keyboard && (
              <div className="layer-stack" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {matches.map((k) => (
                  <button key={k} className="layer-stack-row" style={{ gridTemplateColumns: '1fr' }} onClick={() => choose(k)}>
                    {k}
                  </button>
                ))}
              </div>
            )}
            <label className="field">
              <span className="field-label">keymap</span>
              <input
                className="input"
                value={keymap}
                onChange={(e) => setKeymap(e.target.value.replace(/[^a-z0-9_-]/gi, '_'))}
                onBlur={() => apply((p) => patchProject(p, { firmware: { ...p.firmware, keymap } }), 'keymap')}
              />
            </label>
            <p className="field-hint">
              {keymapSources ? (
                <>
                  {t('Builds from', 'Собирается из')} <code>{keymapSources.dir}</code> <span className="kicker">{keymapSources.root === 'userspace' ? 'userspace' : 'qmk_firmware'}</span>
                </>
              ) : (
                <>
                  {t('Your keymap lives in', 'Ваш keymap будет в')} <code>keyboards/{project.firmware.keyboard ?? '…'}/keymaps/{keymap}/</code>
                </>
              )}
              {keymapSources?.exists ? t(' — the folder exists (files will be compared before writing).', ' — папка уже есть (файлы сравниваются перед записью).') : t(' — a new folder.', ' — новая папка.')}
            </p>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('what the source says', 'что в исходниках')}</span>
          </div>
          <div className="panel-box-body field">
            {info ? (
              <>
                <dl className="kv">
                  <dt>{t('name', 'название')}</dt>
                  <dd>{String(info.info.keyboard_name ?? sources!.keyboard)}</dd>
                  <dt>{t('matrix', 'матрица')}</dt>
                  <dd>
                    {info.matrix ? `${info.matrix.rows} × ${info.matrix.cols}` : '?'}{' '}
                    {matrixOk === false && <span className="badge badge--warn">{t('≠ project', '≠ проект')}</span>}
                    {matrixOk && <span className="badge badge--ok">= {t('project', 'проект')}</span>}
                  </dd>
                  <dt>MCU</dt>
                  <dd>{info.processor ?? '?'}</dd>
                  <dt>{t('bootloader', 'загрузчик')}</dt>
                  <dd>{info.bootloader ?? '?'}</dd>
                  <dt>USB</dt>
                  <dd>
                    {vid !== null ? `0x${vid.toString(16).toUpperCase()}:0x${(pid ?? 0).toString(16).toUpperCase()}` : '?'}{' '}
                    {sameUsb === false && <span className="badge badge--warn">{t('≠ your keyboard', '≠ ваша клавиатура')}</span>}
                  </dd>
                  <dt>{t('split / encoders', 'сплит / энкодеры')}</dt>
                  <dd>
                    {info.split ? 'split' : '—'} · {info.encoders ?? 0}
                  </dd>
                  <dt>{t('features on', 'включено')}</dt>
                  <dd>
                    {Object.entries(info.flags)
                      .filter(([, f]) => f?.state === 'on' && f.evidence === 'source')
                      .map(([k]) => k)
                      .join(', ') || '—'}
                  </dd>
                </dl>
                {info.warnings.map((w, i) => (
                  <p key={i} className="field-hint" style={{ color: 'var(--danger-color)' }}>
                    {w}
                  </p>
                ))}
                {sameUsb === false && (
                  <div className="notice" style={{ borderColor: 'var(--danger-color)' }}>
                    <span>
                      {t(
                        'These sources describe a keyboard with another USB ID. Flashing firmware built for another board can make your keyboard stop working until you flash the right firmware again (on RP2040 the bootloader in ROM cannot be damaged).',
                        'Эти исходники описывают клавиатуру с другим USB ID. Прошивка, собранная для другой платы, может сделать вашу клавиатуру неработающей, пока не прошить правильную (у RP2040 загрузчик в ПЗУ, его не повредить).',
                      )}
                    </span>
                  </div>
                )}
                <button className="btn" onClick={adoptAsCurrent} title={t('Only if exactly this firmware is on your keyboard', 'Только если на клавиатуре именно эта прошивка')}>
                  {t('this firmware is on my keyboard → take its facts', 'эта прошивка стоит на клавиатуре → взять её факты')}
                </button>
              </>
            ) : (
              <p className="field-hint">{error ?? t('Choose a keyboard target.', 'Выберите target клавиатуры.')}</p>
            )}
          </div>
        </section>
      </div>
      {project.hardware.usb.vid === 0xafc5 && (
        <div className="notice">
          <span>
            {t(
              'Your keyboard (lucky_studio Dilemma_4X6) is a clone with its own firmware: it is not in QMK. The closest official target is bastardkb/dilemma/4x6_4 (Dilemma Max: same 10×6 matrix, RP2040 and key positions as on your photo). Not confirmed: the board pins and the column order of the right half (in the seller’s firmware the inner column is 0, in the official one it is 5 — the right half may come out mirrored). Before trying your build on the keyboard, save its current firmware (tab “flash”) — that copy brings everything back.',
              'Ваша клавиатура (lucky_studio Dilemma_4X6) — клон со своей прошивкой: в QMK её нет. Ближайший официальный target — bastardkb/dilemma/4x6_4 (Dilemma Max: та же матрица 10×6, RP2040 и расположение клавиш как на вашем фото). Не подтверждены: выводы платы и порядок колонок правой половины (у продавца внутренняя колонка — 0, в официальной — 5: правая половина может оказаться зеркальной). Прежде чем пробовать свою сборку на клавиатуре, сохраните её текущую прошивку (вкладка «прошить») — эта копия вернёт всё как было.',
            )}
          </span>
        </div>
      )}
      <OwnTarget />
    </div>
  );
}
