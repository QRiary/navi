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
import { QMK_DOCS } from '../../lib/qmkDocs';
import { href } from '../../lib/router';
import { whyDisabled } from '../../lib/whyDisabled';
import { Hint } from '../InfoTip';
import { TabPanel, Tabs } from '../Tabs';
import { useProjectStore } from '../../store/projectStore';
import { useQmkStore } from '../../store/qmkStore';
import { toast, toastError } from '../../store/toastStore';
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
      .then((src) =>
        setExisting(Object.fromEntries(src.files.filter((f) => f.path.startsWith(`${target}/`) && !f.path.slice(target.length + 1).includes('/')).map((f) => [f.path.split('/').pop()!, f.text]))),
      )
      .catch(() => setExisting({}));
  }, [env, target]);

  if (!project || !gen) return null;
  if (!project.hardware.pins) {
    return (
      <p className="field-hint">
        {t('To create your own target, describe the board pins first:', 'Чтобы создать свой target, сначала опишите выводы платы:')}{' '}
        <a href={href({ section: 'hardware', tab: 'pins' })}>{t('Hardware → pins', 'Железо → выводы')}</a>.
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
      const res = await navi.qmk.writeKeyboard(
        env.home,
        target,
        gen.files.map((f) => ({ name: f.name, text: f.text })),
      );
      toast(res.backup ? t(`Target written. Backup: ${res.backup}`, `Target записан. Резервная копия: ${res.backup}`) : t('Target created', 'Target создан'));
      apply((p) => patchProject(p, { firmware: { ...p.firmware, keyboard: target } }), t('own target', 'свой target'));
      await loadKeyboards();
      await loadSources(target, project.firmware.keymap);
    } catch (err) {
      toastError(t('Couldn’t write the target files. Check the QMK folder is writable and try again.', 'Не удалось записать файлы target. Проверьте, что в папку QMK можно писать, и повторите.'), err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2>
          <Hint
            docs={QMK_DOCS.portingKeyboard}
            tip={t(
              'A target is a keyboard folder in qmk_firmware/keyboards. For a board QMK does not know, NAVI writes keyboard.json, config.h and readme.md there from your hardware profile, pins and geometry; you then build a keymap for it.',
              'Target — папка клавиатуры в qmk_firmware/keyboards. Для платы, которой QMK не знает, NAVI записывает туда keyboard.json, config.h и readme.md по вашему профилю железа, выводам и геометрии; затем для неё собирается раскладка.',
            )}
          >
            {t('own keyboard target', 'свой target клавиатуры')}
          </Hint>
        </h2>
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
      <Tabs
        idBase="target-files"
        label={t('Target files', 'Файлы target')}
        current={file}
        onSelect={(id) => setFile(id as typeof file)}
        items={gen.files.map((f) => {
          const prev = existing?.[f.name] ?? null;
          const st =
            prev === null
              ? t('new', 'новый')
              : prev === f.text
                ? t('same', 'без изм.')
                : (() => {
                    const s = diffStats(diffLines(prev, f.text));
                    return `+${s.added} −${s.removed}`;
                  })();
          return {
            id: f.name,
            label: (
              <>
                {f.name} <span className="kicker">{st}</span>
              </>
            ),
          };
        })}
      />
      <TabPanel idBase="target-files" id={file} current={file}>
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
      </TabPanel>
      <div className="field-row" style={{ marginTop: 8 }}>
        <button
          className="btn btn--primary"
          {...whyDisabled(
            (!navi && t('Writing files needs the desktop app', 'Для записи файлов нужно настольное приложение')) ||
              (!env?.homeValid && t('qmk_firmware not found: see the “setup” tab', 'qmk_firmware не найден: смотрите вкладку «окружение»')) ||
              (errors.length > 0 && t('Fix the errors listed above first', 'Сначала исправьте ошибки выше')) ||
              (busy && t('Wait: writing…', 'Подождите: идёт запись…')),
          )}
          onClick={() => void write()}
        >
          <FilePlus2 size={14} strokeWidth={1.5} /> {busy ? t('writing…', 'запись…') : t('write target to qmk_firmware', 'записать target в qmk_firmware')}
        </button>
        {!env?.homeValid && <span className="field-hint">{t('needs QMK (tab “environment”)', 'нужен QMK (вкладка «окружение»)')}</span>}
      </div>
    </section>
  );
}
