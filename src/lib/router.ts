import { useEffect, useState } from 'react';

/**
 * Simple router on addresses like #/keyboard, #/firmware/build.
 * The Back/Forward buttons (mouse, Alt+←) just work.
 */

export type Section =
  | 'keyboard'
  | 'layers'
  | 'encoders'
  | 'macros'
  | 'advanced'
  | 'lighting'
  | 'hardware'
  | 'firmware'
  | 'device'
  | 'projects'
  | 'settings';

export interface Route {
  section: Section;
  /** Tab inside the section. */
  tab?: string;
}

const SECTIONS: Section[] = ['keyboard', 'layers', 'encoders', 'macros', 'advanced', 'lighting', 'hardware', 'firmware', 'device', 'projects', 'settings'];

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  const section = (SECTIONS as string[]).includes(parts[0]) ? (parts[0] as Section) : 'keyboard';
  return { section, tab: parts[1] ? decodeURIComponent(parts[1]) : undefined };
}

export function href(route: Route): string {
  return `#/${route.section}${route.tab ? `/${encodeURIComponent(route.tab)}` : ''}`;
}

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  const target = href(route);
  if (options.replace) {
    history.replaceState(null, '', target);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = target;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
