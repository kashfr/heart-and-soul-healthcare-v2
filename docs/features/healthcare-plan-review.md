# Healthcare plan review

A client's healthcare plans (the RN's condition-specific plans: cardiovascular,
endocrine, skin integrity and so on) are the documents filed under the
**Healthcare Plan** category on the client's Documents tab. The progress note
has a Safety Checklist box, "Care plan reviewed at start of shift". This
feature puts the plans behind that box and keeps proof that each nurse read
them.

## How it works for a nurse

- On a new progress note, the Safety Checklist (Observations tab) shows a
  **Healthcare Plans** panel listing the client's current plans.
- For each plan she chooses **Open Plan**, reads it, then **I Have Read This
  Plan**. The second button stays disabled until she has opened the plan.
- That is once per plan. On later shifts the panel says she has reviewed
  them all. She is asked again only for a plan that was added, or whose file
  was replaced (the row says "Updated since your review on ...").
- While any plan is unreviewed, the checkbox is disabled and the note will
  not submit: the submit gate takes her to the first unreviewed plan.
- Ticking the checkbox once the plans are reviewed stays her choice; the
  gate is about the receipts, not the tick.

A client with no documents in the Healthcare Plan category gets no panel and
no gate. The note behaves as before.

## Where things live

| Piece | File |
| --- | --- |
| Category name, note snapshot, gate helper, PDF lines (pure) | `src/lib/healthcarePlanReview.ts` |
| Receipts, serving the file, read-status (Admin SDK) | `src/lib/healthcarePlanReviewServer.ts` |
| Routes | `src/app/api/healthcare-plans/` (list, `[documentId]/file`, `[documentId]/review`) |
| Browser calls | `src/lib/healthcarePlans.ts` |
| Note panel | `src/app/(marketing)/progress-note/components/HealthcarePlansPanel.tsx` |
| Submit gate | `handleSubmit` in `src/app/(marketing)/progress-note/page.tsx` |
| Supervisor table | `src/app/(app)/admin/clients/[patientId]/HealthcarePlanReviewStatus.tsx` |

## Decisions to keep

- **Receipts are server-only.** `healthcarePlanReviews` has no rule of its
  own, so the rules' default deny covers it and no browser reads or writes
  it. The server stamps the open when it serves the file and accepts an
  acknowledgment only for a version it served to that user. There is nothing
  to deploy in `firestore.rules` for this feature.
- **Access does not depend on the care team.** `assignedNurseIds` is seeded
  when a nurse submits her first note for a client, so the Documents rules
  would lock her out on her first shift. The routes let any active admin,
  supervisor or nurse open a client's plans, and only documents in the
  Healthcare Plan category. Do not widen the file route to other categories.
- **A version is the file.** The receipt id is
  `{documentId}__{uid}__{hash of storagePath}`. Replace changes the storage
  path, so it starts a new version. Editing the title or date does not.
  Old receipts stay on file as history.
- **The note keeps a snapshot.** `hcpReviewMeta` (JSON in the note's values)
  lists the plans and when this nurse reviewed each. It is written for new
  notes only and never refreshed on edit. The PDF and the admin note view
  print it under the Safety Checklist.
- **The gate fails open.** If the plan list cannot be loaded the snapshot is
  empty and the note is not held up. The panel shows the error with Try Again.
- **The stored checklist value is unchanged** ("Care plan reviewed at start
  of shift"), so older notes and reports still match.
- The category name is load-bearing: the note finds plans by it. Do not
  rename it.

## For staff

To put a client's plans in front of the nurses, upload them on the Documents
tab with the category Healthcare Plan. When a plan is revised or signed, use
**Replace** on that document: everyone is then asked to review it again.
The Documents tab shows a **Healthcare Plan Reviews** table (staff only) with
who has reviewed how many plans and which ones each person is missing.
