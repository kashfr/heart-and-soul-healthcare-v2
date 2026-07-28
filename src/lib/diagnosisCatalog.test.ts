// Drift guard + behaviour tests for the shared intake catalog.
//
// THIS FILE IS DUPLICATED, BYTE-FOR-BYTE, IN TWO REPOSITORIES alongside
// diagnosisCatalog.ts (see that file's header). Keep them identical: the whole
// point is that both repos assert the same fingerprint, so a catalog edited in
// one repo and not the other cannot pass both suites with the same constant.

import { describe, it, expect } from 'vitest';
import {
  BEHAVIOR_RISK_OPTIONS,
  CATALOG_VERSION,
  CURRENT_SERVICE_OPTIONS,
  DIAGNOSIS_GROUPS,
  EQUIPMENT_OPTIONS,
  catalogFingerprint,
  classifyFreeText,
  composeDiagnosisText,
  diagnosisLabels,
  diagnosisPicture,
  inferService,
  serviceFromCareNeed,
} from './diagnosisCatalog';

describe('catalog integrity', () => {
  it('CATALOG_VERSION matches the catalog contents', () => {
    // If this fails you edited an option. Update CATALOG_VERSION to the value
    // below, then copy diagnosisCatalog.ts into the OTHER repository so the
    // form and the portal keep speaking the same catalog.
    expect(CATALOG_VERSION).toBe(catalogFingerprint());
  });

  it('every code is unique across the whole catalog', () => {
    const codes = [
      ...DIAGNOSIS_GROUPS.flatMap((g) => g.options.map((o) => o.code)),
      ...EQUIPMENT_OPTIONS.map((o) => o.code),
      ...BEHAVIOR_RISK_OPTIONS.map((o) => o.code),
      ...CURRENT_SERVICE_OPTIONS.map((o) => o.code),
    ];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('offers an explicit negative for both multi-selects', () => {
    // Without these, an empty array can't be told apart from an unanswered
    // question, and "no equipment" is a real and useful answer.
    expect(EQUIPMENT_OPTIONS.some((o) => o.tier === 'none')).toBe(true);
    expect(CURRENT_SERVICE_OPTIONS.some((o) => o.code === 'services_none')).toBe(true);
  });
});

describe('composeDiagnosisText', () => {
  it('renders selected labels in catalog order, regardless of click order', () => {
    expect(composeDiagnosisText(['seizures', 'autism'], '')).toBe(
      'Autism or autism spectrum disorder; Seizures or epilepsy'
    );
  });

  it('appends free text so nothing a family typed is ever dropped', () => {
    expect(composeDiagnosisText(['autism'], 'Laryngomalcia')).toBe(
      'Autism or autism spectrum disorder; Other: Laryngomalcia'
    );
  });

  it('survives an Other-only submission and unknown codes', () => {
    expect(composeDiagnosisText([], 'Moebius syndrome')).toBe('Other: Moebius syndrome');
    expect(diagnosisLabels(['not_a_real_code'])).toEqual([]);
  });
});

describe('diagnosisPicture', () => {
  it('reads checkbox-only answers', () => {
    expect(diagnosisPicture(['autism', 'speech'], '')).toBe('behavioral');
    expect(diagnosisPicture(['autism', 'heart'], '')).toBe('mixed');
    expect(diagnosisPicture(['heart'], '')).toBe('medical');
    expect(diagnosisPicture([], '')).toBe('none');
  });

  it('still catches a behavioural condition typed into Other', () => {
    expect(diagnosisPicture([], 'autism spectrum disorder')).toBe('behavioral');
  });

  it('treats unrecognized free text as a medical signal, not as silence', () => {
    // "Laryngomalcia" is misspelled and in neither term list. Guessing that
    // nothing medical exists would be exactly the wrong way to be wrong.
    expect(diagnosisPicture(['autism'], 'Laryngomalcia')).toBe('mixed');
  });

  it('classifies free text on its own', () => {
    expect(classifyFreeText('Autism and PICA')).toBe('behavioral');
    expect(classifyFreeText('Autism Spectrum Disorder & Epilepsy')).toBe('mixed');
    expect(classifyFreeText('Cystic fibrosis')).toBe('none');
    expect(classifyFreeText('')).toBe('none');
  });
});

describe('inferService', () => {
  it('puts skilled equipment above everything else', () => {
    // A child with a trach needs nursing whatever the family picked.
    const out = inferService({
      diagnoses: ['autism'],
      equipment: ['trach', 'help_feeding'],
      behaviorRisk: 'high',
      careNeeds: 'personal',
    });
    expect(out.service).toBe('nursing');
    expect(out.source).toBe('equipment');
    expect(out.conflict).toContain('Skilled Nursing');
  });

  it('reads dangerous behaviour as BSS, per Appendix W', () => {
    const out = inferService({ diagnoses: ['autism'], behaviorRisk: 'high', careNeeds: 'personal' });
    expect(out).toMatchObject({ service: 'behavioral', source: 'behavior' });
  });

  it('notes an existing ABA relationship in the reason', () => {
    const out = inferService({ behaviorRisk: 'high', currentServices: ['aba'] });
    expect(out.reason).toContain('ABA already in place');
  });

  it('does not treat manageable behaviour as the BSS signal', () => {
    // "Sometimes, and we manage them at home" is below Appendix W's bar, so it
    // must not be what decides the routing.
    const out = inferService({
      diagnoses: ['autism', 'heart'],
      behaviorRisk: 'managed',
      careNeeds: 'personal',
    });
    expect(out.source).not.toBe('behavior');
    expect(out.service).toBe('pss');
  });

  it('still leans behavioural on an autism-only picture, but says why', () => {
    // Same family, minus the heart condition: the lean now comes from the
    // diagnosis rule (likely an ASD Program case, §602.4), not from behaviour.
    const out = inferService({
      diagnoses: ['autism'],
      behaviorRisk: 'managed',
      careNeeds: 'personal',
    });
    expect(out).toMatchObject({ service: 'behavioral', source: 'diagnosis' });
  });

  it('reads hands-on daily care as PSS', () => {
    const out = inferService({
      diagnoses: ['cerebral_palsy'],
      equipment: ['help_hygiene', 'wheelchair'],
      careNeeds: 'personal',
    });
    expect(out).toMatchObject({ service: 'pss', source: 'daily-care', conflict: null });
  });

  it('flags a behavioural-only picture with no equipment and no care needs', () => {
    const out = inferService({
      diagnoses: ['autism', 'speech'],
      equipment: ['equip_none'],
      behaviorRisk: 'none',
      careNeeds: 'personal',
    });
    expect(out).toMatchObject({ service: 'behavioral', source: 'diagnosis' });
    expect(out.conflict).toContain('Family selected Personal Support Services');
  });

  it('will not call a picture behavioural-only when a medical condition is listed', () => {
    const out = inferService({ diagnoses: ['autism', 'heart'], careNeeds: 'personal' });
    expect(out).toMatchObject({ service: 'pss', source: 'self-reported', conflict: null });
  });

  it('will not call a picture behavioural-only when Other free text is filled in', () => {
    // Free text can name anything, so it defeats the "nothing medical" claim.
    const out = inferService({
      diagnoses: ['autism'],
      diagnosisOther: 'Laryngomalacia',
      careNeeds: 'personal',
    });
    expect(out.source).toBe('self-reported');
  });

  it('falls back to the self-reported radio and reports no conflict', () => {
    const out = inferService({ careNeeds: 'nursing' });
    expect(out).toMatchObject({ service: 'nursing', source: 'self-reported', conflict: null });
  });

  it('returns nothing when the family told us nothing', () => {
    expect(inferService({})).toMatchObject({ service: null, source: 'unknown', conflict: null });
    expect(inferService({ careNeeds: 'unsure' }).service).toBeNull();
  });

  it('ignores unknown equipment codes rather than trusting them', () => {
    const out = inferService({ equipment: ['definitely_not_a_code'], careNeeds: 'personal' });
    expect(out.source).toBe('self-reported');
  });

  it('reproduces the referral that started this work', () => {
    // DeKalb, "Autism. Laryngomalcia. Oral dysplasia. Expressive receptive
    // language disorder", family picked hands-on personal care. The old form
    // sent PSS with no signal that anything was off; a family filling in the
    // new form the same way now surfaces the mismatch for staff.
    const out = inferService({
      diagnoses: ['autism', 'speech'],
      diagnosisOther: '',
      equipment: ['equip_none'],
      behaviorRisk: 'high',
      currentServices: ['speech_therapy'],
      careNeeds: 'personal',
    });
    expect(out.service).toBe('behavioral');
    expect(out.conflict).toBe(
      'Family selected Personal Support Services (PSS); answers point to Behavioral Support Aide Services (BSS) (behaviors that put someone at risk)'
    );
  });
});

describe('serviceFromCareNeed', () => {
  it('maps the radio values and nothing else', () => {
    expect(serviceFromCareNeed('personal')).toBe('pss');
    expect(serviceFromCareNeed('nursing')).toBe('nursing');
    expect(serviceFromCareNeed('behavioral')).toBe('behavioral');
    expect(serviceFromCareNeed('unsure')).toBeNull();
    expect(serviceFromCareNeed('')).toBeNull();
    expect(serviceFromCareNeed(undefined)).toBeNull();
  });
});
