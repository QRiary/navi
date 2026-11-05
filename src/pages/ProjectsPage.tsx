/**
 * PROJECTS SECTION: list, creation (from the keyboard, from a template, blank), import and export,
 * history of the saved versions of the current project.
 */
import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, FileInput, FolderOpen, History, Keyboard, LayoutGrid, Link2, Plus, Trash2, Unlink, Usb } from 'lucide-react';
import { createBlankProject, createDilemmaProject, createProject, emptyHardware } from '../core/project/factory';
import { activeGeometry, activeKeymap } from '../core/project/ops';
import { diffProjects } from '../core/project/diff';
import { parseProjectText, serializeProject, validateProject, type ValidationIssue } from '../core/project/validate';
import {
  detectFileKind,
  exportQmkKeymapJson,
  exportViaBackup,
  exportViaDefinition,
  importKle,
  importQmkKeymapJson,
  importQmkLayout,
  importViaBackup,
  importViaDefinition,
  layoutOrder,
  listQmkLayouts,
  type ImportIssue,
} from '../core/io/formats';
import { serializeKle } from '../core/io/kle';
import { loadSpec } from '../core/keycodes/spec';
import { hasCustomCode } from '../core/qmk/customCode';
import { newId } from '../core/layout/geometry';
import type { Project } from '../core/project/types';
import { navi, type Revision } from '../desktop/bridge';
import { DiffView } from '../components/project/DiffView';
import { JSON_FILTERS, openTextFile, saveTextFile } from '../lib/files';
import { projectFromDevice } from '../lib/projectFromDevice';
import { projectRepo } from '../platform/projectRepo';
import { href, navigate } from '../lib/router';
import { currentTab, tabItems, tabRoute } from '../lib/sections';
import { TabPanels, Tabs } from '../components/Tabs';
import { EmptyState } from '../components/EmptyState';
import { Hint } from '../components/InfoTip';
import { whyDisabled } from '../lib/whyDisabled';
import { useDeviceStore } from '../store/deviceStore';
import { useProjectStore } from '../store/projectStore';
import { toast, toastError } from '../store/toastStore';
import { locale, t } from '../i18n';
import { ListFilter } from '../components/ListFilter';
import { findAttr, matchesQuery, useListFilter } from '../lib/find';

const ICON = { size: 15, strokeWidth: 1.5 };

function Issues({ issues }: { issues: (ValidationIssue | ImportIssue)[] }) {
  if (!issues.length) return null;
  return (
    <ul className="issue-list">
      {issues.slice(0, 40).map((i, n) => (
        <li key={n} className={`issue issue--${i.level}`}>
          <span className="issue-where">{i.level === 'error' ? 'err' : 'warn'}</span>
          {'path' in i && i.path && <code>{i.path}</code>} {i.message}
        </li>
      ))}
      {issues.length > 40 && <li className="issue issue--warning">… +{issues.length - 40}</li>}
    </ul>
  );
}

function slug(s: string) {
  return s.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'project';
}

