import { useCallback, useLayoutEffect, useRef } from 'react';

/** Scroll positions per section/tab, for this session. */
const positions = new Map<string, number>();

/**
 * Remembers a scroller's position under `key` (section/tab) and restores it when the key comes back, also after
 * visiting another section. Returns a ref for the scrolling element (it may be replaced: page-scroll ⇄ page-fill).
 */
export function useScrollMemory(key: string) {
  const keyRef = useRef(key);
  const elRef = useRef<HTMLElement | null>(null);

  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    elRef.current = el;
    el.scrollTop = positions.get(keyRef.current) ?? 0;
    // Read at dispatch time: by then the key is the current one and the position is final.
    const onScroll = () => positions.set(keyRef.current, el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (elRef.current === el) elRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    if (elRef.current) elRef.current.scrollTop = positions.get(key) ?? 0;
  }, [key]);

  return ref;
}
