import { Metadata } from 'next';
import { Baby } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'GAPP - Georgia Pediatric Program | Heart and Soul Healthcare',
  description: 'The Georgia Pediatric Program (GAPP) provides in-home skilled nursing for medically fragile children under 21 in Georgia. Learn about GAPP eligibility, covered services, and how to apply. Heart and Soul Healthcare accepts GAPP referrals statewide.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/programs/gapp' },
  openGraph: {
    title: 'GAPP - Georgia Pediatric Program | Heart and Soul Healthcare',
    description: 'In-home skilled nursing and support services for medically fragile children under 21 in Georgia. Learn about GAPP eligibility and how to apply.',
    url: 'https://www.heartandsoulhc.org/programs/gapp',
  },
};

const serviceJsonLd = {
  "@context": "https://schema.org",
  "@type": "MedicalTherapy",
  name: "Georgia Pediatric Program (GAPP)",
  description: "The Georgia Pediatric Program provides skilled nursing and support services for medically fragile children under 21, enabling them to thrive in their homes and communities as an alternative to nursing facility placement.",
  provider: { "@type": "Organization", name: "Heart and Soul Healthcare", url: "https://www.heartandsoulhc.org" },
  areaServed: { "@type": "State", name: "Georgia" },
  audience: { "@type": "PeopleAudience", audienceType: "Medically fragile children under 21 years of age enrolled in Georgia Medicaid" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the Georgia Pediatric Program (GAPP)?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Georgia Pediatric Program (GAPP) is a Georgia Medicaid waiver program that provides in-home skilled nursing and support services for medically fragile children under 21 years old. GAPP allows children with complex medical needs to receive professional nursing care at home as an alternative to nursing facility placement.",
      },
    },
    {
      "@type": "Question",
      name: "Who qualifies for GAPP in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GAPP is available to Georgia Medicaid members under the age of 20 years and 11 months who are medically fragile with multiple systems diagnoses. Children must require continuous skilled nursing care or skilled nursing care in shifts to remain safely at home rather than in a nursing care facility.",
      },
    },
    {
      "@type": "Question",
      name: "What services does the Georgia Pediatric Program cover?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "GAPP covers in-home skilled nursing services (continuous or shift-based nursing care), personal care support services including assistance with bathing, dressing, grooming, and mobility, and behavioral support aide services for children with behavioral needs.",
      },
    },
    {
      "@type": "Question",
      name: "How do I apply for GAPP in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "To access GAPP services, the child must be enrolled in Georgia Medicaid and have a physician referral documenting their medical needs. Heart and Soul Healthcare can guide families through the referral process. You can submit a referral directly on our website or call us at (678) 644-0337.",
      },
    },
    {
      "@type": "Question",
      name: "Can my child stay at home instead of going to a nursing facility with GAPP?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — that is the primary purpose of GAPP. The Georgia Pediatric Program is specifically designed as an alternative to nursing facility placement, enabling medically fragile children to receive comprehensive skilled nursing care in their home environment surrounded by their family.",
      },
    },
  ],
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.heartandsoulhc.org" },
    { "@type": "ListItem", position: 2, name: "Programs", item: "https://www.heartandsoulhc.org/programs/gapp" },
    { "@type": "ListItem", position: 3, name: "Georgia Pediatric Program (GAPP)", item: "https://www.heartandsoulhc.org/programs/gapp" },
  ],
};

const services = [
  {
    title: 'In-Home Skilled Nursing Services',
    description: 'Continuous skilled nursing care or skilled nursing care in shifts for medically fragile children requiring complex medical attention in their home.',
  },
  {
    title: 'Personal Care Support Services',
    description: 'Assistance with daily living activities including bathing, dressing, grooming, and mobility support to help children thrive at home.',
  },
  {
    title: 'Behavioral Support Aide Services',
    description: 'Specialized support for children with behavioral needs, providing guidance, intervention strategies, and a safe home environment.',
  },
];

