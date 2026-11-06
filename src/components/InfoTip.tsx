/**
 * INFO TIP: a small “?” next to a label that explains a QMK concept or a non-obvious field in 1-3 plain sentences,
 * with an optional “QMK docs” link (opened in the system browser).
 *  • hovering or focusing the “?” shows the bubble; leaving both the “?” and the bubble hides it;
 *  • a click (or Enter / Space) pins it and moves focus to the docs link, so the keyboard can reach it; Esc or a
 *    click elsewhere closes a pinned bubble and focus goes back to the “?”.
 * The bubble is rendered into document.body: panels use backdrop-filter, which would trap a fixed element inside.
 * A string tip may be structured (TipText): each line is its own paragraph, and lines starting with “- ” form a list,
 * one option per line with its “Term:” in bold. Use it whenever a tip names several options or values.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';
import { t } from '../i18n';
import { openDocs } from '../lib/qmkDocs';

const GAP = 4;
const WIDTH = 320;
const HIDE_DELAY = 150;

export function InfoTip({ children, docs, label }: { children: ReactNode; docs?: string; label?: string }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setOpen(true);
  }, []);
  const hideSoon = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setOpen(false), HIDE_DELAY);
  }, []);
  const close = useCallback((refocus: boolean) => {
    window.clearTimeout(hideTimer.current);
    setOpen(false);
    setPinned(false);
    if (refocus) btn.current?.focus();
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const r = btn.current?.getBoundingClientRect();
    const h = bubble.current?.offsetHeight ?? 0;
    if (!r) return;
    const width = Math.min(WIDTH, window.innerWidth - 2 * GAP);
    const left = Math.max(GAP, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - GAP));
    // Under the “?” if it fits, else above it.
    const below = r.bottom + GAP;
    const top = below + h <= window.innerHeight - GAP ? below : Math.max(GAP, r.top - GAP - h);
    setPos({ left, top });
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    bubble.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!bubble.current?.contains(target) && !btn.current?.contains(target)) close(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, [pinned, close]);

  // Esc also hides a bubble shown by focus alone.
  const onBtnKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape' && open && !pinned) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`info-tip ${open ? 'is-open' : ''}`}
        aria-label={label ? t(`About: ${label}`, `Что это: ${label}`) : t('What is this?', 'Что это?')}
        aria-describedby={open ? id : undefined}
        aria-expanded={pinned}
        onMouseEnter={show}
        onMouseLeave={() => !pinned && hideSoon()}
        onFocus={show}
        onBlur={(e) => {
          if (!pinned && !bubble.current?.contains(e.relatedTarget as Node)) hideSoon();
        }}
        onKeyDown={onBtnKey}
        onClick={(e) => {
          // A click inside a <label> must not toggle the label's checkbox.
          e.preventDefault();
          e.stopPropagation();
          if (pinned) close(false);
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
      >
        ?
      </button>
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            className="info-bubble"
            style={{
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              width: Math.min(WIDTH, window.innerWidth - 2 * GAP),
            }}
            onMouseEnter={show}
            onMouseLeave={() => !pinned && hideSoon()}
            onBlur={(e) => {
              // Tab out of a pinned bubble: close it (focus already left, so don't pull it back).
              if (pinned && !bubble.current?.contains(e.relatedTarget as Node) && e.relatedTarget !== btn.current) close(false);
            }}
          >
            <div className="info-bubble-text">{typeof children === 'string' ? <TipText text={children} /> : children}</div>
            {docs && (
              <button type="button" className="text-btn info-bubble-link" onClick={() => openDocs(docs)}>
                {t('QMK docs', 'Документация QMK')} <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Paragraph per line; consecutive “- Term: text” lines become a list, the term in bold. */
export function TipText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let items: ReactNode[] = [];
  const flush = () => {
    if (items.length) blocks.push(<ul key={blocks.length}>{items}</ul>);
    items = [];
  };
  for (const line of text.split('\n')) {
    const item = /^- (?:([^:]{1,40}): )?(.*)$/.exec(line);
    if (item) {
      items.push(
        <li key={items.length}>
          {item[1] && <strong>{item[1]}: </strong>}
          {item[2]}
        </li>,
      );
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{line}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** A label with its InfoTip after it: `<Hint tip="…" docs={…}>flavor</Hint>`. */
export function Hint({ children, tip, docs }: { children: ReactNode; tip: ReactNode; docs?: string }) {
  const label = typeof children === 'string' ? children : undefined;
  const cut = label ? label.lastIndexOf(' ') + 1 : 0;
  return (
    <span className="with-tip">
      {label ? label.slice(0, cut) : children}
      {/* The last word and the “?” never part: a wrapped label keeps its “?” beside its last word. */}
      <span className="with-tip-tail">
        {label?.slice(cut)}
        <InfoTip docs={docs} label={label}>
          {tip}
        </InfoTip>
      </span>
    </span>
  );
}
