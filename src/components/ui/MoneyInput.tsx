import { useState, useEffect, type ChangeEvent } from 'react';
import { Input } from './Input';
import { parseMoney } from '@/lib/format';

/**
 * Money input — accepts user-typed strings, exposes the value
 * as integer cents to the parent. Always renders in IBM Plex Mono
 * with a leading "$".
 *
 * The parent owns the canonical numeric value; this component
 * keeps a local string for keystroke ergonomics so the user can
 * type "1234." mid-edit without losing the decimal.
 */
interface MoneyInputProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Value in integer cents. */
  value: number;
  onChange: (cents: number) => void;
  placeholder?: string;
  name?: string;
  id?: string;
}

export function MoneyInput({
  label,
  hint,
  error,
  value,
  onChange,
  placeholder = '0.00',
  name,
  id,
}: MoneyInputProps) {
  const [text, setText] = useState(() => (value === 0 ? '' : (value / 100).toFixed(2)));

  // Reflect external value changes back into the local string
  // (e.g. when settings load from the server).
  useEffect(() => {
    const externalText = value === 0 ? '' : (value / 100).toFixed(2);
    if (parseMoney(text) !== value) {
      setText(externalText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setText(next);
    onChange(parseMoney(next));
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
      leading={<span className="text-sm">$</span>}
      dataNumeric
      value={text}
      onChange={handleChange}
    />
  );
}
