// Program-conditional documentation requirements for the progress-note form.
//
// Born out of QEPR 18119 (Qlarant / The Georgia Collaborative, Aug 2026): the
// surveyor cited missing per-visit evidence of choice, education, and RN
// oversight for our NOW/COMP clients. Those indicators come from the DBHDD
// Nursing Services tool and apply ONLY to DBHDD-waiver clients — a GAPP
// pediatric note is audited under the GAPP In-Home Nursing manual and must not
// pick up NOW/COMP paperwork, or every GAPP shift note grows required fields
// its reviewers never asked for.
//
// One axis in, one object out: the client's `program` (see src/lib/programs.ts)
// decides which QEPR-driven sections the form renders and which of them are
// required. EDWP/ICWP are approved programs with no clients yet — their
// sections stay visible-but-optional until we take a client and set real
// rules deliberately (they are DCH-surveyed, not Qlarant-QEPR).
//
// Requiredness is additionally gated on the note's `q1_formRev` stamp (>= 2)
// so notes written before these fields existed never retroactively fail
// validation when an admin opens them to edit. See noteValidation.ts.

export type Requirement = 'required' | 'optional' | 'hidden';

export interface NoteDocRequirements {
  /**
   * Individual choice documentation (QEPR Choice FOA, indicators 36-39):
   * choices offered, information provided to make meaningful choices, and
   * choices made or declined. 'required' means only the choices-made field
   * is required; the rest of the section is always optional enrichment.
   */
  choices: Requirement;
  /**
   * Extra education-topic checkboxes on the Education section: abuse/neglect/
   * exploitation, rights and responsibilities, psychotropic risks/benefits,
   * medication risks and benefits, maintaining personal health. Checkboxes are
   * never required, so this is only ever shown or hidden.
   */
  qeprEducationTopics: 'optional' | 'hidden';
  /** "How the individual's preferences were honored" line (QEPR PCP 21). */
  preferences: 'optional' | 'hidden';
}

const NOW_COMP: NoteDocRequirements = {
  choices: 'required',
  qeprEducationTopics: 'optional',
  preferences: 'optional',
};

const GAPP: NoteDocRequirements = {
  choices: 'hidden',
  qeprEducationTopics: 'hidden',
  preferences: 'hidden',
};

/**
 * EDWP / ICWP / unknown program / free-text client: sections visible so good
 * documentation is possible, nothing required so a note is never blocked on
 * rules we haven't actually set for that program.
 */
const DEFAULT_OPTIONAL: NoteDocRequirements = {
  choices: 'optional',
  qeprEducationTopics: 'optional',
  preferences: 'optional',
};

export function getNoteDocRequirements(program?: string | null): NoteDocRequirements {
  switch (program) {
    case 'now-comp':
      return NOW_COMP;
    case 'gapp':
      return GAPP;
    default:
      return DEFAULT_OPTIONAL;
  }
}

/** The choice/preference narrative fields (page 6). */
export const QEPR_NARRATIVE_FIELDS = [
  'q42_choicesMade',
  'q42_choicesOffered',
  'q42_choicesInfoProvided',
  'q42_preferencesHonored',
] as const;

/**
 * Remove QEPR fields that do not apply to the note being submitted. RHF keeps
 * values after their inputs unmount (shouldUnregister defaults to false) and
 * the radio store is module-global, so switching client or credential
 * mid-note can leave choice/oversight answers behind after their sections
 * disappear — worst case, one client's narrative riding along inside another
 * client's note. This runs on the flat payload right before save and deletes
 * anything the note's own rules say cannot exist.
 */
export function stripInapplicableQeprFields(
  values: Record<string, string>,
  reqs: NoteDocRequirements,
): void {
  if (reqs.choices === 'hidden') {
    for (const f of QEPR_NARRATIVE_FIELDS) delete values[f];
  } else if (reqs.preferences === 'hidden') {
    delete values.q42_preferencesHonored;
  }
}
