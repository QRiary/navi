/**
 * THE ONE LIST OF SECTIONS AND TABS: titles (en/ru), icon, route. The sidebar, the top bar, each page's tab bar
 * and the global search all read it, so a title is written once.
 */
import { Cable, Cpu, FolderOpen, Keyboard, Layers, Lightbulb, ListVideo, RotateCw, Settings2, Shapes, Sparkles, type LucideIcon } from 'lucide-react';
import type { TabItem } from '../components/Tabs';
import { t } from '../i18n';

export type Section = 'keyboard' | 'layers' | 'encoders' | 'macros' | 'advanced' | 'lighting' | 'hardware' | 'firmware' | 'device' | 'projects' | 'settings';

export interface TabDef {
  id: string;
  title: () => string;
  /** Group caption over a cluster of tabs (Advanced). */
  group?: () => string;
  /** Tooltip, also searched. */
  tip?: () => string;
}

export interface SectionDef {
  id: Section;
  title: () => string;
  icon: LucideIcon;
  /** Tabs in bar order; the first is the default (its address carries no tab). */
  tabs?: TabDef[];
}

const keys = () => t('Keys', 'Клавиши');
const codes = () => t('Codes', 'Коды');
const behavior = () => t('Behavior', 'Поведение');

export const SECTIONS: readonly SectionDef[] = [
  { id: 'keyboard', title: () => t('Keyboard', 'Клавиатура'), icon: Keyboard },
  { id: 'layers', title: () => t('Layers', 'Слои'), icon: Layers },
  { id: 'encoders', title: () => t('Encoders', 'Энкодеры'), icon: RotateCw },
  { id: 'macros', title: () => t('Macros', 'Макросы'), icon: ListVideo },
  {
    id: 'advanced',
    title: () => t('Advanced', 'Расширенное'),
    icon: Sparkles,
    tabs: [
      { id: 'tapdance', title: () => t('Tap dance', 'Тап-дэнс'), group: keys },
      { id: 'taphold', title: () => t('Tap-hold', 'Тап-холд'), group: keys },
      { id: 'combos', title: () => t('Combos', 'Комбо'), group: keys },
      { id: 'overrides', title: () => t('Key overrides', 'Подмена сочетаний'), group: keys },
      { id: 'leader', title: () => t('Leader key', 'Клавиша-лидер'), group: keys },
      { id: 'custom', title: () => t('Custom keycodes', 'Свои keycodes'), group: codes },
      { id: 'aliases', title: () => t('Aliases', 'Псевдонимы'), group: codes },
      { id: 'unicode', title: () => t('Unicode', 'Юникод'), group: codes },
      {
        id: 'languages',
        title: () => t('Languages', 'Языки'),
        group: behavior,
        tip: () => t('The languages the keyboard types in, their keys and how text outside plain keys is typed', 'Языки, на которых печатает клавиатура, их клавиши и способ печати текста вне обычных клавиш'),
      },
      {
        id: 'behavior',
        title: () => t('QMK settings', 'Настройки QMK'),
        group: behavior,
        tip: () => t("QMK's own settings: defines NAVI writes into config.h", 'Собственные настройки QMK: define, которые NAVI пишет в config.h'),
      },
      {
        id: 'navi',
        title: () => t('NAVI additions', 'Дополнения NAVI'),
        group: behavior,
        tip: () => t('Behaviors QMK does not have: C code NAVI generates into keymap.c', 'Поведение, которого нет в QMK: код на C, который NAVI генерирует в keymap.c'),
      },
    ],
  },
  { id: 'lighting', title: () => t('Lighting', 'Подсветка'), icon: Lightbulb },
  {
    id: 'hardware',
    title: () => t('Hardware', 'Железо'),
    icon: Shapes,
    tabs: [
      { id: 'geometry', title: () => t('Geometry', 'Геометрия') },
      { id: 'profile', title: () => t('Hardware profile', 'Профиль железа') },
      { id: 'variants', title: () => t('Geometry variants', 'Варианты геометрии') },
      { id: 'pins', title: () => t('Board pins (firmware)', 'Выводы платы (прошивка)') },
    ],
  },
  {
    id: 'firmware',
    title: () => t('Firmware', 'Прошивка'),
    icon: Cpu,
    tabs: [
      { id: 'setup', title: () => t('1 · Environment', '1 · Окружение') },
      { id: 'target', title: () => t('2 · Keyboard', '2 · Клавиатура') },
      { id: 'features', title: () => t('3 · Features', '3 · Функции') },
      { id: 'files', title: () => t('4 · Keymap files', '4 · Файлы keymap') },
      { id: 'build', title: () => t('5 · Build', '5 · Сборка') },
      { id: 'flash', title: () => t('6 · Flash', '6 · Прошить') },
    ],
  },
  { id: 'device', title: () => t('Device', 'Устройство'), icon: Cable },
  {
    id: 'projects',
    title: () => t('Projects', 'Проекты'),
    icon: FolderOpen,
    tabs: [
      { id: 'list', title: () => t('All projects', 'Все проекты') },
      { id: 'current', title: () => t('Current: import / export / versions', 'Текущий: импорт / экспорт / версии') },
      { id: 'new', title: () => t('New project', 'Новый проект') },
    ],
  },
  {
    id: 'settings',
    title: () => t('Settings', 'Настройки'),
    icon: Settings2,
    tabs: [
      { id: 'quick', title: () => t('Main', 'Основное') },
      { id: 'config', title: () => t('Config', 'Конфиг') },
    ],
  },
];

export const SECTION_IDS: readonly Section[] = SECTIONS.map((s) => s.id);

export function sectionDef(id: Section): SectionDef {
  return SECTIONS.find((s) => s.id === id)!;
}

/** The tab a section shows when the address names none. */
export function defaultTab(section: Section): string | undefined {
  return sectionDef(section).tabs?.[0].id;
}

/** The tab to show: the address's tab if the section has it, else the default. */
export function currentTab(section: Section, tab: string | undefined): string {
  const tabs = sectionDef(section).tabs ?? [];
  return tabs.some((d) => d.id === tab) ? tab! : (tabs[0]?.id ?? '');
}

/** The section's tabs for `<Tabs>`. */
export function tabItems(section: Section): TabItem[] {
  return (sectionDef(section).tabs ?? []).map((d) => ({ id: d.id, label: d.title(), title: d.tip?.(), group: d.group?.() }));
}

/** The address of a tab: the default tab's address names no tab. */
export function tabRoute(section: Section, tab: string): { section: Section; tab?: string } {
  return tab === defaultTab(section) ? { section } : { section, tab };
}
