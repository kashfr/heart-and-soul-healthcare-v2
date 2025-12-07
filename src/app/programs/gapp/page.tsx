import { Metadata } from 'next';
import { Baby } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'GAPP - Georgia Pediatric Program | Heart and Soul Healthcare',
  description: 'The Georgia Pediatric Program (GAPP) provides skilled nursing and support services for medically fragile children, enabling them to thrive in their homes and communities.',
};

const services = [
  {
    title: 'In-Home Skilled Nursing Services',
    description: 'Continuous skilled nursing care or skilled nursing care in shifts for medically fragile children requiring complex medical attention.',
  },
  {
    title: 'Personal Care Support Services',
    description: 'Assistance with daily living activities including bathing, dressing, grooming, and mobility support.',
  },
  {
    title: 'Behavioral Support Aide Services',
    description: 'Specialized support for children with behavioral needs, providing guidance and intervention strategies.',
  },
];

export default function GAPPPage() {
  return (
    <ProgramPageTemplate
      icon={Baby}
      programName="GAPP"
      fullTitle="Georgia Pediatric Program"
      subtitle="Providing skilled nursing and support services for medically fragile children, enabling them to thrive in their homes and communities as an alternative to nursing facility placement."
      targetPopulation="This program serves eligible members under the age of 20 years 11 months who must be medically fragile with multiple systems diagnoses. Individuals require continuous skilled nursing care or skilled nursing care in shifts to address their complex medical needs while remaining in their home environment."
      programGoal="The primary purpose of the Georgia Pediatric Program is to provide approved services to medically fragile children in their homes and communities as an alternative to placement in a nursing care facility. This program enables families to keep their children at home while ensuring they receive the specialized medical care they need."
      services={services}
      accentColor="teal"
      populationImage="/images/gapp-population.png"
      imageAspectRatio="1/1"
      goalImage="/images/gapp-goal.png"
    />
  );
}
