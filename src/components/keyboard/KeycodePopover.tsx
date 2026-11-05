/**
 * The keycode catalog in a popover under a keycode field's button: a pick goes to the field, not to the selected
 * keys. Esc or a click outside closes it; focus goes to its search box and back to the button after.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import { KeycodePicker } from './KeycodePicker';
import { holdShortcuts } from '../Modal';

const WIDTH = 760;
const HEIGHT = 440;
const GAP = 4;

export function KeycodePopover({ anchor, current, onPick, onClose }: { anchor: RefObject<HTMLElement | null>; current: number; onPick: (value: number) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(GAP, Math.min(r.left, window.innerWidth - WIDTH - GAP));
    // Below the button if it fits, else above it, else pinned to the top.
    const below = r.bottom + GAP;
    const top = below + HEIGHT <= window.innerHeight ? below : Math.max(GAP, r.top - GAP - HEIGHT);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const opener = anchor.current;
    const release = holdShortcuts(); // Del / Ctrl+Z must not edit the project behind the catalog
    box.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!box.current?.contains(target) && !opener?.contains(target)) onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      release();
      opener?.focus();
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={box}
      className="kc-popover"
      role="dialog"
      aria-label={t('Pick a keycode', 'Выбор keycode')}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: Math.min(WIDTH, window.innerWidth - 2 * GAP), height: Math.min(HEIGHT, window.innerHeight - 2 * GAP) }}
    >
      <KeycodePicker currentKeycode={current} onPick={onPick} />
    </div>,
    document.body,
  );
}
