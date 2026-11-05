/**
 * One tab bar for the whole app (WAI-ARIA tabs pattern). Two kinds:
 * - route tabs (`href`): each tab is a link, so Back/Forward keep working; a page's main bar, sticky on top;
 * - state tabs (`onSelect`): buttons that switch something inside a page (generated files).
 * Roving tabindex: only the current tab is in the Tab order; ←/→, Home/End move and select at once.
 * `TabPanels` keeps every visited panel mounted (hidden when inactive), so local edits survive a tab switch.
 */
import { Fragment, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
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
} & ({ href: (id: string) => string; onSelect?: never } | { onSelect: (id: string) => void; href?: never });

export const tabDomId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const panelDomId = (idBase: string, id: string) => `${idBase}-panel-${id}`;

export function Tabs(props: TabsProps) {
  const { idBase, label, items, current, sticky, style } = props;
  const refs = useRef(new Map<string, HTMLElement>());

  const select = (id: string) => {
    if (props.href) location.hash = props.href(id);
    else props.onSelect(id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const next = nextTabIndex(e.key, items.findIndex((i) => i.id === current), items.length);
    if (next === null) return;
    e.preventDefault();
    const id = items[next].id;
    refs.current.get(id)?.focus();
    if (id !== current) select(id);
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
      'aria-controls': panelDomId(idBase, item.id),
      'aria-describedby': describedBy,
      tabIndex: selected ? 0 : -1,
      title: item.title,
      className: `tab ${selected ? 'is-active' : ''}`,
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
    <div className={`tabs ${sticky ? 'tabs--sticky' : ''}`} role="tablist" aria-label={label} style={style} onKeyDown={onKeyDown}>
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

/**
 * Panels of every tab visited so far (mounted on the first visit, kept while the page lives, hidden when
 * inactive). `render` gets `active` so a panel can pause listeners, timers and polling while hidden.
 */
export function TabPanels({ idBase, ids, current, render, className }: { idBase: string; ids: readonly string[]; current: string; render: (id: string, active: boolean) => ReactNode; className?: string }) {
  const visited = useRef(new Set<string>());
  visited.current.add(current);
  return (
    <>
      {ids
        .filter((id) => visited.current.has(id))
        .map((id) => (
          <TabPanel key={id} idBase={idBase} id={id} current={current} className={className}>
            {render(id, id === current)}
          </TabPanel>
        ))}
    </>
  );
}
