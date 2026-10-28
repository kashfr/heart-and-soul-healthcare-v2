// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  updates: [] as Array<{ uid: string; data: Record<string, unknown> }>,
}));
vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));
vi.mock('./firebaseAdmin', () => ({
  adminDb: () => ({
    collection: () => ({
      where: (_field: string, _op: string, role: string) => ({
        get: async () => ({
          docs: [...fake.users].filter(([, data]) => data.role === role).map(([uid, data]) => ({ id: uid, ref: { uid }, data: () => data })),
        }),
      }),
    }),
    batch: () => ({
      update: (ref: { uid: string }, data: Record<string, unknown>) => { fake.updates.push({ uid: ref.uid, data }); },
      commit: async () => undefined,
    }),
  }),
}));
import { mirrorAssistantClientAccess } from './assistantClientAccessServer';

beforeEach(() => {
  fake.users.clear(); fake.updates.length = 0;
  fake.users.set('rose', { role: 'va', active: true });
  fake.users.set('former', { role: 'va', active: true, clientAccess: { scope: 'gapp', editInfo: true, uploadDocuments: true } });
  fake.users.set('untouched', { role: 'va', active: true });
  fake.users.set('owner', { role: 'admin', active: true, clientAccess: { scope: 'all', editInfo: true, uploadDocuments: true } });
});

it('writes each grant onto its assistant, clears revoked ones, and leaves the rest alone', async () => {
  const granted = await mirrorAssistantClientAccess({ grants: [{ uid: 'rose', scope: 'gapp', editInfo: true, uploadDocuments: false }] });
  expect(granted).toEqual(['rose']);
  expect(fake.updates).toEqual([
    { uid: 'rose', data: { clientAccess: { scope: 'gapp', editInfo: true, uploadDocuments: false } } },
    { uid: 'former', data: { clientAccess: '__DELETE__' } },
  ]);
});

it('treats missing or malformed settings as no grants', async () => {
  expect(await mirrorAssistantClientAccess(undefined)).toEqual([]);
  expect(fake.updates).toEqual([{ uid: 'former', data: { clientAccess: '__DELETE__' } }]);
  fake.updates.length = 0;
  expect(await mirrorAssistantClientAccess({ grants: [{ uid: 'rose', scope: 'everything', editInfo: true, uploadDocuments: true } as never] })).toEqual([]);
});
