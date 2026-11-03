import type { CSSProperties } from 'react';

interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
  /** Text for screen readers, for example “1:23 of 3:40”. */
  valueText?: string;
}

/** Slider based on a standard <input type="range"> — works from the keyboard. */
export function Slider({ value, min = 0, max = 1, step = 0.01, onChange, label, className = '', valueText }: SliderProps) {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      className={`slider ${className}`}
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ '--fill': `${Math.min(100, Math.max(0, percent))}%` } as CSSProperties}
    />
  );
}