function NewProject() {
  const create = useProjectStore((s) => s.create);
  const devices = useDeviceStore((s) => s.devices);
  const status = useDeviceStore((s) => s.status);
  const current = useDeviceStore((s) => s.current);
  const caps = useDeviceStore((s) => s.caps);
  const snapshot = useDeviceStore((s) => s.snapshot);
  const connect = useDeviceStore((s) => s.connect);
  const refresh = useDeviceStore((s) => s.refresh);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(12);
  const [split, setSplit] = useState(true);
  const [issues, setIssues] = useState<(ValidationIssue | ImportIssue)[]>([]);
  const [layoutChoice, setLayoutChoice] = useState<{ info: Record<string, unknown>; layouts: string[] } | null>(null);

  const done = async (p: Project, msg: string) => {
    await create(p);
    toast(msg);
    navigate({ section: 'keyboard' });
  };

  const openLinked = async () => {
    try {
      const iss = await useProjectStore.getState().openLinkedFile();
      if (!iss) return;
      setIssues(iss);
      if (useProjectStore.getState().link) {
        toast(t('Project opened and linked to the file: Save writes it back', 'Проект открыт и связан с файлом: «Сохранить» записывает его обратно'));
        if (!iss.some((i) => i.level === 'error')) navigate({ section: 'keyboard' });
      }
    } catch (err) {
      setIssues([{ level: 'error', message: (err as Error).message }]);
    }
  };

  const fromDevice = async (key: string) => {
    if (current?.key !== key || status !== 'connected') {
      const ok = await connect(key);
      if (!ok) return;
    }
    const st = useDeviceStore.getState();
    if (!st.current || !st.caps || !st.snapshot) return;
    await done(projectFromDevice(st.current, st.caps, st.snapshot), t('Project created from the keyboard', 'Проект создан по клавиатуре'));
  };

  const importFile = async () => {
    const file = await openTextFile([{ name: 'NAVI / QMK / VIA / KLE', extensions: ['json', 'navi'] }]);
    if (!file) return;
    let json: unknown;
    try {
      json = JSON.parse(file.text);
    } catch (err) {
      setIssues([{ level: 'error', message: `${file.name}: ${(err as Error).message}` }]);
      return;
    }
    const kind = detectFileKind(json);
    try {
      if (kind === 'navi') {
        const { project, issues: iss } = validateProject(json);
        setIssues(iss);
        if (project) {
          // Own code from a foreign file does not get into the firmware until the user reviews it.
          const review = hasCustomCode(project.firmware.custom);
          if (review)
            iss.push({
              level: 'warning',
              path: 'firmware.custom',
              message: t(
                'The project contains its own code for the firmware files — review it in Firmware → keymap files before building.',
                'В проекте есть свой код для файлов прошивки — просмотрите его в «Прошивка → файлы keymap» перед сборкой.',
              ),
            });
          setIssues([...iss]);
          await done({ ...project, id: newId('prj'), firmware: { ...project.firmware, customReview: review || undefined } }, t('Project imported (as a copy)', 'Проект импортирован (копией)'));
        }
      } else if (kind === 'via-definition' || kind === 'kle') {
        const res = kind === 'via-definition' ? importViaDefinition(json as Record<string, unknown>) : importKle(json, file.name.replace(/\.json$/i, ''));
        setIssues(res.issues);
        const hw = emptyHardware(res.rows ?? 1, res.cols ?? 1);
        hw.name = res.name ?? file.name;
        hw.usb = { vid: res.vid ?? null, pid: res.pid ?? null };
        hw.split.enabled = res.geometry.keys.some((k) => k.half === 'right');
        const p = createProject({ name: hw.name, hardware: hw, geometry: res.geometry });
        if (res.vid !== undefined && res.pid !== undefined) p.device = { vid: res.vid, pid: res.pid };
        await done(p, t('Project created from the layout file', 'Проект создан по файлу макета'));
      } else if (kind === 'qmk-info') {
        const layouts = listQmkLayouts(json as Record<string, unknown>);
        if (layouts.length === 1) await fromQmkInfo(json as Record<string, unknown>, layouts[0]);
        else setLayoutChoice({ info: json as Record<string, unknown>, layouts });
      } else if (kind === 'qmk-keymap' || kind === 'via-backup') {
        setIssues([
          {
            level: 'warning',
            message: t(
              'This is a keymap, not a keyboard: open a project and import it in “Projects → current project”.',
              'Это раскладка, а не клавиатура: откройте проект и импортируйте её в «Проекты → текущий проект».',
            ),
          },
        ]);
      } else {
        setIssues([{ level: 'error', message: t('Unknown file format', 'Неизвестный формат файла') }]);
      }
    } catch (err) {
      setIssues([{ level: 'error', message: (err as Error).message }]);
    }
  };

  const fromQmkInfo = async (info: Record<string, unknown>, layout: string) => {
    const res = importQmkLayout(info, layout);
    setIssues(res.issues);
    const hw = emptyHardware(res.rows ?? 1, res.cols ?? 1);
    hw.name = res.name ?? 'QMK keyboard';
    hw.usb = { vid: res.vid ?? null, pid: res.pid ?? null };
    hw.split.enabled = !!(info.split as Record<string, unknown> | undefined)?.enabled;
    if (typeof info.processor === 'string') hw.processor = info.processor;
    if (typeof info.bootloader === 'string') hw.bootloader = info.bootloader;
    const p = createProject({ name: hw.name, hardware: hw, geometry: res.geometry, encoderCount: res.geometry.encoders.length });
    await done(p, t('Project created from QMK keyboard.json', 'Проект создан по QMK keyboard.json'));
  };

  return (
    <div className="page">
      <p className="page-lead">
        {t(
          'A project keeps the keyboard description (geometry, matrix, hardware), keymaps with layers, encoders, macros and advanced features. It is saved on disk; edits are kept as a draft automatically.',
          'Проект хранит описание клавиатуры (геометрия, матрица, железо), раскладки со слоями, энкодеры, макросы и расширенные функции. Сохраняется на диск; правки автоматически хранятся черновиком.',
        )}
      </p>
      <div className="grid-2">
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">
              <Usb size={13} strokeWidth={1.5} /> {t('from the connected keyboard', 'по подключённой клавиатуре')}
            </span>
            <button className="text-btn" onClick={() => void refresh()}>
              {t('search', 'искать')}
            </button>
          </div>
          <div className="panel-box-body">
            <p className="field-hint">
              {t(
                'Reads everything VIA gives (read-only): matrix, layers, keymap, encoders, macros, lighting.',
                'Читает всё, что отдаёт VIA (только чтение): матрицу, слои, раскладку, энкодеры, макросы, подсветку.',
              )}
            </p>
            <div className="rows" style={{ marginTop: 12 }}>
              {devices.map((d) => (
                <div className="row" key={d.key} style={{ ['--row-cols' as string]: 'minmax(0,1fr) auto' }}>
                  <span>
                    {d.productName}{' '}
                    <span className="kicker">
                      {d.vendorId.toString(16).padStart(4, '0')}:{d.productId.toString(16).padStart(4, '0')}
                    </span>
                  </span>
                  <button
                    className="btn btn--primary"
                    {...whyDisabled((status === 'connecting' || status === 'busy') && t('Wait: the keyboard is busy', 'Подождите: клавиатура занята'))}
                    onClick={() => void fromDevice(d.key)}
                  >
                    {t('create', 'создать')}
                  </button>
                </div>
              ))}
              {devices.length === 0 && (
                <p className="field-hint">{t('No VIA keyboards found. Connect it by USB and press “search”.', 'Клавиатуры с VIA не найдены. Подключите по USB и нажмите «искать».')}</p>
              )}
            </div>
            {status === 'connected' && caps && snapshot && (
              <p className="field-hint" style={{ marginTop: 8 }}>
                {t('Connected:', 'Подключена:')} {current?.productName} · VIA v{caps.protocol} · {snapshot.rows}×{snapshot.cols}
              </p>
            )}
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">
              <Keyboard size={13} strokeWidth={1.5} /> {t('template', 'шаблон')}
            </span>
          </div>
          <div className="panel-box-body">
            <p className="field-hint">
              {t(
                'Dilemma 4x6 (lucky_studio clone): matrix 10×6, 2 encoders, RGB Matrix — as read from your keyboard. Key positions are approximate (based on QMK Dilemma Max) — adjust them in “Hardware”.',
                'Dilemma 4x6 (клон lucky_studio): матрица 10×6, 2 энкодера, RGB Matrix — как прочитано с вашей клавиатуры. Места клавиш примерные (по QMK Dilemma Max) — поправьте в «Железе».',
              )}
            </p>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => void done(createDilemmaProject(), t('Project created', 'Проект создан'))}>
              <Plus {...ICON} /> Dilemma 4x6
            </button>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">
              <LayoutGrid size={13} strokeWidth={1.5} /> {t('blank keyboard', 'своя клавиатура')}
            </span>
          </div>
          <div className="panel-box-body">
            <p className="field-hint">
              {t('A grid of keys for every matrix position; then shape it in the geometry editor.', 'Сетка клавиш по позициям матрицы; дальше — форма в редакторе геометрии.')}
            </p>
            <div className="field-row" style={{ marginTop: 12 }}>
              <label className="field-hint">
                {t('rows', 'строк')} <input className="input input--num" type="number" min={1} max={32} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
              </label>
              <label className="field-hint">
                {t('cols', 'столбцов')} <input className="input input--num" type="number" min={1} max={32} value={cols} onChange={(e) => setCols(Number(e.target.value))} />
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> split
              </label>
              <button
                className="btn"
                {...whyDisabled(
                  (split && rows % 2 !== 0 && t('A split keyboard needs an even number of rows', 'У сплита должно быть чётное число строк')) ||
                    ((rows < 1 || cols < 1 || rows > 32 || cols > 32) && t('Rows and columns: from 1 to 32', 'Строк и столбцов: от 1 до 32')),
                )}
                onClick={() => void done(createBlankProject(t('My keyboard', 'Моя клавиатура'), rows, cols, split), t('Project created', 'Проект создан'))}
              >
                <Plus {...ICON} /> {t('create', 'создать')}
              </button>
            </div>
            {split && rows % 2 !== 0 && <p className="field-hint">{t('A split keyboard has an even number of rows (half per side).', 'У сплита чётное число строк (половина на сторону).')}</p>}
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">
              <FileInput size={13} strokeWidth={1.5} /> {t('import a file', 'импорт файла')}
            </span>
          </div>
          <div className="panel-box-body">
            <p className="field-hint">
              {t('NAVI project · QMK keyboard.json / info.json · VIA keyboard definition · KLE raw data.', 'Проект NAVI · QMK keyboard.json / info.json · определение клавиатуры VIA · KLE raw data.')}
            </p>
            <div className="field-row" style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => void importFile()}>
                <FolderOpen {...ICON} /> {t('choose file…', 'выбрать файл…')}
              </button>
              {navi && (
                <button
                  className="btn"
                  onClick={() => void openLinked()}
                  title={t('The project stays linked to this NAVI project file: Save writes it back there', 'Проект остаётся связан с этим файлом проекта NAVI: «Сохранить» записывает его туда')}
                >
                  <Link2 {...ICON} /> {t('open a file (linked)…', 'открыть файл (со связью)…')}
                </button>
              )}
            </div>
            {navi && (
              <p className="field-hint" style={{ marginTop: 8 }}>
                {t(
                  'Import makes a copy. A linked NAVI project stays tied to its file (e.g. in your git repo): Save writes it back.',
                  'Импорт делает копию. Связанный проект NAVI остаётся привязан к своему файлу (например, в вашем git-репозитории): «Сохранить» записывает его обратно.',
                )}
              </p>
            )}
            {layoutChoice && (
              <div className="field-row" style={{ marginTop: 12 }}>
                <span className="field-hint">{t('Layout:', 'Макет:')}</span>
                {layoutChoice.layouts.map((l) => (
                  <button key={l} className="chip" onClick={() => void fromQmkInfo(layoutChoice.info, l).then(() => setLayoutChoice(null))}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      <Issues issues={issues} />
    </div>
  );
}

function ProjectList() {
  const list = useProjectStore((s) => s.list);
  const currentId = useProjectStore((s) => s.project?.id);
  const open = useProjectStore((s) => s.open);
  const remove = useProjectStore((s) => s.remove);
  const create = useProjectStore((s) => s.create);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [query, setQuery] = useListFilter();

  const duplicate = async (id: string) => {
    const { saved, draft } = await projectRepo.read(id);
    const { project } = parseProjectText(draft ?? saved ?? '');
    if (!project) return toast(t('Cannot read the project', 'Не удалось прочитать проект'), 'error');
    await create({ ...project, id: newId('prj'), name: `${project.name} copy` });
    toast(t('Copy created', 'Копия создана'));
  };

  const shown = list.filter((p) => matchesQuery(query, p.name, p.keyboard));

  return (
    <>
      {list.length > 0 && (
        <ListFilter
          value={query}
          onChange={setQuery}
          label={t('Filter projects', 'Фильтр проектов')}
          placeholder={t('Filter by name or keyboard', 'Фильтр по имени или клавиатуре')}
          shown={shown.length}
          total={list.length}
        />
      )}
      {list.length > 0 && shown.length === 0 && <p className="field-hint">{t('Nothing matches the filter.', 'Под фильтр ничего не подходит.')}</p>}
      <div className="panel-box" hidden={list.length > 0 && shown.length === 0}>
        <div className="rows">
          {shown.map((p) => (
            <div key={p.id} {...findAttr('project:' + p.id)} className={`row ${p.id === currentId ? 'is-active' : ''}`} style={{ ['--row-cols' as string]: 'minmax(0,1.4fr) minmax(0,1fr) 90px 150px auto' }}>
              <button style={{ textAlign: 'left' }} onClick={() => void open(p.id).then((ok) => ok && navigate({ section: 'keyboard' }))}>
                <strong>{p.name}</strong> {p.unsaved && <span className="badge badge--info">{t('draft', 'черновик')}</span>}{' '}
                {p.broken && <span className="badge badge--warn">{t('broken', 'повреждён')}</span>}
              </button>
              <span className="field-hint">{p.keyboard}</span>
              <span className="kicker">
                {p.keys} {t('keys', 'кл.')} · {p.layers}L
              </span>
              <span className="kicker">{p.updatedAt ? new Date(p.updatedAt).toLocaleString(locale()) : ''}</span>
              <div className="row-actions">
                <button className="icon-btn" title={t('Duplicate', 'Копия')} aria-label={t('Duplicate', 'Копия')} onClick={() => void duplicate(p.id)}>
                  <Copy {...ICON} />
                </button>
                <button
                  className={`icon-btn ${confirm === p.id ? 'is-danger' : ''}`}
                  title={confirm === p.id ? t('Click again to delete', 'Ещё раз — удалить') : t('Delete (to trash folder)', 'Удалить (в папку .trash)')}
                  aria-label={t('Delete', 'Удалить')}
                  onClick={() => {
                    if (confirm !== p.id) {
                      setConfirm(p.id);
                      setTimeout(() => setConfirm(null), 4000);
                      return;
                    }
                    void remove(p.id).then(() => toast(t('Project moved to trash', 'Проект перенесён в корзину')));
                  }}
                >
                  <Trash2 {...ICON} />
                </button>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <EmptyState
              what={t('A project is one keyboard with its keymaps, macros and settings, saved on disk.', 'Проект — это одна клавиатура с её раскладками, макросами и настройками, сохранённая на диске.')}
              example={t('“Dilemma 4x6”, read from the connected keyboard or made from the template.', '«Dilemma 4x6», прочитанный с подключённой клавиатуры или созданный из шаблона.')}
            >
              <a className="btn btn--primary" href={href({ section: 'projects', tab: 'new' })}>
                {t('Create a project', 'Создать проект')}
              </a>
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

function CurrentProject() {
  const project = useProjectStore((s) => s.project);
  const apply = useProjectStore((s) => s.apply);
  const snapshotMacros = useDeviceStore((s) => s.caps?.macros?.count);
  const [issues, setIssues] = useState<(ValidationIssue | ImportIssue)[]>([]);
  if (!project) return <p className="field-hint">{t('No project is open.', 'Проект не открыт.')}</p>;
  const spec = loadSpec(project.firmware.keycodeSpec);
  const km = activeKeymap(project);
  const geo = activeGeometry(project);
  const base = slug(project.name);

  const importKeymap = async () => {
    const file = await openTextFile(JSON_FILTERS);
    if (!file) return;
    try {
      const json = JSON.parse(file.text);
      const kind = detectFileKind(json);
      if (kind === 'qmk-keymap') {
        const res = importQmkKeymapJson(json, project, spec, layoutOrder(geo));
        setIssues(res.issues);
        if (!res.issues.some((i) => i.level === 'error')) {
          apply((p) => ({ ...p, keymaps: [...p.keymaps, res.keymap], activeKeymapId: res.keymap.id }), t('import keymap.json', 'импорт keymap.json'));
          toast(t('Imported as a new keymap', 'Импортировано как новая раскладка'));
        }
      } else if (kind === 'via-backup') {
        const res = importViaBackup(json, project, spec);
        setIssues(res.issues);
        if (!res.issues.some((i) => i.level === 'error')) {
          apply(
            (p) => ({
              ...p,
              keymaps: [...p.keymaps, res.keymap],
              activeKeymapId: res.keymap.id,
              macros: [
                ...p.macros.filter((m) => !res.macros.some((x) => x.index === m.index)),
                ...res.macros.map((m) => ({ id: newId('macro'), index: m.index, name: `M${m.index}`, steps: m.steps })),
              ],
            }),
            t('import VIA backup', 'импорт VIA'),
          );
          toast(t('Imported as a new keymap', 'Импортировано как новая раскладка'));
        }
      } else setIssues([{ level: 'error', message: t('Expected QMK keymap.json or a VIA layout backup', 'Ожидался QMK keymap.json или резервная копия VIA') }]);
    } catch (err) {
      setIssues([{ level: 'error', message: (err as Error).message }]);
    }
  };

  const exportKle = () => {
    const rows = serializeKle(geo.keys.map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h, r: k.r, rx: k.rx, ry: k.ry, label: k.matrix ? `${k.matrix[0]},${k.matrix[1]}` : '' })));
    return saveTextFile(`${base}.kle.json`, JSON.stringify(rows, null, 1), JSON_FILTERS);
  };

  const done = (p: string | null) => p && toast(t(`Saved: ${p}`, `Сохранено: ${p}`));

  return (
    <div className="page">
      {navi && <LinkedFile />}
      <div className="grid-2">
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('export', 'экспорт')}</span>
          </div>
          <div className="panel-box-body field">
            <button className="btn" onClick={() => void saveTextFile(`${base}.navi.json`, serializeProject(project), [{ name: 'NAVI project', extensions: ['json'] }]).then(done)}>
              <Download {...ICON} /> {t('NAVI project (everything)', 'проект NAVI (всё)')}
            </button>
            <button
              className="btn"
              onClick={() => void saveTextFile(`${project.firmware.keymap}.keymap.json`, JSON.stringify(exportQmkKeymapJson(project, km, spec, geo), null, 1), JSON_FILTERS).then(done)}
            >
              <Download {...ICON} /> QMK keymap.json ({t('Configurator', 'Configurator')})
            </button>
            <button
              className="btn"
              onClick={() => void saveTextFile(`${base}.via.layout.json`, JSON.stringify(exportViaBackup(project, km, spec, snapshotMacros ?? 16), null, 1), JSON_FILTERS).then(done)}
            >
              <Download {...ICON} /> {t('VIA layout backup', 'резервная копия VIA')}
            </button>
            <button className="btn" onClick={() => void exportKle().then(done)}>
              <Download {...ICON} /> {t('geometry for KLE', 'геометрия для KLE')}
            </button>
            <button
              className="btn"
              onClick={() => {
                const res = exportViaDefinition(project, geo, serializeKle);
                setIssues(res.issues);
                if (res.json) void saveTextFile(`${base}.via.json`, JSON.stringify(res.json, null, 1), JSON_FILTERS).then(done);
              }}
            >
              <Download {...ICON} /> {t('VIA keyboard definition', 'определение клавиатуры для VIA')}
            </button>
            <p className="field-hint">{t('keymap.c, rules.mk and config.h are generated in “Firmware”.', 'keymap.c, rules.mk и config.h — в разделе «Прошивка».')}</p>
          </div>
        </section>
        <section className="panel-box">
          <div className="panel-box-head">
            <span className="cell-label">{t('import a keymap', 'импорт раскладки')}</span>
          </div>
          <div className="panel-box-body field">
            <p className="field-hint">
              {t(
                'QMK keymap.json (keys in the LAYOUT order of the current geometry) or a VIA layout backup (matrix order). Added as a new keymap — the current one is not touched.',
                'QMK keymap.json (клавиши в порядке LAYOUT текущей геометрии) или резервная копия VIA (порядок матрицы). Добавляется новой раскладкой — текущая не трогается.',
              )}
            </p>
            <button className="btn" onClick={() => void importKeymap()}>
              <FileInput {...ICON} /> {t('choose file…', 'выбрать файл…')}
            </button>
          </div>
        </section>
      </div>
      <Issues issues={issues} />
      <RevisionList />
    </div>
  );
}

/** The file this project is linked to (desktop only): link, relink, unlink. */
function LinkedFile() {
  const link = useProjectStore((s) => s.link);
  const linkToFile = useProjectStore((s) => s.linkToFile);
  const relink = useProjectStore((s) => s.relink);
  const unlink = useProjectStore((s) => s.unlink);
  const run = (fn: () => Promise<unknown>, ok?: string) =>
    void fn()
      .then((res) => {
        if (ok && res !== null) toast(ok);
      })
      .catch((err: Error) =>
        toastError(t('That action on the linked file failed. Check the file is reachable and try again.', 'Действие со связанным файлом не удалось. Проверьте, что файл доступен, и повторите.'), err),
      );

  return (
    <section className="panel-box" style={{ marginBottom: 'var(--gap)' }}>
      <div className="panel-box-head">
        <span className="cell-label">
          <Link2 size={13} strokeWidth={1.5} />{' '}
          <Hint
            tip={t(
              'Links this project to a NAVI project file you keep elsewhere, for example in your own git repo. Saving then writes the project there too, and NAVI shows the differences if the file was changed outside.',
              'Связывает проект с файлом проекта NAVI, который вы храните в другом месте, например в своём git-репозитории. «Сохранить» тогда записывает проект и туда, а если файл изменили снаружи, NAVI покажет различия.',
            )}
          >
            {t('linked file', 'связанный файл')}
          </Hint>
        </span>
        {link?.missing && <span className="badge badge--warn">{t('not found', 'не найден')}</span>}
      </div>
      <div className="panel-box-body field">
        {link ? (
          <>
            <p className="field-hint">
              <code style={{ overflowWrap: 'anywhere' }}>{link.path}</code>
            </p>
            <p className="field-hint">
              {link.missing
                ? t(
                    'The file is not at this path any more (moved or deleted). NAVI keeps its own copy; relink to the file or unlink.',
                    'Файла больше нет по этому пути (перемещён или удалён). У NAVI есть своя копия; привяжите файл заново или отвяжите.',
                  )
                : t(
                    'Save (Ctrl+S) also writes this file. If it changes outside NAVI (git pull, a hand edit), NAVI shows the differences before anything is overwritten.',
                    '«Сохранить» (Ctrl+S) записывает и этот файл. Если он изменится вне NAVI (git pull, правка вручную), NAVI покажет различия, прежде чем что-то перезаписать.',
                  )}
            </p>
            <div className="field-row">
              <button className="btn" onClick={() => run(relink)}>
                <FolderOpen {...ICON} /> {t('relink…', 'привязать заново…')}
              </button>
              <button className="btn" onClick={() => run(unlink, t('Unlinked: the file stays as it is', 'Связь снята: файл остаётся как есть'))}>
                <Unlink {...ICON} /> {t('unlink', 'отвязать')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="field-hint">
              {t(
                'Not linked. Link the project to a file (e.g. in your own git repo): Save will write it there too. The link is kept only in NAVI, never in the file.',
                'Не связан. Свяжите проект с файлом (например, в вашем git-репозитории): «Сохранить» будет записывать и его. Связь хранится только в NAVI, не в файле.',
              )}
            </p>
            <div className="field-row">
              <button className="btn" onClick={() => run(linkToFile, t('Linked: the saved version is written to the file', 'Связано: сохранённая версия записана в файл'))}>
                <Link2 {...ICON} /> {t('link to a file…', 'связать с файлом…')}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function RevisionList() {
  const project = useProjectStore((s) => s.project);
  const saved = useProjectStore((s) => s.saved);
  const revisions = useProjectStore((s) => s.revisions);
  const restore = useProjectStore((s) => s.restoreRevision);
  const [list, setList] = useState<Revision[]>([]);
  const [compare, setCompare] = useState<{ file: string; old: Project; issues: ValidationIssue[] } | null>(null);
  const [showUnsaved, setShowUnsaved] = useState(false);
  useEffect(() => {
    void revisions().then(setList);
  }, [revisions, saved]);
  const changes = useMemo(() => (project && saved ? diffProjects(saved, project) : null), [project, saved]);
  const compareDiff = useMemo(() => (project && compare ? diffProjects(compare.old, project) : null), [project, compare]);
  if (!project) return null;

  const openCompare = async (file: string) => {
    if (compare?.file === file) return setCompare(null);
    const text = await projectRepo.readRevision(project.id, file);
    const { project: old, issues } = parseProjectText(text);
    if (!old) return toastError(t('Cannot read this version.', 'Не удалось прочитать версию.'), issues[0]?.message);
    setCompare({ file, old, issues });
  };

  return (
    <section className="section">
      <div className="section-head">
        <h2>
          <History size={13} strokeWidth={1.5} />{' '}
          <Hint
            tip={t(
              'Every save keeps the earlier version here (the last 50). Compare shows what changed against the project now; restore loads that version as an unsaved change you can undo.',
              'Каждое сохранение оставляет здесь прошлую версию (последние 50). «Сравнить» показывает отличия от проекта сейчас; «восстановить» загружает версию как несохранённое изменение, которое можно отменить.',
            )}
          >
            {t('versions', 'версии')}
          </Hint>
        </h2>
        {changes && (
          <button className="text-btn" onClick={() => setShowUnsaved(!showUnsaved)}>
            {t(`unsaved: ${changes.keys.length} keys, ${changes.encoders.length} encoder actions`, `не сохранено: клавиш ${changes.keys.length}, энкодеров ${changes.encoders.length}`)}
            {changes.sections.length ? ` +${changes.sections.length}` : ''} {showUnsaved ? '▴' : '▾'}
          </button>
        )}
      </div>
      {showUnsaved && changes && saved && (
        <div className="panel-box" style={{ marginBottom: 'var(--gap)' }}>
          <div className="panel-box-head">
            <span className="cell-label">{t('saved version → now', 'сохранённая версия → сейчас')}</span>
          </div>
          <div className="panel-box-body">
            <DiffView diff={changes} before={saved} />
          </div>
        </div>
      )}
      <div className="panel-box">
        <div className="rows">
          {list.map((r) => (
            <div key={r.file}>
              <div className={`row ${compare?.file === r.file ? 'is-active' : ''}`} style={{ ['--row-cols' as string]: 'minmax(0,1fr) 90px auto' }}>
                <span>
                  {new Date(r.at).toLocaleString(locale())} {r.label && <span className="badge badge--dim">{r.label}</span>}
                </span>
                <span className="kicker">{Math.round(r.size / 1024)} KB</span>
                <div className="row-actions">
                  <button className="btn" onClick={() => void openCompare(r.file)}>
                    {compare?.file === r.file ? t('hide', 'скрыть') : t('compare', 'сравнить')}
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      void restore(r.file).then((iss) => {
                        toast(t('Version restored — Ctrl+Z to undo, Ctrl+S to keep', 'Версия восстановлена — Ctrl+Z отменит, Ctrl+S сохранит'));
                        if (iss.some((i) => i.level === 'error')) toastError(t('The version was restored, but it has problems.', 'Версия восстановлена, но в ней есть проблемы.'), iss[0].message);
                      })
                    }
                  >
                    {t('restore', 'восстановить')}
                  </button>
                </div>
              </div>
              {compare?.file === r.file && compareDiff && (
                <div style={{ padding: '8px 12px 12px', borderBottom: 'var(--border)' }}>
                  <span className="cell-label">{t('this version → now', 'эта версия → сейчас')}</span>
                  <DiffView diff={compareDiff} before={compare.old} />
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && <EmptyState what={t('Earlier versions appear after the next saves.', 'Прошлые версии появятся после следующих сохранений.')} />}
        </div>
      </div>
      {navi && (
        <button className="text-btn" style={{ marginTop: 8 }} onClick={() => void navi!.openPath('projects')}>
          {t('open the projects folder', 'открыть папку проектов')}
        </button>
      )}
    </section>
  );
}

export function ProjectsPage({ tab }: { tab?: string }) {
  const active = currentTab('projects', tab);
  return (
    <div className="page">
      <Tabs
        idBase="projects"
        label={t('Projects', 'Проекты')}
        items={tabItems('projects')}
        current={active}
        href={(id) => href(tabRoute('projects', id))}
        sticky
      />
      <TabPanels idBase="projects" ids={['list', 'current', 'new']} current={active} render={(id) => (id === 'list' ? <ProjectList /> : id === 'current' ? <CurrentProject /> : <NewProject />)} />
    </div>
  );
}