const faqs = [
  {
    question: "What is the Georgia Pediatric Program (GAPP)?",
    answer: "The Georgia Pediatric Program (GAPP) is a Georgia Medicaid waiver program that provides in-home skilled nursing and support services for medically fragile children under 21 years old. GAPP allows children with complex medical needs to receive professional nursing care at home as an alternative to nursing facility placement.",
  },
  {
    question: "Who qualifies for GAPP in Georgia?",
    answer: "GAPP is available to Georgia Medicaid members under the age of 20 years and 11 months who are medically fragile with multiple systems diagnoses. Children must require continuous skilled nursing care or skilled nursing care in shifts to remain safely at home rather than in a nursing care facility.",
  },
  {
    question: "What services does the Georgia Pediatric Program cover?",
    answer: "GAPP covers in-home skilled nursing services (continuous or shift-based nursing care), personal care support services including assistance with bathing, dressing, grooming, and mobility, and behavioral support aide services for children with behavioral needs.",
  },
  {
    question: "How do I apply for GAPP in Georgia?",
    answer: "To access GAPP services, the child must be enrolled in Georgia Medicaid and have a physician referral documenting their medical needs. Heart and Soul Healthcare can guide families through the referral process — submit a referral on our website or call us at (678) 644-0337.",
  },
  {
    question: "Can my child stay at home instead of going to a nursing facility with GAPP?",
    answer: "Yes — that is the primary purpose of GAPP. The Georgia Pediatric Program is specifically designed as an alternative to nursing facility placement, enabling medically fragile children to receive comprehensive skilled nursing care in their home environment surrounded by their family.",
  },
];

const officialResources = [
  {
    label: 'Georgia Medicaid — Waiver Programs',
    url: 'https://medicaid.georgia.gov/programs/all-programs/waiver-programs',
    description: 'Official listing of all Georgia Medicaid waiver programs including GAPP eligibility and services.',
  },
  {
    label: 'Georgia DCH — Community-Based Services',
    url: 'https://dch.georgia.gov/programs/hcbs/community-based-services',
    description: 'Department of Community Health page covering GAPP and other community-based waiver programs.',
  },
  {
    label: 'Georgia Medicaid Portal',
    url: 'https://medicaid.georgia.gov',
    description: 'Check Medicaid eligibility, enrollment status, and PeachCare for Kids information.',
  },
  {
    label: 'Medicaid.gov — Home & Community-Based Services',
    url: 'https://www.medicaid.gov/medicaid/home-community-based-services/index.html',
    description: 'Federal overview of Medicaid HCBS waiver programs and how they support home-based care.',
  },
];

export default function GAPPPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <ProgramPageTemplate
        icon={Baby}
        programName="GAPP"
        fullTitle="Georgia Pediatric Program"
        subtitle="Providing skilled nursing and support services for medically fragile children, enabling them to thrive in their homes and communities as an alternative to nursing facility placement."
        targetPopulation="This program serves eligible Georgia Medicaid members under the age of 20 years 11 months who are medically fragile with multiple systems diagnoses. Children must require continuous skilled nursing care or skilled nursing care in shifts to address their complex medical needs while remaining safely in their home environment."
        programGoal="The primary purpose of the Georgia Pediatric Program (GAPP) is to provide approved in-home services to medically fragile children as an alternative to placement in a nursing care facility. GAPP enables families throughout Georgia to keep their children at home while ensuring they receive the specialized skilled nursing care they need."
        services={services}
        faqs={faqs}
        officialResources={officialResources}
        accentColor="teal"
        populationImage="/images/gapp-population.png"
        populationImageAlt="Medically fragile child receiving in-home skilled nursing care through the Georgia Pediatric Program (GAPP)"
        goalImage="/images/gapp-goal.png"
        goalImageAlt="Child thriving at home with family thanks to GAPP in-home nursing services in Georgia"
        imageAspectRatio="1/1"
      />
    </>
  );
}
