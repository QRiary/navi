import { useRef, type KeyboardEvent } from 'react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl+S */
  onSave?: () => void;
  label: string;
  /** Numbers of lines with errors — highlighted on the left. */
  errorLines?: number[];
  minRows?: number;
}

/** Simple code editor: line numbers, Tab = 2 spaces, Ctrl+S = save. */
export function CodeEditor({ value, onChange, onSave, label, errorLines = [], minRows = 24 }: CodeEditorProps) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lines = value.split('\n').length;
  const errors = new Set(errorLines);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'ы')) {
      e.preventDefault();
      onSave?.();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = el;
      const next = `${value.slice(0, start)}  ${value.slice(end)}`;
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
    }
  };

  return (
    <div className="code-editor" style={{ minHeight: `${minRows * 1.6}em` }}>
      <div className="code-gutter" ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errors.has(i + 1) ? 'is-error' : undefined}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        className="code-input"
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        aria-label={label}
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
      />
    </div>
  );
}
