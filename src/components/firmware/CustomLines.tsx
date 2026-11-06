/**
 * The user's own lines at the end of keymap.c / rules.mk / config.h — checked line by line.
 * Code from an imported file must be reviewed and allowed first (firmware.customReview).
 */
import { useState } from 'react';
import { ShieldCheck, SquarePen } from 'lucide-react';
import { checkCustom, hasCustomCode, type CustomFile } from '../../core/qmk/customCode';
import { patchProject } from '../../core/project/ops';
import { useProjectStore } from '../../store/projectStore';
import { getLanguage, t } from '../../i18n';
import { Hint } from '../InfoTip';

const HINT: Record<CustomFile, { en: string; ru: string; placeholder: string }> = {
  'config.h': {
    en: '#define / #undef / #if… lines, added after the generated settings.',
    ru: 'Строки #define / #undef / #if…, добавляются после созданных настроек.',
    placeholder: '#define PERMISSIVE_HOLD\n#undef  TAPPING_TERM\n#define TAPPING_TERM 180',
  },
  'rules.mk': {
    en: 'NAME = value lines. Only feature flags and drivers (…_ENABLE, …_DRIVER, …_TYPE, SRC).',
    ru: 'Строки ИМЯ = значение. Только флаги и драйверы (…_ENABLE, …_DRIVER, …_TYPE, SRC).',
    placeholder: 'CONSOLE_ENABLE = yes\nLTO_ENABLE = yes',
  },
  'keymap.c': {
    en: 'C code added at the end of keymap.c (layer names and custom keycodes are already declared above). It runs on the keyboard.',
    ru: 'Код на C в конце keymap.c (имена слоёв и свои keycodes уже объявлены выше). Выполняется на клавиатуре.',
    placeholder: 'void keyboard_post_init_user(void) {\n    // …\n}',
  },
};

export function CustomLines({ file, generatedSymbols }: { file: CustomFile; generatedSymbols: ReadonlySet<string> }) {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const [open, setOpen] = useState(false);
  if (!project) return null;
  const text = project.firmware.custom?.[file] ?? '';
  const review = !!project.firmware.customReview && hasCustomCode(project.firmware.custom);
  const issues = text.trim() ? checkCustom(file, text, generatedSymbols) : [];
  const lang = getLanguage();
  const hint = HINT[file];
  const lines = text ? text.split('\n').length : 0;

  const setText = (value: string) =>
    apply(
      (p) => {
        const custom = { ...(p.firmware.custom ?? {}), [file]: value };
        if (!value) delete custom[file];
        return patchProject(p, { firmware: { ...p.firmware, custom } });
      },
      t(`own lines in ${file}`, `свои строки в ${file}`),
      { coalesce: `custom:${file}` },
    );

  return (
    <div className="panel-box" style={{ marginTop: 'var(--gap)' }}>
      <div className="panel-box-head">
        <span className="cell-label">
          <Hint
            tip={t(
              'Your own code added at the end of the generated file. NAVI checks it line by line and again right before writing; a line that could run a program is rejected. Code that came with an imported project is held until you read it and press “allow”.',
              'Ваш собственный код в конце сгенерированного файла. NAVI проверяет его построчно и ещё раз прямо перед записью; строка, способная запустить программу, отклоняется. Код из импортированного проекта не используется, пока вы не прочитаете его и не нажмёте «разрешить».',
            )}
          >
            {t(`your own lines · ${file}`, `свои строки · ${file}`)}
          </Hint>{' '}
          {lines > 0 && <span className="badge">{lines}</span>}
        </span>
        <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open || review}>
          <SquarePen size={14} strokeWidth={1.5} /> {open || review ? t('hide', 'скрыть') : text ? t('edit', 'изменить') : t('add', 'добавить')}
        </button>
      </div>
      {review && (
        <div className="notice" role="alert" style={{ borderColor: 'var(--danger-color)', margin: '8px 12px' }}>
          <span>
            {t(
              'This code came with an imported project and is not used yet. Read it (all three files): it is compiled into the firmware and runs on the keyboard — a keyboard can type anything into your computer.',
              'Этот код пришёл с импортированным проектом и пока не используется. Прочитайте его (во всех трёх файлах): он вкомпилируется в прошивку и работает на клавиатуре — а клавиатура может напечатать в компьютер что угодно.',
            )}{' '}
            <button className="btn" onClick={() => apply((p) => patchProject(p, { firmware: { ...p.firmware, customReview: undefined } }), t('allow own code', 'разрешить свой код'))}>
              <ShieldCheck size={14} strokeWidth={1.5} /> {t('I have read it — allow', 'прочитал(а) — разрешить')}
            </button>
          </span>
        </div>
      )}
      {(open || review) && (
        <div className="panel-box-body field">
          <span className="field-hint">{lang === 'ru' ? hint.ru : hint.en}</span>
          <textarea
            className="textarea"
            style={{ minHeight: 140, width: '100%', whiteSpace: 'pre', tabSize: 4 }}
            spellCheck={false}
            value={text}
            placeholder={hint.placeholder}
            onChange={(e) => setText(e.target.value)}
            aria-label={t(`Own lines for ${file}`, `Свои строки для ${file}`)}
          />
          {issues.length > 0 && (
            <ul className="issue-list">
              {issues.map((i, n) => (
                <li key={n} className={`issue issue--${i.level}`}>
                  <span className="issue-where">{i.line ? t(`line ${i.line}`, `строка ${i.line}`) : file}</span>
                  {lang === 'ru' ? i.message.ru : i.message.en}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
