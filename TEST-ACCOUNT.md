# Declared test account

The portal has one **declared test login** used to exercise role-gated features
(nurse-facing screens, the progress note, the MAR) against the production
build. It is documented here so it is never mistaken for a real workforce
member during an audit, a HIPAA access review, or a chart review.

| Field | Value |
| --- | --- |
| Display name | `ZZ TEST ACCOUNT - DO NOT ASSIGN` |
| Role / credential | nurse / LPN (so nurse-gated features render realistically) |
| Firestore flag | `users/<uid>.isTestAccount: true` |
| Owner | Kaheem Freeman (admin) |
| Purpose | Manual QA of nurse-facing features in production |

## Rules

1. **Only ever assign it to a test client** (the roster entry named
   `ZZ Test Client`). It must never appear on a real client's care team: care
   team membership grants read access to that client's chart, and a test
   identity has no business need for real PHI.
2. **Everything it writes is real production data.** Notes, dose marks, and med
   changes it creates are indistinguishable from clinical records except by the
   name on them. Keep its activity on the test client so nothing has to be
   cleaned up out of a real chart.
3. **Never use it to enter or correct real clinical data.** If a script or an
   import resolves to this account, stop and re-attribute the write to the real
   author before continuing.

## How the platform enforces this

`isTestAccount` drives two guards in the admin UI:

* Staff and Roles lists the account with a red **TEST** badge.
* The care-team picker on the client record badges it the same way and requires
  an explicit confirmation before adding it to any client's care team.

Neither guard is a hard block, because assigning the account to a test client is
legitimate. They exist so the assignment is always deliberate.

## History

* 2026-07-24: The account was previously named "Steve Jobs" and was assigned to
  two real clients. It was renamed, flagged, removed from both real care teams,
  and left on `ZZ Test Client` only. The badges and the confirmation prompt were
  added in the same change.

## Longer term

Testing against production is the reason all of the above is necessary. Moving
manual QA to the Firebase emulator suite locally, or to a separate staging
Firebase project, would remove the risk class entirely and is the preferred
end state.
