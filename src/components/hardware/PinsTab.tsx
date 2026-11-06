/**
 * Hardware → board pins: how the keyboard is wired to the controller (for your own firmware).
 * You can start from the pins of an existing QMK target (Firmware → keyboard) — for a clone this is
 * a guess, and it is marked as such.
 */
import { useState } from 'react';
import { checkPins, pinPattern, pinsFromSources } from '../../core/qmk/keyboardDef';
import { patchProject } from '../../core/project/ops';
import type { EncoderPins, PinDefinition, Project } from '../../core/project/types';
import { href } from '../../lib/router';
import { useProjectStore } from '../../store/projectStore';
import { useQmkStore } from '../../store/qmkStore';
import { toast } from '../../store/toastStore';
import { getLanguage, t } from '../../i18n';
import { QMK_DOCS } from '../../lib/qmkDocs';
import { whyDisabled } from '../../lib/whyDisabled';
import { issueLevelLabel } from '../../lib/issueLevel';
import { deletedToast } from '../../lib/undoToast';
import { EmptyState } from '../EmptyState';
import { Hint } from '../InfoTip';

const split = (s: string) =>
  s
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

function suggestTarget(project: Project): string {
  const base = `${project.hardware.manufacturer || 'navi'}/${project.hardware.name}`
    .toLowerCase()
    .replace(/[^a-z0-9_/]+/g, '_')
    .replace(/_+/g, '_');
  return base.replace(/^_|_$/g, '');
}

function PinList({ label, value, onChange, hint, tip }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string; tip?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="field">
      <span className="field-label">
        {tip ? (
          <Hint tip={tip} docs={QMK_DOCS.howAMatrixWorks}>
            {label}
          </Hint>
        ) : (
          label
        )}{' '}
        · {value.length}
      </span>
      <input
        className="input"
        value={text ?? value.join(', ')}
        placeholder={hint}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) onChange(split(text));
          setText(null);
        }}
      />
    </label>
  );
}

