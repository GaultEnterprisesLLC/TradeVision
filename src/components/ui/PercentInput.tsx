import { useState, useEffect, type ChangeEvent } from 'react';
import { Input } from './Input';

/**
 * Percent input — accepts whole-number user input ("6.25"),
 * exposes a fraction value to the parent (0.0625).
 *
 * Used for state tax rates, markup %, margin %.
 */
interface PercentInputProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Value as fraction (0.0625 = 6.25%). */
  value: number;
  onChange: (fraction: number) => void;
  placeholder?: string;
  name?: string;
  id?: string;
}

export function PercentInput({
  label,
  hint,
  error,
  value,
  onChange,
  placeholder = '0.00',
  name,
  id,
}: PercentInputProps) {
  const [text, setText] = useState(() =>
    value === 0 ? '' : (value * 100).toFixed(2),
  );

  useEffect(() => {
    const external = value === 0 ? '' : (value * 100).toFixed(2);
    const parsed = parseFloat(text || '0') / 100;
    if (Math.abs(parsed - value) > 1e-6) {
      setText(external);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setText(next);
    const fraction = parseFloat(next.replace(/[^0-9.-]/g, '')) / 100;
    onChange(Number.isFinite(fraction) ? fraction : 0);
  }

  return (
    <Input
      label={label}
      hint={hint}
      error={error}
      name={name}
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      trailing={<span className="text-sm">%</span>}
      dataNumeric
      value={text}
      onChange={handleChange}
    />
  );
}
