import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What is deployed. Public and secret-free on purpose: it answers "did the
 * merge deploy yet?" in one request, from a browser or curl:
 *
 *   https://www.heartandsoulhc.org/api/version
 *
 * The commit and build id are baked into the image by Cloud Build (see
 * cloudbuild.yaml, which passes $COMMIT_SHA / $BUILD_ID as build args, and
 * the Dockerfile, which carries them into the runtime stage). The build
 * time is stamped by the Dockerfile at image build. A local `next dev`
 * reports "dev" and nulls.
 */
export interface VersionInfo {
  commit: string | null;
  shortCommit: string | null;
  buildId: string | null;
  builtAt: string | null;
  env: string;
}

const clean = (v: string | undefined): string | null => {
  const s = (v || '').trim();
  return s && s !== 'manual' ? s : null;
};

export function versionInfo(env: NodeJS.ProcessEnv = process.env, builtAtFile?: string): VersionInfo {
  const commit = clean(env.APP_COMMIT);
  let builtAt = clean(env.APP_BUILT_AT);
  if (!builtAt && builtAtFile) {
    try {
      builtAt = clean(readFileSync(builtAtFile, 'utf8'));
    } catch {
      builtAt = null;
    }
  }
  return {
    commit,
    shortCommit: commit ? commit.slice(0, 7) : null,
    buildId: clean(env.APP_BUILD_ID),
    builtAt,
    env: env.NODE_ENV === 'production' ? 'production' : 'dev',
  };
}

export async function GET() {
  return NextResponse.json(versionInfo(process.env, join(process.cwd(), 'built-at.txt')), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