function EncoderList({ value, onChange }: { value: EncoderPins[]; onChange: (v: EncoderPins[]) => void }) {
  const addButton = (
    <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...value, { a: '', b: '' }])}>
      + {t('encoder', 'энкодер')}
    </button>
  );
  return (
    <div className="field">
      {value.length === 0 && (
        <EmptyState
          what={t('Encoders are rotary knobs; each one needs two pins (A and B).', 'Энкодеры — поворотные ручки; каждому нужны два вывода (A и B).')}
          example={t('E0 with A = GP26 and B = GP27.', 'E0 с A = GP26 и B = GP27.')}
        >
          {addButton}
        </EmptyState>
      )}
      {value.map((e, i) => (
        <div key={i} className="field-row">
          <span className="kicker">E{i}</span>
          <input
            className="input"
            style={{ width: 90 }}
            value={e.a}
            placeholder="A"
            onChange={(ev) => onChange(value.map((x, j) => (j === i ? { ...x, a: ev.target.value.trim() } : x)))}
            aria-label={`E${i} A`}
          />
          <input
            className="input"
            style={{ width: 90 }}
            value={e.b}
            placeholder="B"
            onChange={(ev) => onChange(value.map((x, j) => (j === i ? { ...x, b: ev.target.value.trim() } : x)))}
            aria-label={`E${i} B`}
          />
          <button className="text-btn" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      {value.length > 0 && addButton}
    </div>
  );
}

export function PinsTab({ project }: { project: Project }) {
  const apply = useProjectStore((s) => s.apply);
  const sources = useQmkStore((s) => s.sources);
  const pins = project.hardware.pins;
  const lang = getLanguage();
  const set = (next: PinDefinition | null, label: string) => apply((p) => patchProject(p, { hardware: { ...p.hardware, pins: next } }), label, { coalesce: `pins:${label}` });
  const patch = (part: Partial<PinDefinition>, label: string) => pins && set({ ...pins, ...part }, label);
  const pat = pinPattern(project.hardware.processor);

  if (!pins) {
    return (
      <div className="page">
        <p className="page-lead">
          {t(
            'To build your own firmware for a keyboard that is not in QMK, QMK needs to know which controller pins the rows, columns, encoders and the link between halves use. This is printed on the PCB schematic or in the seller’s firmware source.',
            'Чтобы собрать свою прошивку для клавиатуры, которой нет в QMK, нужно знать, к каким выводам контроллера подключены строки, столбцы, энкодеры и связь половин. Это есть в схеме платы или в исходниках прошивки продавца.',
          )}
        </p>
        <div className="field-row">
          <button
            className="btn btn--primary"
            onClick={() =>
              set({ target: suggestTarget(project), diodeDirection: 'COL2ROW', rows: [], cols: [], handedness: { kind: 'master-left' }, encoders: [] }, t('describe pins', 'описать выводы'))
            }
          >
            {t('describe pins by hand', 'описать выводы вручную')}
          </button>
          <button
            className="btn"
            {...whyDisabled(!sources && t('Choose a QMK target first: Firmware → keyboard', 'Сначала выберите QMK target: Прошивка → клавиатура'), sources?.keyboard)}
            onClick={() => {
              const p = sources ? pinsFromSources(sources.keyboard, sources.info, suggestTarget(project)) : null;
              if (!p) return toast(t('The target has no matrix pins in keyboard.json', 'В keyboard.json этого target нет выводов матрицы'), 'error');
              set(p, t('pins from QMK target', 'выводы из QMK target'));
            }}
          >
            {t(`start from ${sources?.keyboard ?? 'a QMK target'}`, `взять из ${sources?.keyboard ?? 'QMK target'}`)}
          </button>
          {!sources && <a href={href({ section: 'firmware', tab: 'target' })}>{t('choose a target', 'выбрать target')}</a>}
        </div>
      </div>
    );
  }

  const issues = checkPins(project);
  return (
    <div className="page">
      {pins.source && (
        <div className="notice" role="status" style={{ borderColor: 'var(--meter-from)' }}>
          <span>
            {t('Pins are', 'Выводы')} {pins.source}.{' '}
            {t(
              'For a clone this is an ASSUMPTION: if the clone’s board is wired differently, firmware built with these pins will not work (on RP2040 you can always go back by flashing the original firmware).',
              'Для клона это ПРЕДПОЛОЖЕНИЕ: если плата клона разведена иначе, прошивка с этими выводами не заработает (у RP2040 всегда можно вернуться, прошив родную прошивку).',
            )}
          </span>
        </div>
      )}
      <div className="grid-2">
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">
              <Hint
                docs={QMK_DOCS.howAMatrixWorks}
                tip={t(
                  'Rows and columns the switches are wired into; QMK scans them to find pressed keys.',
                  'Строки и столбцы, в которые соединены переключатели; QMK сканирует их, чтобы найти нажатые клавиши.',
                )}
              >
                {t('matrix', 'матрица')}
              </Hint>
            </span>
            <span className="kicker">
              {project.hardware.processor ?? '?'} {pat ? `· ${pat.example}` : ''}
            </span>
          </div>
          <div className="panel-box-body field">
            <label className="field">
              <span className="field-label">
                <Hint
                  docs={QMK_DOCS.portingKeyboard}
                  tip={t(
                    'A QMK target is a keyboard folder inside qmk_firmware/keyboards (for example maker/model) that holds keyboard.json and the keymaps. NAVI creates it from this description.',
                    'QMK target — папка клавиатуры внутри qmk_firmware/keyboards (например, maker/model), где лежат keyboard.json и раскладки. NAVI создаёт её по этому описанию.',
                  )}
                >
                  {t('target folder in qmk_firmware/keyboards', 'папка target в qmk_firmware/keyboards')}
                </Hint>
              </span>
              <input className="input" value={pins.target} onChange={(e) => patch({ target: e.target.value.toLowerCase().replace(/[^a-z0-9_/]/g, '_') }, 'target')} spellCheck={false} />
            </label>
            <label className="field">
              <span className="field-label">
                <Hint
                  docs={QMK_DOCS.howAMatrixWorks}
                  tip={t(
                    'Which way the diodes point. COL2ROW: the diode’s marked end (cathode) faces the row. ROW2COL: it faces the column. Check the PCB; a wrong value gives ghost or dead keys.',
                    'В какую сторону направлены диоды. COL2ROW: помеченный конец диода (катод) смотрит на строку. ROW2COL: на столбец. Проверьте по плате: при неверном значении клавиши «призраки» или не работают.',
                  )}
                >
                  {t('diodes', 'диоды')}
                </Hint>
              </span>
              <select className="select" value={pins.diodeDirection} onChange={(e) => patch({ diodeDirection: e.target.value as PinDefinition['diodeDirection'] }, 'diodes')}>
                <option value="COL2ROW">COL2ROW</option>
                <option value="ROW2COL">ROW2COL</option>
              </select>
            </label>
            <PinList
              tip={t('The controller pins wired to the matrix rows, in row order (row 0 first).', 'Выводы контроллера, подключённые к строкам матрицы, по порядку (строка 0 первой).')}
              label={t(project.hardware.split.enabled ? 'row pins (one half)' : 'row pins', project.hardware.split.enabled ? 'пины строк (одна половина)' : 'пины строк')}
              value={pins.rows}
              onChange={(rows) => patch({ rows }, 'rows')}
              hint="GP15, GP4, …"
            />
            <PinList
              tip={t('The controller pins wired to the matrix columns, in column order (column 0 first).', 'Выводы контроллера, подключённые к столбцам матрицы, по порядку (столбец 0 первым).')}
              label={t('column pins', 'пины столбцов')}
              value={pins.cols}
              onChange={(cols) => patch({ cols }, 'cols')}
              hint="GP14, GP8, …"
            />
            <label className="field">
              <span className="field-label">{t('board (optional)', 'плата (необязательно)')}</span>
              <input className="input" value={pins.board ?? ''} placeholder="GENERIC_RP_RP2040" onChange={(e) => patch({ board: e.target.value || undefined }, 'board')} />
            </label>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('halves and encoders', 'половины и энкодеры')}</span>
          </div>
          <div className="panel-box-body field">
            {project.hardware.split.enabled ? (
              <>
                <label className="field">
                  <span className="field-label">
                    <Hint
                      docs={QMK_DOCS.splitKeyboard}
                      tip={t(
                        'The pin of the wire between the halves (the data line of the TRRS/TRS cable) used by the serial link.',
                        'Вывод провода между половинами (линия данных кабеля TRRS/TRS) для связи serial.',
                      )}
                    >
                      {t('link pin (serial)', 'пин связи половин (serial)')}
                    </Hint>
                  </span>
                  <input className="input" value={pins.serialPin ?? ''} placeholder="GP1" onChange={(e) => patch({ serialPin: e.target.value.trim() || undefined }, 'serial')} />
                </label>
                <label className="field">
                  <span className="field-label">
                    <Hint
                      docs={QMK_DOCS.splitKeyboard}
                      tip={t(
                        'Handedness: how each half learns whether it is the left or the right one. By the USB side (the half with the cable is left), by a pin tied high or low on the board, or by a flag stored in each half’s EEPROM (EE_HANDS) when it is flashed.',
                        'Handedness: как каждая половина узнаёт, левая она или правая. По стороне USB (половина с кабелем — левая), по выводу, подтянутому к высокому или низкому уровню на плате, или по флагу в EEPROM каждой половины (EE_HANDS), который записывается при прошивке.',
                      )}
                    >
                      {t('which half is which', 'как половина узнаёт сторону')}
                    </Hint>
                  </span>
                  <select
                    className="select"
                    value={pins.handedness.kind}
                    onChange={(e) =>
                      patch({ handedness: e.target.value === 'pin' ? { kind: 'pin', pin: '', lowIsLeft: true } : e.target.value === 'eeprom' ? { kind: 'eeprom' } : { kind: 'master-left' } }, 'hand')
                    }
                  >
                    <option value="master-left">{t('USB cable goes into the left half', 'USB-кабель — в левую половину')}</option>
                    <option value="pin">{t('a pin on the board', 'пин на плате')}</option>
                    <option value="eeprom">{t('stored in each half (EE_HANDS)', 'записано в каждой половине (EE_HANDS)')}</option>
                  </select>
                </label>
                {pins.handedness.kind === 'pin' && (
                  <div className="field-row">
                    <input
                      className="input"
                      style={{ width: 100 }}
                      value={pins.handedness.pin}
                      placeholder="GP29"
                      onChange={(e) => patch({ handedness: { kind: 'pin', pin: e.target.value.trim(), lowIsLeft: pins.handedness.kind === 'pin' ? pins.handedness.lowIsLeft : true } }, 'handpin')}
                    />
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={pins.handedness.lowIsLeft}
                        onChange={(e) => patch({ handedness: { kind: 'pin', pin: pins.handedness.kind === 'pin' ? pins.handedness.pin : '', lowIsLeft: e.target.checked } }, 'handlow')}
                      />
                      {t('low = left', 'низкий уровень = левая')}
                    </label>
                  </div>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!(pins.rightRows || pins.rightCols)}
                    onChange={(e) => patch(e.target.checked ? { rightRows: [...pins.rows], rightCols: [...pins.cols] } : { rightRows: undefined, rightCols: undefined }, 'right')}
                  />
                  {t('right half uses other pins', 'у правой половины другие пины')}
                </label>
                {pins.rightRows && <PinList label={t('right: row pins', 'правая: пины строк')} value={pins.rightRows} onChange={(rightRows) => patch({ rightRows }, 'rrows')} />}
                {pins.rightCols && <PinList label={t('right: column pins', 'правая: пины столбцов')} value={pins.rightCols} onChange={(rightCols) => patch({ rightCols }, 'rcols')} />}
              </>
            ) : (
              <p className="field-hint">{t('Not a split keyboard (Hardware → profile).', 'Клавиатура не сплит (Железо → профиль).')}</p>
            )}
            <span className="field-label">
              <Hint
                docs={QMK_DOCS.encoders}
                tip={t(
                  'Each encoder uses two pins, A and B; QMK reads the order they change to tell the turn direction.',
                  'Каждый энкодер использует два вывода, A и B; QMK по порядку их переключения определяет направление вращения.',
                )}
              >
                {t(project.hardware.split.enabled ? 'encoders of one half (A, B)' : 'encoders (A, B)', project.hardware.split.enabled ? 'энкодеры одной половины (A, B)' : 'энкодеры (A, B)')}
              </Hint>
            </span>
            <EncoderList value={pins.encoders} onChange={(encoders) => patch({ encoders }, 'enc')} />
          </div>
        </section>
      </div>
      <ul className="issue-list" style={{ marginTop: 'var(--gap)' }}>
        {issues.map((i, n) => (
          <li key={n} className={`issue issue--${i.level}`}>
            <span className="issue-where">{issueLevelLabel(i.level)}</span>
            {lang === 'ru' ? i.message.ru : i.message.en}
          </li>
        ))}
        {issues.length === 0 && <li className="field-hint">{t('no problems', 'проблем нет')}</li>}
      </ul>
      <div className="field-row" style={{ marginTop: 'var(--gap)' }}>
        <a className="btn btn--primary" href={href({ section: 'firmware', tab: 'target' })}>
          {t('create the target in qmk_firmware →', 'создать target в qmk_firmware →')}
        </a>
        <button className="btn btn--ghost" onClick={() => {
            apply((p) => patchProject(p, { hardware: { ...p.hardware, pins: null } }), t('remove pins', 'убрать выводы'));
            deletedToast(t('pin description', 'описание выводов'));
          }}
        >
          {t('remove pin description', 'удалить описание выводов')}
        </button>
      </div>
    </div>
  );
}
