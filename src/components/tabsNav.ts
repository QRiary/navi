/**
 * Keyboard moves inside a tab bar (WAI-ARIA tabs pattern, horizontal): ←/→ go to the previous/next tab and wrap
 * around, Home/End go to the first/last one. Returns the tab index to select, or null for a key the bar ignores.
 */
export function nextTabIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const at = current >= 0 && current < count ? current : 0;
  switch (key) {
    case 'ArrowRight':
      return (at + 1) % count;
    case 'ArrowLeft':
      return (at - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
