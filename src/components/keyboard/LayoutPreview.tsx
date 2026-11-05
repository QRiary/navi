/**
 * A small layer drawing — for the layer list, comparison and encoders (view only), and the combos keyboard
 * (`onKey`: keys become buttons, with counts and a selection).
 */
import { useMemo, type KeyboardEvent } from 'react';
import { geometryBounds } from '../../core/layout/geometry';
import type { Geometry, MatrixPos } from '../../core/project/types';
import type { KeyLabel } from '../../core/keycodes/labels';

interface Props {
  geometry: Geometry;
  label: (matrix: [number, number]) => KeyLabel | null;
  /** Positions to highlight (for example, differences). */
  marked?: Set<string>;
  /** Fixed height in px; 'auto' = as wide as the column, height from the layout's proportions, up to `maxHeight`. */
  height?: number | 'auto';
  maxHeight?: number;
  /** Clickable keys (keys with a matrix position): click, Enter or Space. Without it the drawing is decorative. */
  onKey?: (matrix: MatrixPos) => void;
  /** What the clickable drawing is, for screen readers. */
  ariaLabel?: string;
  /** Positions drawn selected (inverted). */
  selected?: Set<string>;
  /** A small number or tag in a key's corner (e.g. how many combos use it). */
  badge?: (matrix: MatrixPos) => string | number | null | undefined;
  /** A key's tooltip and accessible name. */
  keyTitle?: (matrix: MatrixPos) => string;
}

const S = 40;

export function LayoutPreview({ geometry, label, marked, height = 150, maxHeight = 320, onKey, ariaLabel, selected, badge, keyTitle }: Props) {
  const b = useMemo(() => geometryBounds(geometry), [geometry]);
  const pad = 0.2;
  const vb = `${(b.x - pad) * S} ${(b.y - pad) * S} ${(b.w + pad * 2) * S} ${(b.h + pad * 2) * S}`;
  const size = height === 'auto' ? { width: '100%', height: 'auto', maxHeight } : { height, width: '100%' };
  const interactive = !!onKey;
  return (
    <svg
      className={`kb-svg kb-preview ${interactive ? 'kb-preview--interactive' : ''}`}
      viewBox={vb}
      style={size}
      {...(interactive ? { role: 'group', 'aria-label': ariaLabel } : { 'aria-hidden': true })}
    >
      {geometry.keys.map((k) => {
        const m = k.matrix;
        const l = m ? label(m) : null;
        const pos = m ? `${m[0]},${m[1]}` : '';
        const isMarked = m && marked?.has(pos);
        const isSelected = m && selected?.has(pos);
        const text = l ? (l.kind === 'transparent' ? '' : l.main) : '';
        const tag = m && badge ? badge(m) : null;
        const title = m && keyTitle ? keyTitle(m) : undefined;
        const clickable = interactive && m;
        const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          onKey!(m!);
        };
        return (
          <g
            key={k.id}
            className={`kb-key kb-key--${l?.kind ?? 'none'} ${isMarked ? 'is-highlighted' : ''} ${isSelected ? 'is-selected' : ''}`}
            transform={k.r ? `rotate(${k.r} ${k.rx * S} ${k.ry * S})` : undefined}
            {...(clickable ? { role: 'button', tabIndex: 0, 'aria-label': title, 'aria-pressed': !!isSelected, onClick: () => onKey!(m), onKeyDown } : {})}
          >
            {title && <title>{title}</title>}
            <rect className="kb-key-shape" x={k.x * S + 1.5} y={k.y * S + 1.5} width={k.w * S - 3} height={k.h * S - 3} />
            {text && (
              <text className="kb-key-main" x={(k.x + k.w / 2) * S} y={(k.y + k.h / 2) * S} style={{ fontSize: text.length <= 2 ? 13 : text.length <= 5 ? 9.5 : 7.5 }}>
                {text.length > 7 ? `${text.slice(0, 6)}…` : text}
              </text>
            )}
            {tag !== null && tag !== undefined && tag !== '' && (
              <text className="kb-preview-badge" x={(k.x + k.w) * S - 5} y={k.y * S + 12}>
                {tag}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
