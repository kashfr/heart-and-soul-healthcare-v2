import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { versionInfo } from './route';

describe('versionInfo', () => {
  it('reports the commit, build id and build time baked into the image', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ver-'));
    const file = join(dir, 'built-at.txt');
    writeFileSync(file, '2026-09-30T19:55:00Z\n');
    expect(versionInfo({ APP_COMMIT: 'd945aafb6ffb3f746ca746826e8bef460437a4c6', APP_BUILD_ID: 'b-1', NODE_ENV: 'production' }, file)).toEqual({
      commit: 'd945aafb6ffb3f746ca746826e8bef460437a4c6',
      shortCommit: 'd945aaf',
      buildId: 'b-1',
      builtAt: '2026-09-30T19:55:00Z',
      env: 'production',
    });
  });

  it('reports dev and nulls when nothing is baked in (next dev, or a manual build)', () => {
    expect(versionInfo({ APP_COMMIT: 'manual', NODE_ENV: 'development' }, join(tmpdir(), 'missing-built-at.txt'))).toEqual({
      commit: null,
      shortCommit: null,
      buildId: null,
      builtAt: null,
      env: 'dev',
    });
  });
});
