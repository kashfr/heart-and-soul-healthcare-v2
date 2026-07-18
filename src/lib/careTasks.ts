import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { CareTaskLevel } from './careTaskCatalog';

/**
 * Care tasks — a client's plan-of-care task list (Option C phase 1).
 *
 * Mirrors the marOrders design: one doc per task per client in a top-level
 * `careTasks` collection linked by patientId. Tasks are never lossily
 * mutated out of history — removing a task from the plan is a DISCONTINUE
 * (status flip + stamp), so a note documented against a task always has the
 * task it referenced. Assignment is done by admin/supervisor; each task
 * carries an RN approval stamp set separately from creation, so "on the
 * list" and "clinically approved" are distinct, auditable facts.
 */

export type CareTaskStatus = 'active' | 'discontinued';

export interface CareTask {
  id?: string;
  patientId: string;
  /** Catalog key when picked from CARE_TASK_CATALOG; absent for custom tasks. */
  catalogKey?: string;
  name: string;
  /** Catalog category key ('respiratory', ...) or 'custom'. */
  category: string;
  categoryLabel: string;
  /** 'skilled' = RN/LPN only; 'any' = aide-appropriate too. */
  level: CareTaskLevel;
  frequency: string;
  instructions?: string;
  status: CareTaskStatus;

  createdAt?: unknown;
  createdBy?: string;
  createdByName?: string;
  createdByRole?: string;
  lastEditedAt?: unknown;
  lastEditedBy?: string;
  lastEditedByName?: string;
  discontinuedAt?: unknown;
  discontinuedBy?: string;
  discontinuedByName?: string;
  discontinueReason?: string;

  /** RN/supervisor clinical approval — absent means pending review. */
  approvedAt?: unknown;
  approvedBy?: string;
  approvedByName?: string;
  approvedByRole?: string;
}

/** Editable fields accepted from the assignment form. */
export interface CareTaskInput {
  catalogKey?: string;
  name: string;
  category: string;
  categoryLabel: string;
  level: CareTaskLevel;
  frequency: string;
  instructions?: string;
}

export interface CareTaskActor {
  uid: string;
  displayName: string;
  role: string;
}

/**
 * All care tasks for a client (active and discontinued). Equality query on
 * patientId only — no composite index needed; callers sort/filter in memory.
 */
export async function getCareTasks(patientId: string): Promise<CareTask[]> {
  try {
    const ref = collection(db, 'careTasks');
    const snap = await getDocs(query(ref, where('patientId', '==', patientId)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as CareTask[];
  } catch (error) {
    console.error('Error fetching care tasks:', error);
    return [];
  }
}

export async function addCareTask(
  patientId: string,
  input: CareTaskInput,
  actor: CareTaskActor,
): Promise<string> {
  const payload: Record<string, unknown> = {
    patientId,
    name: input.name,
    category: input.category,
    categoryLabel: input.categoryLabel,
    level: input.level,
    frequency: input.frequency,
    status: 'active' as CareTaskStatus,
    createdAt: serverTimestamp(),
    createdBy: actor.uid,
    createdByName: actor.displayName,
    createdByRole: actor.role,
  };
  // Firestore rejects undefined values — only write optional fields when set.
  if (input.catalogKey) payload.catalogKey = input.catalogKey;
  if (input.instructions?.trim()) payload.instructions = input.instructions.trim();
  const ref = await addDoc(collection(db, 'careTasks'), payload);
  return ref.id;
}

/**
 * Edit frequency / instructions / name (custom tasks) in place. Identity
 * fields (patientId, createdBy/At) are pinned by the security rules.
 * Editing clears any approval stamp: the RN approved what the task SAID when
 * she approved it, so a changed task goes back to pending review.
 */
export async function updateCareTask(
  taskId: string,
  input: Pick<CareTaskInput, 'name' | 'frequency' | 'instructions'>,
  actor: CareTaskActor,
): Promise<void> {
  await updateDoc(doc(db, 'careTasks', taskId), {
    name: input.name,
    frequency: input.frequency,
    instructions: input.instructions?.trim() || '',
    lastEditedAt: serverTimestamp(),
    lastEditedBy: actor.uid,
    lastEditedByName: actor.displayName,
    approvedAt: null,
    approvedBy: null,
    approvedByName: null,
    approvedByRole: null,
  });
}

export async function discontinueCareTask(
  taskId: string,
  reason: string,
  actor: CareTaskActor,
): Promise<void> {
  await updateDoc(doc(db, 'careTasks', taskId), {
    status: 'discontinued' as CareTaskStatus,
    discontinueReason: reason,
    discontinuedAt: serverTimestamp(),
    discontinuedBy: actor.uid,
    discontinuedByName: actor.displayName,
  });
}

/**
 * Stamp clinical approval on the given tasks. Intended to be exercised by
 * the RN supervisor (the UI directs it there); the stamp records exactly who
 * approved, so the attestation trail speaks for itself.
 */
export async function approveCareTasks(
  taskIds: string[],
  actor: CareTaskActor,
): Promise<void> {
  await Promise.all(
    taskIds.map((id) =>
      updateDoc(doc(db, 'careTasks', id), {
        approvedAt: serverTimestamp(),
        approvedBy: actor.uid,
        approvedByName: actor.displayName,
        approvedByRole: actor.role,
      }),
    ),
  );
}

/** Sort: category (catalog order handled by caller), then name. */
export function compareCareTasks(a: CareTask, b: CareTask): number {
  if (a.categoryLabel !== b.categoryLabel) {
    return (a.categoryLabel || '').localeCompare(b.categoryLabel || '');
  }
  return (a.name || '').localeCompare(b.name || '');
}
