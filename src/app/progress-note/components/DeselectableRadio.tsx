'use client';

import { useCallback, useSyncExternalStore } from 'react';

interface DeselectableRadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked' | 'onChange'> {
  name: string;
  value: string;
}

// Restore radio state from localStorage on init
const RADIO_STORAGE_KEY = 'progress-note-radio-draft';
const savedRadioState = typeof window !== 'undefined' ? localStorage.getItem(RADIO_STORAGE_KEY) : null;
const radioState: Record<string, string> = savedRadioState ? JSON.parse(savedRadioState) : {};

// Per-name listener sets — each radio only subscribes to changes on its own name
const nameListeners = new Map<string, Set<() => void>>();
// Global listeners for components that need to watch all radio state (e.g. conditional fields)
const globalListeners = new Set<() => void>();

/** Subscribe to changes for a specific radio group name */
function subscribeToName(name: string) {
  return (callback: () => void) => {
    if (!nameListeners.has(name)) {
      nameListeners.set(name, new Set());
    }
    nameListeners.get(name)!.add(callback);
    return () => {
      nameListeners.get(name)?.delete(callback);
    };
  };
}

/** Get snapshot for a specific radio group name */
function getSnapshotForName(name: string) {
  return () => radioState[name] ?? '';
}

/** Global subscribe for components watching any radio value (e.g. conditional sections) */
function subscribe(callback: () => void) {
  globalListeners.add(callback);
  return () => globalListeners.delete(callback);
}

/** Global snapshot — only used by components that watch all radio state */
let globalVersion = 0;
function getSnapshot() {
  return globalVersion;
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
  // Notify only listeners for this specific name
  nameListeners.get(name)?.forEach(cb => cb());
  // Notify global listeners
  globalVersion++;
  globalListeners.forEach(cb => cb());
}

function clearRadioStorage() {
  Object.keys(radioState).forEach(key => delete radioState[key]);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(RADIO_STORAGE_KEY);
  }
  // Notify all name-specific listeners
  nameListeners.forEach(listeners => listeners.forEach(cb => cb()));
  // Notify global listeners
  globalVersion++;
  globalListeners.forEach(cb => cb());
}

export { setRadio, radioState, clearRadioStorage, subscribe as radioSubscribe, getSnapshot as radioGetSnapshot };

export default function DeselectableRadio({ name, value, ...props }: DeselectableRadioProps) {
  // Each radio only re-renders when its own group's value changes
  const currentValue = useSyncExternalStore(subscribeToName(name), getSnapshotForName(name), getSnapshotForName(name));

  const isChecked = currentValue === value;

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
