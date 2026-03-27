import { Metadata } from 'next';
import { Accessibility } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'ICWP - Independent Care Waiver Program | Heart and Soul Healthcare',
  description: 'The ICWP provides comprehensive home health services for adults aged 21–64 with severe physical impairments or traumatic brain injuries in Georgia, supporting independent living and preventing institutionalization.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/programs/icwp' },
  openGraph: {
    title: 'ICWP - Independent Care Waiver Program | Heart and Soul Healthcare',
    description: 'Home health services for adults with severe physical impairments or traumatic brain injuries in Georgia.',
    url: 'https://www.heartandsoulhc.org/programs/icwp',
  },
};

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "MedicalTherapy",
  name: "Independent Care Waiver Program (ICWP)",
  description: "The ICWP provides comprehensive services for adults aged 21–64 with severe physical impairments or traumatic brain injuries to achieve independent living and prevent institutionalization in Georgia.",
  provider: { "@type": "Organization", name: "Heart and Soul Healthcare", url: "https://www.heartandsoulhc.org" },
  areaServed: { "@type": "State", name: "Georgia" },
  audience: { "@type": "PeopleAudience", audienceType: "Adults aged 21–64 with severe physical impairments or traumatic brain injuries" },
};

const services = [
  {
    title: 'Personal Support Services (PSS)',
    description: 'Comprehensive assistance with personal care, daily living activities, and home management tasks.',
  },
  {
    title: 'Skilled Nursing',
    description: 'Professional nursing services for individuals requiring medical care and monitoring in their homes.',
  },
  {
    title: 'Respite Care',
    description: 'Temporary relief services for primary caregivers to support family well-being and prevent burnout.',
  },
  {
    title: 'Adult Day Services',
    description: 'Structured daytime programs providing social interaction, activities, and supervision.',
  },
  {
    title: 'Behavior Management',
    description: 'Professional support for managing behavioral challenges and developing positive coping strategies.',
  },
  {
    title: 'Counseling',
    description: 'Mental health support and therapeutic services to address emotional and psychological needs.',
  },
  {
    title: 'Specialized Medical Equipment and Supplies',
    description: 'Provision of necessary adaptive equipment and medical supplies to support daily functioning.',
  },
  {
    title: 'Environmental Modifications',
    description: 'Home modifications and adaptations to improve accessibility, safety, and independence.',
  },
];

export default function ICWPPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <ProgramPageTemplate
      icon={Accessibility}
      programName="ICWP"
      fullTitle="Independent Care Waiver Program"
      subtitle="Empowering adults with physical impairments or traumatic brain injuries to achieve dignified, independent lives within their communities."
      targetPopulation="Services are directed toward adults between 21 and 64 years of age who have a severe physical impairment and/or traumatic brain injury (TBI) and require assistance from another person. These individuals must be medically stable but at risk of hospital or nursing facility placement without community-based support services."
      programGoal="The goal of the Independent Care Waiver Program is to assist functionally impaired adults in achieving dignified and reasonably independent lives within their communities. Through comprehensive support services, we help individuals maintain their independence, prevent institutionalization, and improve their overall quality of life."
      services={services}
      accentColor="sage"
      populationImage="/images/icwp-population-v2.png"
      goalImage="/images/icwp-goal-v2.png"
      imageAspectRatio="1/1"
    />
    </>
  );
}
