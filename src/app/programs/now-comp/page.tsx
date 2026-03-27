import { Metadata } from 'next';
import { Brain } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'NOW/COMP Waiver Program | Heart and Soul Healthcare',
  description: 'The NOW/COMP Waiver Program provides person-centered support for individuals with intellectual and developmental disabilities in Georgia. Learn about NOW/COMP eligibility, covered services, and how to apply.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/programs/now-comp' },
  openGraph: {
    title: 'NOW/COMP Waiver Program | Heart and Soul Healthcare',
    description: 'Person-centered support for individuals with intellectual and developmental disabilities in Georgia.',
    url: 'https://www.heartandsoulhc.org/programs/now-comp',
  },
};

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "MedicalTherapy",
  name: "NOW/COMP Waiver Program (New Options Waiver / Comprehensive Supports Waiver)",
  description: "The NOW/COMP Waiver Program provides person-centered support for individuals with intellectual and developmental disabilities, promoting community integration and independent living in Georgia.",
  provider: { "@type": "Organization", name: "Heart and Soul Healthcare", url: "https://www.heartandsoulhc.org" },
  areaServed: { "@type": "State", name: "Georgia" },
  audience: { "@type": "PeopleAudience", audienceType: "Adults with intellectual and developmental disabilities (I/DD) in Georgia" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the NOW/COMP Waiver Program in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The NOW/COMP Waiver Program consists of two Georgia Medicaid waivers — the New Options Waiver (NOW) and the Comprehensive Supports Waiver Program (COMP) — that provide community-based services and supports for individuals with intellectual and developmental disabilities (I/DD). The programs help individuals live in the community rather than in an Intermediate Care Facility.",
      },
    },
    {
      "@type": "Question",
      name: "What is the difference between the NOW and COMP waivers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Both serve individuals with I/DD, but COMP is designed for those with higher support needs, while NOW serves those who need fewer hours of support. A Support Coordinator and the Georgia Department of Behavioral Health and Developmental Disabilities (DBHDD) determine which waiver is appropriate based on the individual's needs.",
      },
    },
    {
      "@type": "Question",
      name: "Who qualifies for the NOW/COMP Waiver Program?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Individuals with intellectual and developmental disabilities who reside in or are at risk of placement in an Intermediate Care Facility for Persons with Intellectual Disabilities (ICF/ID) may qualify. Applicants must be enrolled in Georgia Medicaid and meet functional eligibility criteria assessed by DBHDD.",
      },
    },
    {
      "@type": "Question",
      name: "What services does the NOW/COMP Waiver cover?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "NOW/COMP covers a wide range of services including adult occupational, physical, and speech therapy, behavioral supports (Level 1 and Level 2), community access services, community living supports (CLS), respite services, specialized medical equipment, and transportation services.",
      },
    },
    {
      "@type": "Question",
      name: "How do I apply for the NOW/COMP Waiver in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "To apply, contact the Georgia Department of Behavioral Health and Developmental Disabilities (DBHDD). You will need a Medicaid eligibility determination and a functional needs assessment. Once approved, a Support Coordinator will help develop a person-centered plan and connect you with providers like Heart and Soul Healthcare. Call us at (678) 644-0337 for guidance.",
      },
    },
  ],
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.heartandsoulhc.org" },
    { "@type": "ListItem", position: 2, name: "Programs", item: "https://www.heartandsoulhc.org/programs/now-comp" },
    { "@type": "ListItem", position: 3, name: "NOW/COMP Waiver Program", item: "https://www.heartandsoulhc.org/programs/now-comp" },
  ],
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

const faqs = [
  {
    question: "What is the NOW/COMP Waiver Program in Georgia?",
    answer: "The NOW/COMP Waiver Program consists of two Georgia Medicaid waivers — the New Options Waiver (NOW) and the Comprehensive Supports Waiver Program (COMP) — that provide community-based services for individuals with intellectual and developmental disabilities (I/DD). The programs help individuals live in the community rather than in an Intermediate Care Facility.",
  },
  {
    question: "What is the difference between the NOW and COMP waivers?",
    answer: "Both serve individuals with I/DD, but COMP is designed for those with higher support needs, while NOW serves those who need fewer hours of support. A Support Coordinator and the Georgia Department of Behavioral Health and Developmental Disabilities (DBHDD) determine which waiver is appropriate based on the individual's specific needs.",
  },
  {
    question: "Who qualifies for the NOW/COMP Waiver Program?",
    answer: "Individuals with intellectual and developmental disabilities who reside in or are at risk of placement in an Intermediate Care Facility for Persons with Intellectual Disabilities (ICF/ID) may qualify. Applicants must be enrolled in Georgia Medicaid and meet functional eligibility criteria assessed by DBHDD.",
  },
  {
    question: "What services does the NOW/COMP Waiver cover?",
    answer: "NOW/COMP covers adult occupational, physical, and speech therapy, behavioral supports (Level 1 and Level 2), community access services, community living supports (CLS), respite services, specialized medical equipment, and transportation services.",
  },
  {
    question: "How do I apply for the NOW/COMP Waiver in Georgia?",
    answer: "Contact the Georgia Department of Behavioral Health and Developmental Disabilities (DBHDD) to begin the application process. You will need a Medicaid eligibility determination and a functional needs assessment. Once approved, a Support Coordinator will help develop a person-centered plan and connect you with providers. Call us at (678) 644-0337 for guidance.",
  },
];

export default function NOWCOMPPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <ProgramPageTemplate
        icon={Brain}
        programName="NOW/COMP"
        fullTitle="New Options Waiver / Comprehensive Supports Waiver Program"
        subtitle="Person-centered support for individuals with intellectual and developmental disabilities, promoting meaningful community integration and independent living."
        targetPopulation="This program serves individuals with intellectual and developmental disabilities (I/DD) who reside in or are at risk of placement in an Intermediate Care Facility for Persons with Intellectual Disabilities (ICF/ID). Our services help these individuals remain in their communities while receiving the comprehensive support they need to thrive."
        programGoal="The NOW/COMP program emphasizes support coordination, person-centered planning, and community integration to assist individuals in living a meaningful life in the community. We focus on individual strengths and preferences to develop care plans that promote independence, self-determination, and full participation in community life throughout Georgia."
        services={services}
        faqs={faqs}
        accentColor="gold"
        populationImage="/images/now-comp-population.png"
        populationImageAlt="Individual with intellectual and developmental disability receiving community support through the NOW/COMP Waiver Program in Georgia"
        goalImage="/images/now-comp-goal.png"
        goalImageAlt="Person with I/DD participating in community activities supported by the NOW/COMP Waiver Program"
        imageAspectRatio="1/1"
      />
    </>
  );
}
