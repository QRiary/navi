/**
 * A tab's filter box: hides the rows that don't match. Ctrl+F focuses the box of the tab on screen (`data-list-filter`),
 * Esc empties it (a second Esc leaves it). Shows "shown / total" while filtering.
 */
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from '../i18n';

export function ListFilter({
  value,
  onChange,
  label,
  placeholder,
  shown,
  total,
  children,
}: {
  value: string;
  onChange: (q: string) => void;
  /** What the box filters, for screen readers ("Filter combos"). */
  label: string;
  placeholder: string;
  shown?: number;
  total?: number;
  /** Controls placed on the same line after the count (an add button). */
  children?: ReactNode;
}) {
  return (
    <div className="list-filter-bar">
      <label className="list-filter">
        <Search size={14} strokeWidth={1.5} aria-hidden="true" />
        <input
          className="input"
          type="search"
          data-list-filter=""
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && value) {
              e.preventDefault();
              e.stopPropagation();
              onChange('');
            } else if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          title={t('Filter (Ctrl+F)', 'Фильтр (Ctrl+F)')}
        />
      </label>
      {total !== undefined && (
        <span className="kicker" aria-live="polite">
          {value.trim() && shown !== undefined && shown !== total ? `${shown} / ${total}` : total}
        </span>
      )}
      {children}
    </div>
  );
}
