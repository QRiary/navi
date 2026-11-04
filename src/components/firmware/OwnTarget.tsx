/**
 * Firmware → keyboard → “own target”: keyboard.json + config.h + readme.md from the project
 * (hardware profile, board pins, geometry). Before writing — a diff against what is already
 * in qmk_firmware; previous files go to a backup folder.
 */
import { useEffect, useMemo, useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { generateKeyboardTarget } from '../../core/qmk/keyboardDef';
import { diffLines, diffStats } from '../../core/qmk/textDiff';
import { activeGeometry, patchProject } from '../../core/project/ops';
import { navi } from '../../desktop/bridge';
import { href } from '../../lib/router';
import { useProjectStore } from '../../store/projectStore';
import { useQmkStore } from '../../store/qmkStore';
import { toast } from '../../store/toastStore';
import { getLanguage, t } from '../../i18n';

export function OwnTarget() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const env = useQmkStore((s) => s.env);
  const loadSources = useQmkStore((s) => s.loadSources);
  const loadKeyboards = useQmkStore((s) => s.loadKeyboards);
  const [existing, setExisting] = useState<Record<string, string> | null>(null);
  const [file, setFile] = useState<'keyboard.json' | 'config.h' | 'readme.md'>('keyboard.json');
  const [busy, setBusy] = useState(false);
  const lang = getLanguage();
  const gen = useMemo(() => (project ? generateKeyboardTarget(project, activeGeometry(project)) : null), [project]);
  const target = project?.hardware.pins?.target ?? '';

  useEffect(() => {
    if (!navi || !env?.homeValid || !target) return setExisting(null);
    navi.qmk
      .readKeyboard(env.home!, env.userspace, target)
      .then((src) => setExisting(Object.fromEntries(src.files.filter((f) => f.path.startsWith(`${target}/`) && !f.path.slice(target.length + 1).includes('/')).map((f) => [f.path.split('/').pop()!, f.text]))))
      .catch(() => setExisting({}));
  }, [env, target]);

  if (!project || !gen) return null;
  if (!project.hardware.pins) {
    return (
      <p className="field-hint">
        {t('To create your own target, describe the board pins first:', 'Чтобы создать свой target, сначала опишите выводы платы:')} <a href={href({ section: 'hardware', tab: 'pins' })}>{t('Hardware → pins', 'Железо → выводы')}</a>.
      </p>
    );
  }
  const errors = gen.issues.filter((i) => i.level === 'error');
  const current = gen.files.find((f) => f.name === file)!;
  const old = existing?.[file] ?? null;
  const d = old !== null ? diffLines(old, current.text) : null;

  const write = async () => {
    if (!navi || !env?.home) return;
    setBusy(true);
    try {
      const res = await navi.qmk.writeKeyboard(env.home, target, gen.files.map((f) => ({ name: f.name, text: f.text })));
      toast(res.backup ? t(`Target written. Backup: ${res.backup}`, `Target записан. Резервная копия: ${res.backup}`) : t('Target created', 'Target создан'));
      apply((p) => patchProject(p, { firmware: { ...p.firmware, keyboard: target } }), t('own target', 'свой target'));
      await loadKeyboards();
      await loadSources(target, project.firmware.keymap);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2>{t('own keyboard target', 'свой target клавиатуры')}</h2>
        <span className="kicker">keyboards/{target}/</span>
      </div>
      <ul className="issue-list" style={{ marginBottom: 8 }}>
        {gen.issues.map((i, n) => (
          <li key={n} className={`issue issue--${i.level}`}>
            <span className="issue-where">{i.level === 'error' ? 'err' : 'note'}</span>
            {lang === 'ru' ? i.message.ru : i.message.en}
          </li>
        ))}
      </ul>
      <div className="tabs" role="tablist">
        {gen.files.map((f) => {
          const prev = existing?.[f.name] ?? null;
          const st = prev === null ? t('new', 'новый') : prev === f.text ? t('same', 'без изм.') : (() => {
            const s = diffStats(diffLines(prev, f.text));
            return `+${s.added} −${s.removed}`;
          })();
          return (
            <button key={f.name} className={`tab ${file === f.name ? 'is-active' : ''}`} onClick={() => setFile(f.name)}>
              {f.name} <span className="kicker">{st}</span>
            </button>
          );
        })}
      </div>
      {d ? (
        <div className="diff">
          {d.map((l, i) =>
            l.kind === 'skip' ? (
              <div key={i} className="d-hunk">
                ⋯ {l.count}
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
        <pre className="mono-block" style={{ maxHeight: '40vh', overflow: 'auto', whiteSpace: 'pre' }}>
          {current.text}
        </pre>
      )}
      <div className="field-row" style={{ marginTop: 8 }}>
        <button className="btn btn--primary" disabled={!navi || !env?.homeValid || errors.length > 0 || busy} onClick={() => void write()}>
          <FilePlus2 size={14} strokeWidth={1.5} /> {busy ? t('writing…', 'запись…') : t('write target to qmk_firmware', 'записать target в qmk_firmware')}
        </button>
        {!env?.homeValid && <span className="field-hint">{t('needs QMK (tab “environment”)', 'нужен QMK (вкладка «окружение»)')}</span>}
      </div>
    </section>
  );
}
