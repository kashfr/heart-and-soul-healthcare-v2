'use client';

import { useEffect, useCallback, useSyncExternalStore } from 'react';

interface DeselectableRadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
  name: string;
  value: string;
}

// Simple global store for radio group state
const radioState: Record<string, string> = {};
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot() {
  return JSON.stringify(radioState);
}

function setRadio(name: string, value: string | null) {
  if (value === null) {
    delete radioState[name];
  } else {
    radioState[name] = value;
  }
  listeners.forEach(cb => cb());
}

export { setRadio, radioState, subscribe as radioSubscribe, getSnapshot as radioGetSnapshot };

export default function DeselectableRadio({ name, value, ...props }: DeselectableRadioProps) {
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const isChecked = radioState[name] === value;

  const handleClick = useCallback(() => {
    if (isChecked) {
      setRadio(name, null);
    } else {
      setRadio(name, value);
    }
  }, [name, value, isChecked]);

  return (
    <input
      {...props}
      type="radio"
      name={name}
      value={value}
      checked={isChecked}
      onChange={() => {}}
      onClick={handleClick}
    />
  );
}
