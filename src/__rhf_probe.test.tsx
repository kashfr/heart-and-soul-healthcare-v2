import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { useEffect, useRef, useState } from 'react';
import React from 'react';

const watchIdentities: unknown[] = [];
const effectRuns: number[] = [];
let bump: (() => void) | null = null;
let gv: (() => Record<string, unknown>) | null = null;

function Probe() {
  const { register, watch, getValues } = useForm<Record<string, string>>();
  const [n, setN] = useState(0);
  bump = () => setN((x) => x + 1);
  gv = getValues as () => Record<string, unknown>;
  const watchedAll = watch();
  watchIdentities.push(watchedAll);
  const c = useRef(0);
  useEffect(() => {
    c.current += 1;
    effectRuns.push(c.current);
  }, [watchedAll]);
  return (
    <form>
      <input {...register('a')} />
      <input {...register('b')} />
      <span>{n}</span>
    </form>
  );
}

describe('rhf semantics', () => {
  it('watch() identity + getValues clone', () => {
    render(<Probe />);
    const before = effectRuns.length;
    act(() => { bump!(); });
    act(() => { bump!(); });
    const after = effectRuns.length;
    // eslint-disable-next-line no-console
    console.log('WATCH_IDENTITIES_UNIQUE', new Set(watchIdentities).size, 'of', watchIdentities.length);
    console.log('EFFECT_RUNS_BEFORE', before, 'AFTER', after);

    const v1 = gv!();
    const v2 = gv!();
    console.log('GETVALUES_SAME_REF', v1 === v2);
    v1.injected = 'polluted';
    const v3 = gv!();
    console.log('GETVALUES_MUTATION_LEAKS', 'injected' in v3);
    console.log('KEYS', JSON.stringify(Object.keys(v3)));
    console.log('VALUES', JSON.stringify(v3));
    expect(true).toBe(true);
  });
});
