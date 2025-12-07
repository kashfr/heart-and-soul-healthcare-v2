import { Metadata } from 'next';
import { Brain } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'NOW/COMP Waiver Program | Heart and Soul Healthcare',
  description: 'The New Options Waiver and Comprehensive Supports Waiver Program provides person-centered support for individuals with intellectual and developmental disabilities.',
};

const services = [
  {
    title: 'Adult Occupational Therapy',
    description: 'Therapeutic services to help individuals develop, recover, and improve skills needed for daily living and working.',
  },
  {
    title: 'Adult Physical Therapy',
    description: 'Rehabilitation services to restore movement and function, reduce pain, and prevent disability.',
  },
  {
    title: 'Adult Speech and Language Therapy',
    description: 'Services to address communication disorders and improve speech, language, and swallowing abilities.',
  },
  {
    title: 'Behavioral Supports (Level 1)',
    description: 'Basic behavioral intervention and support services for individuals requiring minimal assistance.',
  },
  {
    title: 'Behavioral Supports (Level 2)',
    description: 'Intensive behavioral intervention services for individuals with more complex behavioral needs.',
  },
  {
    title: 'Community Access Services',
    description: 'Support to help individuals access and participate in community activities, events, and resources.',
  },
  {
    title: 'Community Living Supports (CLS)',
    description: 'Assistance with daily living activities and skills training to promote independence in community settings.',
  },
  {
    title: 'Respite Services',
    description: 'Temporary relief for primary caregivers, ensuring continuous care while providing family support.',
  },
  {
    title: 'Specialized Medical Equipment/Supplies',
    description: 'Provision of necessary medical equipment and supplies to support individual health needs.',
  },
  {
    title: 'Transportation Services',
    description: 'Safe and reliable transportation to appointments, activities, and community destinations.',
  },
];

export default function NOWCOMPPage() {
  return (
    <ProgramPageTemplate
      icon={Brain}
      programName="NOW/COMP"
      fullTitle="New Options Waiver / Comprehensive Supports Waiver Program"
      subtitle="Person-centered support for individuals with intellectual and developmental disabilities, promoting meaningful community integration and independent living."
      targetPopulation="This program serves individuals with intellectual and developmental disabilities (I/DD) who reside in or are at risk of placement in an Intermediate Care Facility for Persons with Intellectual Disabilities (ICF/ID). Our services help these individuals remain in their communities while receiving the comprehensive support they need."
      programGoal="The NOW/COMP program emphasizes support coordination, person-centered planning, and community integration to assist individuals in living a meaningful life in the community. We focus on individual strengths and preferences to develop care plans that promote independence, self-determination, and full participation in community life."
      services={services}
      accentColor="gold"
      populationImage="/images/now-comp-population.png"
      goalImage="/images/now-comp-goal.png"
      imageAspectRatio="1/1"
    />
  );
}
