import { Metadata } from 'next';
import { UserCheck } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'EDWP (CCSP & SOURCE) - Elderly & Disabled Waiver Program | Heart and Soul Healthcare',
  description: 'The Elderly & Disabled Waiver Program (EDWP) provides home health services for elderly individuals 65+ and disabled adults 21+ in Georgia. Learn about CCSP, SOURCE, EDWP eligibility, covered services, and how to apply.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/programs/edwp' },
  openGraph: {
    title: 'EDWP (CCSP & SOURCE) - Elderly & Disabled Waiver Program | Heart and Soul Healthcare',
    description: 'Home health services for elderly and disabled individuals in Georgia through CCSP and SOURCE. Learn about EDWP eligibility and how to apply.',
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
  audience: { "@type": "PeopleAudience", audienceType: "Elderly individuals 65+ and physically disabled adults 21+ at risk of nursing facility placement in Georgia" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the Elderly and Disabled Waiver Program (EDWP) in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Elderly and Disabled Waiver Program (EDWP) is a Georgia Medicaid program that delivers home and community-based services through two programs: the Community Care Services Program (CCSP) and Service Options Using Resources in a Community Environment (SOURCE). EDWP helps elderly and physically disabled individuals avoid nursing facility placement by providing support in their own homes.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between CCSP and SOURCE?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Both are delivery channels under the EDWP umbrella. CCSP (Community Care Services Program) provides a broad array of home and community-based services for elderly and disabled individuals. SOURCE (Service Options Using Resources in a Community Environment) integrates Medicaid primary care with community-based long-term services, typically coordinated through a primary care provider. Both programs share the same goal of keeping individuals safely at home.",
      },
    },
    {
      "@type": "Question",
      name: "Who qualifies for the EDWP in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Individuals aged 65 and older, or adults aged 21 and over with qualifying physical disabilities, who are functionally impaired and meet the Intermediate Nursing Home Level of Care (LOC) criteria may qualify. Applicants must be enrolled in Georgia Medicaid and require support to remain safely in their homes and communities.",
      },
    },
    {
      "@type": "Question",
      name: "What services does the EDWP cover?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "EDWP covers Personal Support Services (PSS), Extended Personal Support Services, Alternative Living Services (ALS), Adult Day Health (ADH), respite care, skilled nursing services, Structured Family Caregiver (SFC) support, home-delivered meals, and emergency response services.",
      },
    },
    {
      "@type": "Question",
      name: "How do I apply for the EDWP in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "To apply for the EDWP, contact the Georgia Division of Aging Services or your local Area Agency on Aging (AAA). You will need a Georgia Medicaid enrollment and a functional needs assessment to determine eligibility. Once approved, a Care Manager will help develop a care plan and connect you with providers like Heart and Soul Healthcare. Call us at (678) 644-0337 for guidance.",
      },
    },
  ],
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.heartandsoulhc.org" },
    { "@type": "ListItem", position: 2, name: "Programs", item: "https://www.heartandsoulhc.org/programs/edwp" },
    { "@type": "ListItem", position: 3, name: "Elderly & Disabled Waiver Program (EDWP)", item: "https://www.heartandsoulhc.org/programs/edwp" },
  ],
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

