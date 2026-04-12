'use client';

import { useEffect, useCallback, useSyncExternalStore } from 'react';

interface DeselectableRadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
  name: string;
  value: string;
}

// Restore radio state from localStorage on init
const RADIO_STORAGE_KEY = 'progress-note-radio-draft';
const savedRadioState = typeof window !== 'undefined' ? localStorage.getItem(RADIO_STORAGE_KEY) : null;
const radioState: Record<string, string> = savedRadioState ? JSON.parse(savedRadioState) : {};
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
  // Persist to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem(RADIO_STORAGE_KEY, JSON.stringify(radioState));
  }
  listeners.forEach(cb => cb());
}

function clearRadioStorage() {
  Object.keys(radioState).forEach(key => delete radioState[key]);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(RADIO_STORAGE_KEY);
  }
  listeners.forEach(cb => cb());
}

export { setRadio, radioState, clearRadioStorage, subscribe as radioSubscribe, getSnapshot as radioGetSnapshot };

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
