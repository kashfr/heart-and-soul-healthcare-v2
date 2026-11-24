# Group home

Client page card under Day Program: the group home the client lives in, the
residential provider, the home address, and who to call there (usually the
house manager, who schedules nurse visits). Built 11/2026 after a
client's group home manager asked that all visit scheduling go through him
and the client page had nowhere to keep a residential provider.

- Storage: `patients/{id}/clinical/groupHome`, the same care-team-gated read
  and staff-only write as `clinical/dayProgram`. No rules or index change.
- "Does this client live in a group home?" Yes needs the provider, home
  address, a contact, and a phone, cell, or email. No clears every detail.
- Code: `src/lib/groupHomeShared.ts` (validation, pure),
  `src/lib/groupHome.ts` (Firestore), `GroupHomeSection.tsx` on the client
  page. Modeled on Day Program; extra fields can be added later.
- Not yet offered as a facility in the ROI form picker (Day Program is).