const faqs = [
  {
    question: "What is the Elderly and Disabled Waiver Program (EDWP) in Georgia?",
    answer: "The Elderly and Disabled Waiver Program (EDWP) is a Georgia Medicaid program that delivers home and community-based services through two programs: the Community Care Services Program (CCSP) and Service Options Using Resources in a Community Environment (SOURCE). EDWP helps elderly and physically disabled individuals avoid nursing facility placement by providing support in their own homes.",
  },
  {
    question: "What is the difference between CCSP and SOURCE?",
    answer: "Both are delivery channels under the EDWP umbrella. CCSP provides a broad array of home and community-based services for elderly and disabled individuals. SOURCE integrates Medicaid primary care with community-based long-term services, typically coordinated through a primary care provider. Both programs share the same goal of keeping individuals safely at home.",
  },
  {
    question: "Who qualifies for the EDWP in Georgia?",
    answer: "Individuals aged 65 and older, or adults aged 21 and over with qualifying physical disabilities, who are functionally impaired and meet the Intermediate Nursing Home Level of Care (LOC) criteria may qualify. Applicants must be enrolled in Georgia Medicaid and require support to remain safely in their homes and communities.",
  },
  {
    question: "What services does the EDWP cover?",
    answer: "EDWP covers Personal Support Services (PSS), Extended Personal Support Services, Alternative Living Services (ALS), Adult Day Health (ADH), respite care, skilled nursing services, Structured Family Caregiver (SFC) support, home-delivered meals, and emergency response services.",
  },
  {
    question: "How do I apply for the EDWP in Georgia?",
    answer: "Contact the Georgia Division of Aging Services or your local Area Agency on Aging (AAA) to begin the application process. You will need a Georgia Medicaid enrollment and a functional needs assessment. Once approved, a Care Manager will help develop a care plan and connect you with providers. Call us at (678) 644-0337 for guidance.",
  },
];

const officialResources = [
  {
    label: 'Georgia.gov — Apply for EDWP',
    url: 'https://georgia.gov/apply-elderly-and-disabled-waiver-program',
    description: 'Official Georgia.gov page with EDWP eligibility requirements and how to apply through your local AAA.',
  },
  {
    label: 'Georgia Division of Aging Services',
    url: 'https://aging.georgia.gov',
    description: 'State agency overseeing elder services, caregiver support, and the CCSP/SOURCE programs.',
  },
  {
    label: 'Division of Aging Services — Programs',
    url: 'https://aging.georgia.gov/programs-and-services',
    description: 'Full listing of aging programs including CCSP, nutrition, caregiver support, and legal assistance.',
  },
  {
    label: 'Find Your Area Agency on Aging',
    url: 'https://aging.georgia.gov/locations',
    description: 'Locate your regional Area Agency on Aging (AAA) — the first step in applying for EDWP services.',
  },
  {
    label: 'Georgia Medicaid — Waiver Programs',
    url: 'https://medicaid.georgia.gov/programs/all-programs/waiver-programs',
    description: 'Complete listing of Georgia Medicaid waiver programs including CCSP and SOURCE details.',
  },
];

export default function EDWPPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <ProgramPageTemplate
        icon={UserCheck}
        programName="EDWP (CCSP & SOURCE)"
        fullTitle="Elderly & Disabled Waiver Program"
        subtitle="Supporting elderly and disabled individuals in maintaining independence, safety, and quality of life in their own homes and communities."
        targetPopulation="This program serves individuals aged 65 and older (or aged 21 and over with qualifying physical disabilities) who are functionally impaired and meet the Intermediate Nursing Home Level of Care (LOC) criteria. These individuals require support to remain safely in their homes and communities rather than being placed in a nursing facility."
        programGoal="The services provided through EDWP — delivered via the Community Care Services Program (CCSP) and Service Options Using Resources in a Community Environment (SOURCE) — aim to maintain or increase the functioning capacity of members at risk for nursing facility placement. Our focus is on promoting independence, ensuring safety, and enhancing quality of life while enabling individuals to remain in their preferred community settings."
        services={services}
        faqs={faqs}
        officialResources={officialResources}
        accentColor="primary"
        populationImage="/images/edwp-population.png"
        populationImageAlt="Elderly individual receiving personal support services through the Elderly and Disabled Waiver Program (EDWP) in Georgia"
        goalImage="/images/edwp-goal.png"
        goalImageAlt="Senior staying safely at home with CCSP and SOURCE services through the EDWP program in Georgia"
        imageAspectRatio="1/1"
      />
    </>
  );
}
