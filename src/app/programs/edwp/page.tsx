import { Metadata } from 'next';
import { UserCheck } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'EDWP (CCSP & SOURCE) - Elderly & Disabled Waiver Program | Heart and Soul Healthcare',
  description: 'The EDWP provides comprehensive home health services for elderly individuals 65+ and disabled adults 21+ in Georgia, helping them maintain independence and avoid nursing facility placement.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/programs/edwp' },
  openGraph: {
    title: 'EDWP (CCSP & SOURCE) - Elderly & Disabled Waiver Program | Heart and Soul Healthcare',
    description: 'Home health services for elderly and disabled individuals in Georgia to maintain independence at home.',
    url: 'https://www.heartandsoulhc.org/programs/edwp',
  },
};

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "MedicalTherapy",
  name: "Elderly & Disabled Waiver Program (EDWP) — CCSP & SOURCE",
  description: "The EDWP provides comprehensive support services for elderly individuals aged 65+ and disabled adults aged 21+ in Georgia, helping them maintain independence, safety, and quality of life at home.",
  provider: { "@type": "Organization", name: "Heart and Soul Healthcare", url: "https://www.heartandsoulhc.org" },
  areaServed: { "@type": "State", name: "Georgia" },
  audience: { "@type": "PeopleAudience", audienceType: "Elderly individuals 65+ and physically disabled adults 21+ at risk of nursing facility placement" },
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
  {
    title: 'Home-delivered Meals',
    description: 'Nutritionally balanced meals delivered to the home for individuals unable to prepare their own meals.',
  },
  {
    title: 'Emergency Response Services',
    description: 'In-home, 24-hour electronic two-way communication system that calls for help in an emergency.',
  },
];

export default function EDWPPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <ProgramPageTemplate
      icon={UserCheck}
      programName="EDWP (CCSP & SOURCE)"
      fullTitle="Elderly & Disabled Waiver Program"
      subtitle="Supporting elderly and disabled individuals in maintaining independence, safety, and quality of life in their own homes and communities."
      targetPopulation="This program serves individuals aged 65 and older (or aged 21 and over with qualifying physical disabilities) who are functionally impaired and meet the Intermediate Nursing Home Level of Care (LOC) criteria. These individuals require support to remain safely in their homes and communities rather than being placed in a nursing facility."
      programGoal="The services provided through EDWP — delivered via the Community Care Services Program (CCSP) and Service Options Using Resources in a Community Environment (SOURCE) — aim to maintain or increase the functioning capacity of members at risk for nursing facility placement. Our focus is on promoting independence, ensuring safety, and enhancing quality of life while enabling individuals to remain in their preferred community settings."
      services={services}
      accentColor="primary"
      populationImage="/images/edwp-population.png"
      goalImage="/images/edwp-goal.png"
      imageAspectRatio="1/1"
    />
    </>
  );
}
