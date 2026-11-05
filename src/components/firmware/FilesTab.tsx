/**
 * Firmware → files: keymap.c, rules.mk, config.h from the project. Before writing to qmk_firmware —
 * a diff against what is already on disk; the previous files are copied to a backup folder.
 */
import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileCode2, Save } from 'lucide-react';
import { generateKeymap, viaInBuild } from '../../core/qmk/generate';
import { effectiveMaxBrightness, rgbTargetDefaults } from '../../core/lighting/buildDefaults';
import { diffLines, diffStats } from '../../core/qmk/textDiff';
import { activeKeymap } from '../../core/project/ops';
import { navi } from '../../desktop/bridge';
import { saveTextFile } from '../../lib/files';
import { useProjectStore, useSpec } from '../../store/projectStore';
import { useQmkStore } from '../../store/qmkStore';
import { toast } from '../../store/toastStore';
import { getLanguage, t } from '../../i18n';
import { CustomLines } from './CustomLines';

const ICON = { size: 14, strokeWidth: 1.5 };

/** Which own-lines panel belongs to a generated file (navi.h has none). */
const CUSTOM_FILE_OF: Record<string, 'keymap.c' | 'rules.mk' | 'config.h'> = {
  'keymap.c': 'keymap.c',
  'rules.mk': 'rules.mk',
  'config.h': 'config.h',
  'navi_rules.mk': 'rules.mk',
  'navi_config.h': 'config.h',
};

export function useGenerated() {
  const project = useProjectStore((s) => s.project);
  const spec = useSpec();
  const info = useQmkStore((s) => s.sources?.info);
  const ownCode = useQmkStore((s) => s.ownCode);
  return useMemo(() => {
    if (!project) return null;
    const via = viaInBuild(project);
    const encoderCount = info?.encoders ?? project.hardware.encoders.count ?? Math.max(0, ...activeKeymap(project).layers.map((l) => l.encoders.length));
    const maxBrightness = effectiveMaxBrightness(rgbTargetDefaults(info), project.firmware.buildConfig);
    const own = ownCode && ownCode.keyboard === project.firmware.keyboard && ownCode.keymap === project.firmware.keymap ? ownCode.files : null;
    return generateKeymap({ project, keymap: activeKeymap(project), spec, via, encoderCount, maxBrightness, ownCode: own });
  }, [project, spec, info, ownCode]);
}

