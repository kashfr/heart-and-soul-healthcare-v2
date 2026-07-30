# Deploy checklist

Merging to `main` triggers Cloud Build, which deploys the **app** to Cloud Run.
It does **not** deploy Firestore rules or indexes. Those live in Firebase and
need their own command, so a PR that changes them is only half-shipped when it
merges.

This bit us on 2026-07-26: TAR phase 1 (#122) merged with a new
`careTaskAdministrations` collection, the app deployed fine, and every write
failed with *"Missing or insufficient permissions"* because the deployed rules
had no block for that collection and the default-deny at the bottom caught it.
The same PR also needed a composite index nobody had deployed, which produced a
second, different failure once the rules were fixed.

## After merging a PR that touched these files

**`firestore.rules`**

```bash
npx --yes firebase-tools@latest deploy --only firestore:rules --project heart-and-soul-hc
```

Confirm the literal line `✔ firestore: released rules firestore.rules`.

**`firestore.indexes.json`**

```bash
npx --yes firebase-tools@latest deploy --only firestore:indexes --project heart-and-soul-hc
```

Confirm `✔ firestore: deployed indexes in firestore.indexes.json successfully`.
An index takes a minute or two to build; the query keeps failing until its
state is `READY`, so check before concluding something else is broken.

**`storage.rules`**

```bash
npx --yes firebase-tools@latest deploy --only storage --project heart-and-soul-hc
```

## Two traps worth knowing

**Use `npx --yes firebase-tools@latest`, not the global `firebase`.** The
globally installed CLI crashes on Node 25: a transitive dependency
(`buffer-equal-constant-time`) reads `SlowBuffer.prototype`, which modern Node
removed. The failure is a stack trace, not a clear message.

**Do not trust the Firebase MCP `firebase_deploy` tool for this.** It returned
`{"status":"success"}` for a rules deploy that never happened, almost certainly
because it shells out to that same broken global CLI. Verify by reading the
live rules back, or just use the npx command above, which prints what it did.

## When a new collection is added

A new top-level collection needs, in order:

1. a `match` block in `firestore.rules` (without one, the default deny at the
   bottom of the file blocks everything);
2. a composite index in `firestore.indexes.json` if any query combines an
   equality filter with a range filter (for example `patientId ==` plus
   `date >=` and `date <=`);
3. both deployed with the commands above;
4. one real write and one real read through the UI. Neither `tsc` nor `vitest`
   can catch a missing rule or index, because both live outside the code.
