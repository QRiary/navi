/**
 * A small layer drawing (view only) — for the layer list, comparison and encoders.
 */
import { useMemo } from 'react';
import { geometryBounds } from '../../core/layout/geometry';
import type { Geometry } from '../../core/project/types';
import type { KeyLabel } from '../../core/keycodes/labels';

interface Props {
  geometry: Geometry;
  label: (matrix: [number, number]) => KeyLabel | null;
  /** Positions to highlight (for example, differences). */
  marked?: Set<string>;
  /** Fixed height in px; 'auto' = as wide as the column, height from the layout's proportions, up to `maxHeight`. */
  height?: number | 'auto';
  maxHeight?: number;
}

const S = 40;

export function LayoutPreview({ geometry, label, marked, height = 150, maxHeight = 320 }: Props) {
  const b = useMemo(() => geometryBounds(geometry), [geometry]);
  const pad = 0.2;
  const vb = `${(b.x - pad) * S} ${(b.y - pad) * S} ${(b.w + pad * 2) * S} ${(b.h + pad * 2) * S}`;
  const size = height === 'auto' ? { width: '100%', height: 'auto', maxHeight } : { height, width: '100%' };
  return (
    <svg className="kb-svg kb-preview" viewBox={vb} style={size} aria-hidden="true">
      {geometry.keys.map((k) => {
        const l = k.matrix ? label(k.matrix) : null;
        const isMarked = k.matrix && marked?.has(`${k.matrix[0]},${k.matrix[1]}`);
        const text = l ? (l.kind === 'transparent' ? '' : l.main) : '';
        return (
          <g key={k.id} className={`kb-key kb-key--${l?.kind ?? 'none'} ${isMarked ? 'is-highlighted' : ''}`} transform={k.r ? `rotate(${k.r} ${k.rx * S} ${k.ry * S})` : undefined}>
            <rect className="kb-key-shape" x={k.x * S + 1.5} y={k.y * S + 1.5} width={k.w * S - 3} height={k.h * S - 3} />
            {text && (
              <text className="kb-key-main" x={(k.x + k.w / 2) * S} y={(k.y + k.h / 2) * S} style={{ fontSize: text.length <= 2 ? 13 : text.length <= 5 ? 9.5 : 7.5 }}>
                {text.length > 7 ? `${text.slice(0, 6)}…` : text}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