export function FilesTab() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const env = useQmkStore((s) => s.env);
  const keymapSources = useQmkStore((s) => s.keymapSources);
  const sources = useQmkStore((s) => s.sources);
  const loadSources = useQmkStore((s) => s.loadSources);
  const generated = useGenerated();
  const [selected, setFile] = useState('keymap.c');
  const [confirm, setConfirm] = useState(false);
  const [writing, setWriting] = useState(false);
  const lang = getLanguage();

  useEffect(() => {
    if (project?.firmware.keyboard && env?.homeValid && !sources) void loadSources(project.firmware.keyboard, project.firmware.keymap);
  }, [project, env, sources, loadSources]);

  if (!project || !generated) return null;
  // The selected file may be gone after a mode switch: fall back to keymap.c.
  const current = generated.files.find((f) => f.name === selected) ?? generated.files.find((f) => f.name === 'keymap.c') ?? generated.files[0]!;
  const file = current.name;
  const pipeline = project.firmware.pipeline;
  const pipelineOn = pipeline?.enabled === true;
  const customFile = CUSTOM_FILE_OF[file] ?? null;
  const onDisk = keymapSources?.files.find((f) => f.name === file)?.text ?? null;
  const diff = onDisk !== null ? diffLines(onDisk, current.text) : null;
  const changedFiles = generated.files.filter((f) => (keymapSources?.files.find((x) => x.name === f.name)?.text ?? null) !== f.text);
  const errors = generated.issues.filter((i) => i.level === 'error');
  const matrixMismatch = sources?.info.matrix && (sources.info.matrix.rows !== project.hardware.matrix.rows || sources.info.matrix.cols !== project.hardware.matrix.cols);
  const rootName = keymapSources?.root === 'userspace' ? 'userspace' : 'qmk_firmware';
  const canWrite = !!navi && !!env?.homeValid && !!project.firmware.keyboard && errors.length === 0 && !matrixMismatch;
  const via = viaInBuild(project);
  // Errors of the current file's own lines are already shown in the “own lines” panel.
  const otherIssues = generated.issues.filter((i) => !(customFile && i.where.startsWith(`${customFile} · own`)));

  const write = async () => {
    if (!navi || !env?.home || !project.firmware.keyboard) return;
    setWriting(true);
    try {
      const res = await navi.qmk.writeKeymap(env.home, env.userspace, project.firmware.keyboard, project.firmware.keymap, generated.files.map((f) => ({ name: f.name, text: f.text })));
      toast(res.backup ? t(`Written. Backup: ${res.backup}`, `Записано. Резервная копия: ${res.backup}`) : t('Written (new keymap folder)', 'Записано (новая папка keymap)'));
      await loadSources(project.firmware.keyboard, project.firmware.keymap);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setWriting(false);
      setConfirm(false);
    }
  };

  return (
    <div className="page">
      <div className="toolbar">
        <div className="field-row">
          <label className="checkbox" title={t('Off — pure QMK: everything is in these files, changes need a new build and flashing. On — VIA: the keymap can also be changed over USB without flashing.', 'Выкл. — чистый QMK: всё в этих файлах, изменения — новой сборкой и прошивкой. Вкл. — VIA: раскладку можно менять и по USB без перепрошивки.')}>
            <input type="checkbox" checked={via} onChange={(e) => apply((p) => ({ ...p, firmware: { ...p.firmware, buildFeatures: { ...p.firmware.buildFeatures, via: e.target.checked } } }), 'VIA')} /> VIA <span className="kicker">{via ? t('on', 'вкл.') : t('off — pure QMK', 'выкл. — чистый QMK')}</span>
          </label>
          <label
            className="checkbox"
            style={{ whiteSpace: 'nowrap' }}
            title={t(
              "Off — NAVI's hooks (process_record_user, combos, tap dance…) are written into keymap.c as usual. On — they become *_navi functions that your own code calls, and NAVI also writes navi.h, navi_rules.mk and navi_config.h. Your rules.mk and config.h must include navi_rules.mk / navi_config.h once.",
              'Выкл. — хуки NAVI (process_record_user, комбо, tap dance…) пишутся в keymap.c как обычно. Вкл. — они становятся функциями *_navi, которые вызывает ваш код; NAVI также пишет navi.h, navi_rules.mk и navi_config.h. Ваши rules.mk и config.h должны один раз подключить navi_rules.mk / navi_config.h.',
            )}
          >
            <input
              type="checkbox"
              checked={pipelineOn}
              onChange={(e) => apply((p) => ({ ...p, firmware: { ...p.firmware, pipeline: { headers: p.firmware.pipeline?.headers ?? [], enabled: e.target.checked } } }), t('own pipeline', 'свой pipeline'))}
            />{' '}
            {t('own pipeline', 'свой pipeline')} {!pipelineOn && <span className="kicker">{t('off', 'выкл.')}</span>}
          </label>
          {pipelineOn && <span className="kicker" style={{ flexBasis: '100%' }}>{t('NAVI writes keymap.c, navi.h, navi_rules.mk, navi_config.h — your rules.mk / config.h stay yours', 'NAVI пишет keymap.c, navi.h, navi_rules.mk, navi_config.h — ваши rules.mk / config.h остаются вашими')}</span>}
          {pipelineOn && (
            <label className="field-row">
              <span className="field-label">{t('headers at the top of keymap.c', 'заголовки в начале keymap.c')}</span>
              <input
                key={(pipeline?.headers ?? []).join(' ')}
                className="input"
                defaultValue={(pipeline?.headers ?? []).join(' ')}
                placeholder="my_keycodes.h"
                spellCheck={false}
                onBlur={(e) => {
                  const headers = e.target.value.split(/\s+/).filter(Boolean).slice(0, 20);
                  if (headers.join(' ') !== (pipeline?.headers ?? []).join(' ')) apply((p) => ({ ...p, firmware: { ...p.firmware, pipeline: { enabled: p.firmware.pipeline?.enabled ?? true, headers } } }), t('pipeline headers', 'заголовки pipeline'));
                }}
              />
            </label>
          )}
          <span className="kicker">
            {project.firmware.keyboard ? `${keymapSources ? `${rootName} · ` : ''}keyboards/${project.firmware.keyboard}/keymaps/${project.firmware.keymap}/` : t('no target chosen (tab “keyboard”)', 'target не выбран (вкладка «клавиатура»)')}
          </span>
        </div>
        <div className="toolbar-actions">
          <button className="btn" onClick={() => void navigator.clipboard.writeText(current.text).then(() => toast(t('Copied', 'Скопировано')))}>
            <Copy {...ICON} /> {t('copy', 'копировать')}
          </button>
          <button className="btn" onClick={() => void saveTextFile(current.name, current.text, [{ name: current.name, extensions: [current.name.split('.').pop()!] }])}>
            <Download {...ICON} /> {t('save as…', 'сохранить как…')}
          </button>
          <button className="btn btn--primary" disabled={!canWrite || changedFiles.length === 0 || writing} onClick={() => setConfirm(true)}>
            <Save {...ICON} /> {t(`write to ${rootName}`, `записать в ${rootName}`)}
          </button>
        </div>
      </div>
      {matrixMismatch && (
        <div className="notice" style={{ borderColor: 'var(--danger-color)' }}>
          <span>
            {t('The target matrix', 'Матрица target')} {sources!.info.matrix!.rows}×{sources!.info.matrix!.cols} {t('differs from the project', 'не совпадает с проектом')} {project.hardware.matrix.rows}×{project.hardware.matrix.cols}{' '}
            — {t('the keymap would not compile. Choose another target or fix the matrix.', 'keymap не соберётся. Выберите другой target или поправьте матрицу.')}
          </span>
        </div>
      )}
      <div className="tabs" role="tablist">
        {generated.files.map((f) => {
          const disk = keymapSources?.files.find((x) => x.name === f.name)?.text ?? null;
          const st = disk === null ? t('new', 'новый') : disk === f.text ? t('same', 'без изм.') : (() => {
            const d = diffStats(diffLines(disk, f.text));
            return `+${d.added} −${d.removed}`;
          })();
          return (
            <button key={f.name} className={`tab ${file === f.name ? 'is-active' : ''}`} onClick={() => setFile(f.name)}>
              <FileCode2 size={12} strokeWidth={1.5} /> {f.name} <span className="kicker">{st}</span>
            </button>
          );
        })}
      </div>
      {diff ? (
        <div className="diff" aria-label={t('Changes', 'Изменения')}>
          {diff.map((l, i) =>
            l.kind === 'skip' ? (
              <div key={i} className="d-hunk">
                ⋯ {l.count} {t('unchanged lines', 'строк без изменений')}
              </div>
            ) : (
              <div key={i} className={l.kind === 'add' ? 'd-add' : l.kind === 'del' ? 'd-del' : undefined}>
                {l.kind === 'add' ? '+ ' : l.kind === 'del' ? '- ' : '  '}
                {l.text}
              </div>
            ),
          )}
        </div>
      ) : (
        <pre className="mono-block" style={{ maxHeight: '50vh', overflow: 'auto', whiteSpace: 'pre' }}>
          {current.text}
        </pre>
      )}
      {customFile && <CustomLines file={customFile} generatedSymbols={generated.symbols} />}
      {otherIssues.length > 0 && (
        <ul className="issue-list" style={{ marginTop: 8 }}>
          {otherIssues.map((i, n) => (
            <li key={n} className={`issue issue--${i.level}`}>
              <span className="issue-where">{i.where}</span>
              {lang === 'ru' ? i.message.ru : i.message.en}
            </li>
          ))}
        </ul>
      )}
      {confirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <h2>{t('write keymap files', 'запись файлов keymap')}</h2>
            </div>
            <div className="modal-body">
              <p className="field-hint">
                {t('These files will be written to', 'Будут записаны файлы в')} <code>{keymapSources?.dir}</code>:
              </p>
              <ul className="steps-list">
                {changedFiles.map((f) => (
                  <li key={f.name}>
                    <strong>{f.name}</strong> — {keymapSources?.files.some((x) => x.name === f.name) ? t('replaced (old copy goes to backups)', 'заменяется (старая копия — в резервную папку)') : t('new file', 'новый файл')}
                  </li>
                ))}
              </ul>
              {pipelineOn && <p className="field-hint">{t("rules.mk and config.h are yours: NAVI doesn't touch them.", 'rules.mk и config.h ваши: NAVI их не трогает.')}</p>}
              <p className="field-hint">{t('Other files in the folder are not touched.', 'Другие файлы в папке не трогаются.')}</p>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setConfirm(false)} disabled={writing}>
                {t('cancel', 'отмена')}
              </button>
              <button className="btn btn--primary" onClick={() => void write()} disabled={writing}>
                {writing ? t('writing…', 'запись…') : t('write', 'записать')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
