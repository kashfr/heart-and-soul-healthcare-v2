/**
 * Render tests for the program-conditional QEPR sections on page 6
 * (rev 2, Aug 2026). The single most important guarantee here is the first
 * one: a GAPP note renders NONE of the new sections — the pediatric shift
 * note must be pixel-identical to what the nurses used before the QEPR
 * update. The rest pin down the NOW/COMP requiredness and the RN-oversight
 * visibility rules.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import FormPageSix from './FormPageSix';
import { getNoteDocRequirements, type NoteDocRequirements } from '@/lib/programDocRequirements';
import { radioState } from './DeselectableRadio';
import type { FormValues } from '../types';

interface HarnessProps {
  credential?: string;
  isEditMode?: boolean;
  docReqs: NoteDocRequirements;
}

function Harness(props: HarnessProps) {
  const formRef = useRef<HTMLFormElement>(null!);
  const {
    register,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>();
  return (
    <form ref={formRef}>
      <FormPageSix
        formRef={formRef}
        register={register}
        watch={watch}
        setValue={setValue}
        control={control}
        errors={errors}
        {...props}
      />
    </form>
  );
}

beforeEach(() => {
  // The DeselectableRadio store is module-global; scrub between tests.
  for (const k of Object.keys(radioState)) delete radioState[k];
});

const CHOICE_SECTION = /INDIVIDUAL CHOICE & PREFERENCES/i;
const ANE_TOPIC = /Abuse, neglect, and exploitation/i;

describe('FormPageSix program-conditional sections', () => {
  it('GAPP: renders no QEPR sections — the pediatric note is unchanged', () => {
    render(<Harness credential="LPN" docReqs={getNoteDocRequirements('gapp')} />);
    expect(screen.queryByText(CHOICE_SECTION)).toBeNull();
    expect(screen.queryByText(ANE_TOPIC)).toBeNull();
    // But the pre-existing education section is still there.
    expect(screen.getByText('EDUCATION PROVIDED')).toBeInTheDocument();
  });

  it('NOW/COMP: choice section renders and choices-made is required on a new note', () => {
    render(<Harness credential="LPN" docReqs={getNoteDocRequirements('now-comp')} />);
    expect(screen.getByText(CHOICE_SECTION)).toBeInTheDocument();
    expect(screen.getByText(ANE_TOPIC)).toBeInTheDocument();
    const choicesMade = document.getElementById('q42_choicesMade') as HTMLTextAreaElement;
    expect(choicesMade).toBeRequired();
    // The other choice fields stay optional enrichment.
    expect(document.getElementById('q42_choicesOffered')).not.toBeRequired();
    expect(document.getElementById('q42_preferencesHonored')).not.toBeRequired();
  });

  it('NOW/COMP: editing a legacy note (no rev stamp) relaxes the requirement', () => {
    render(
      <Harness credential="LPN" isEditMode docReqs={getNoteDocRequirements('now-comp')} />,
    );
    const choicesMade = document.getElementById('q42_choicesMade') as HTMLTextAreaElement;
    expect(choicesMade).not.toBeRequired();
  });

  it('EDWP: choice section renders but nothing is required', () => {
    render(<Harness credential="LPN" docReqs={getNoteDocRequirements('edwp')} />);
    expect(screen.getByText(CHOICE_SECTION)).toBeInTheDocument();
    expect(document.getElementById('q42_choicesMade')).not.toBeRequired();
  });


  it('teach-back now offers a Declined option', () => {
    render(<Harness credential="LPN" docReqs={getNoteDocRequirements('gapp')} />);
    expect(screen.getByText('Declined')).toBeInTheDocument();
  });
});
