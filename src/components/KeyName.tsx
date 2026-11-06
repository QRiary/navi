/** A readable key name with its QMK expression after it (dim, monospace) and in the tooltip, for people writing C. */
import type { FriendlyName } from '../core/keycodes/friendly';

export function KeyName({ name, className }: { name: FriendlyName; className?: string }) {
  return (
    <span className={className} title={name.qmk}>
      {name.text}
      {name.text !== name.qmk && (
        <>
          {/* a real space, not only the margin: a double-click selects one word and needs the boundary */}
          {' '}
          <code className="qmk-sub qmk-sub--inline">{name.qmk}</code>
        </>
      )}
    </span>
  );
}
