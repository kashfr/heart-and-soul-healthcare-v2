import { Metadata } from 'next';
import { UserCheck } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'EDWP/CCSP/SOURCE - Elderly and Disabled Waiver Programs | Heart and Soul Healthcare',
  description: 'Comprehensive support services for elderly and disabled individuals to maintain independence, safety, and quality of life in their own homes.',
};

const services = [
  {
    title: 'Personal Support Services (PSS)',
    description: 'Assistance with personal care, housekeeping, home management, medically related activities, and caregiver respite.',
  },
  {
    title: 'Extended Personal Support Services',
    description: 'Additional hours of personal support beyond standard PSS for individuals with higher care needs.',
  },
  {
    title: 'Alternative Living Services (ALS)',
    description: 'Support for individuals living in alternative residential settings outside their own homes.',
  },
  {
    title: 'Adult Day Health (ADH)',
    description: 'Structured daytime programs providing health services, social activities, and therapeutic support.',
  },
  {
    title: 'Respite Care',
    description: 'Temporary relief for primary caregivers, ensuring continuous care while providing family support.',
  },
  {
    title: 'Skilled Nursing Services',
    description: 'Professional nursing care provided by private home care providers for medical needs.',
  },
  {
    title: 'Structured Family Caregiver (SFC)',
    description: 'Support and training for family members serving as primary caregivers for their loved ones.',
  },
];

export default function EDWPPage() {
  return (
    <ProgramPageTemplate
      icon={UserCheck}
      programName="EDWP/CCSP/SOURCE"
      fullTitle="Elderly and Disabled Waiver Programs"
      subtitle="Supporting elderly and disabled individuals in maintaining independence, safety, and quality of life in their own homes and communities."
      targetPopulation="This program serves individuals aged 21 and over who are functionally impaired and meet the Intermediate Nursing Home Level of Care (LOC) criteria. These individuals require support to remain safely in their homes and communities rather than being placed in a nursing facility."
      programGoal="The services provided through EDWP, CCSP, and SOURCE aim to maintain or increase the functioning capacity of members at risk for nursing facility placement. Our focus is on promoting independence, ensuring safety, and enhancing quality of life while enabling individuals to remain in their preferred community settings."
      services={services}
      accentColor="primary"
      populationImage="/images/edwp-population.png"
      goalImage="/images/edwp-goal.png"
      imageAspectRatio="1/1"
    />
  );
}
