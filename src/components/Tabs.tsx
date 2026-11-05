/**
 * One tab bar for the whole app (WAI-ARIA tabs pattern). Two kinds:
 * - route tabs (`href`): each tab is a link, so Back/Forward keep working; a page's main bar, sticky on top;
 * - state tabs (`onSelect`): buttons that switch something inside a page (generated files, layers, composer kinds).
 * Every tab's `aria-controls` points at an element that exists: its own `TabPanel` (`TabPanels` renders an empty
 * hidden one for tabs not visited yet), or with `panelId` one element shared by all tabs (`SharedTabPanel`).
 * Roving tabindex: only the current tab is in the Tab order; ←/→, Home/End move and select at once.
 * `TabPanels` keeps every visited panel mounted (hidden when inactive), so local edits survive a tab switch.
 */
import { Fragment, useEffect, useRef,type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { nextTabIndex } from './tabsNav';

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Tooltip. */
  title?: string;
  /** Group caption: consecutive tabs with the same group are shown as one cluster under it. */
  group?: string;
}

type TabsProps = {
  /** Prefix for the DOM ids of the tabs and their panels (unique on the page). */
  idBase: string;
  /** What the bar switches, for screen readers. */
  label: string;
  items: TabItem[];
  current: string;
  /** Page-level bar: stays on top of the scrolling page. */
  sticky?: boolean;
  style?: CSSProperties;
  /** The bar's class instead of `tabs` (layer bars and chips keep their own look). */
  className?: string;
  /** Each tab's class instead of `tab`, and the current tab's extra class (default `is-active`). */
  tabClassName?: string;
  activeClassName?: string;
  /** One element all tabs control (a shared panel, the page), instead of a panel per tab. */
  panelId?: string;
  /** Pointer or focus on a tab (`id`), and leaving it (`null`). */
  onHover?: (id: string | null) => void;
  /** Arrows only move focus; Enter/Space selects (for tabs whose selecting changes data, like the composer's kinds). */
  manual?: boolean;
} & ({ href: (id: string) => string; onSelect?: never } | { onSelect: (id: string) => void; href?: never });

export const tabDomId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const panelDomId = (idBase: string, id: string) => `${idBase}-panel-${id}`;
export const sharedPanelDomId = (idBase: string) => `${idBase}-panel`;

export function Tabs(props: TabsProps) {
  const { idBase, label, items, current, sticky, style, className, tabClassName = 'tab', activeClassName = 'is-active', panelId, onHover, manual } = props;
  const refs = useRef(new Map<string, HTMLElement>());
  const barRef = useRef<HTMLDivElement>(null);

  // A sticky bar tells its scroll area how tall it is (`--sticky-tabs-h`), so a panel's own sticky block
  // (the combos keyboard) can stick right under it.
  useEffect(() => {
    const bar = barRef.current;
    const area = bar?.closest<HTMLElement>('.page-scroll');
    if (!bar || !area) return;
    const update = () => area.style.setProperty('--sticky-tabs-h', `${bar.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      area.style.removeProperty('--sticky-tabs-h');
    };
  }, [sticky]);

  const select = (id: string) => {
    if (props.href) location.hash = props.href(id);
    else props.onSelect(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const focused = items.findIndex((i) => refs.current.get(i.id) === document.activeElement);
    const next = nextTabIndex(e.key, manual && focused >= 0 ? focused : items.findIndex((i) => i.id === current), items.length);
    if (next === null) return;
    e.preventDefault();
    const id = items[next].id;
    refs.current.get(id)?.focus();
    if (!manual && id !== current) select(id);
  };

  const renderTab = (item: TabItem, describedBy?: string) => {
    const selected = item.id === current;
    const common = {
      ref: (el: HTMLElement | null) => {
        if (el) refs.current.set(item.id, el);
        else refs.current.delete(item.id);
      },
      id: tabDomId(idBase, item.id),
      role: 'tab',
      'aria-selected': selected,
      'aria-controls': panelId ?? panelDomId(idBase, item.id),
      'aria-describedby': describedBy,
      tabIndex: selected ? 0 : -1,
      title: item.title,
      className: `${tabClassName} ${selected ? activeClassName : ''}`,
      ...(onHover && {
        onMouseEnter: () => onHover(item.id),
        onMouseLeave: () => onHover(null),
        onFocus: () => onHover(item.id),
        onBlur: () => onHover(null),
      }),
    } as const;
    return props.href ? (
      <a key={item.id} {...common} href={props.href(item.id)}>
        {item.label}
      </a>
    ) : (
      <button key={item.id} {...common} type="button" onClick={() => select(item.id)}>
        {item.label}
      </button>
    );
  };

  // Consecutive tabs of one group form a cluster with its caption.
  const clusters: { group?: string; items: TabItem[] }[] = [];
  for (const item of items) {
    const last = clusters[clusters.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else clusters.push({ group: item.group, items: [item] });
  }
  const grouped = clusters.some((c) => c.group);

  return (
    <div ref={sticky ? barRef : undefined} className={`${className ?? 'tabs'} ${sticky ? 'tabs--sticky' : ''}`} role="tablist" aria-label={label} style={style} onKeyDown={onKeyDown}>
      {grouped
        ? clusters.map((c, n) => {
            const captionId = c.group ? `${idBase}-group-${n}` : undefined;
            return (
              <div key={n} className="tabs-group" role="presentation">
                {c.group && (
                  <span id={captionId} className="tabs-caption" aria-hidden="true">
                    {c.group}
                  </span>
                )}
                <div className="tabs-group-row" role="presentation">
                  {c.items.map((i) => renderTab(i, captionId))}
                </div>
              </div>
            );
          })
        : items.map((i) => <Fragment key={i.id}>{renderTab(i)}</Fragment>)}
    </div>
  );
}

/** A tab's panel: always in the DOM once rendered, hidden while another tab is current. */
export function TabPanel({ idBase, id, current, children, className, style }: { idBase: string; id: string; current: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div id={panelDomId(idBase, id)} role="tabpanel" aria-labelledby={tabDomId(idBase, id)} hidden={id !== current} className={className ?? 'tab-panel'} style={style}>
      {children}
    </div>
  );
}

/** The one panel all tabs of a bar control (`Tabs` with `panelId={sharedPanelDomId(idBase)}`), labeled by the current tab. */
export function SharedTabPanel({ idBase, current, children, className, style }: { idBase: string; current: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div id={sharedPanelDomId(idBase)} role="tabpanel" aria-labelledby={tabDomId(idBase, current)} className={className} style={style}>
      {children}
    </div>
  );
}

/**
 * Panels of every tab visited so far (mounted on the first visit, kept while the page lives, hidden when
 * inactive). `render` gets `active` so a panel can pause listeners, timers and polling while hidden.
 * A tab not visited yet gets an empty hidden panel, so its `aria-controls` still points at something.
 */
export function TabPanels({ idBase, ids, current, render, className }: { idBase: string; ids: readonly string[]; current: string; render: (id: string, active: boolean) => ReactNode; className?: string }) {
  const visited = useRef(new Set<string>());
  visited.current.add(current);
  return (
    <>
      {ids.map((id) => (
        <TabPanel key={id} idBase={idBase} id={id} current={current} className={className}>
          {visited.current.has(id) ? render(id, id === current) : null}
        </TabPanel>
      ))}
    </>
  );
}
