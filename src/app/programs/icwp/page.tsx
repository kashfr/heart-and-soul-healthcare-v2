import { Metadata } from 'next';
import { Accessibility } from 'lucide-react';
import ProgramPageTemplate from '@/components/ProgramPageTemplate';

export const metadata: Metadata = {
  title: 'ICWP - Independent Care Waiver Program | Heart and Soul Healthcare',
  description: 'The Independent Care Waiver Program (ICWP) provides home health services for adults 21–64 with severe physical impairments or traumatic brain injuries in Georgia. Learn about ICWP eligibility, covered services, and how to apply.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/programs/icwp' },
  openGraph: {
    title: 'ICWP - Independent Care Waiver Program | Heart and Soul Healthcare',
    description: 'Home health services for adults with severe physical impairments or traumatic brain injuries in Georgia. Learn about ICWP eligibility and how to apply.',
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
  audience: { "@type": "PeopleAudience", audienceType: "Adults aged 21–64 with severe physical impairments or traumatic brain injuries in Georgia" },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the Independent Care Waiver Program (ICWP) in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The Independent Care Waiver Program (ICWP) is a Georgia Medicaid waiver that provides community-based services for adults aged 21–64 who have severe physical impairments or traumatic brain injuries (TBI). ICWP helps individuals live independently in the community rather than in a nursing facility or other institutional setting.",
      },
    },
    {
      "@type": "Question",
      name: "Who qualifies for the ICWP in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Adults between the ages of 21 and 64 with a severe physical impairment and/or traumatic brain injury (TBI) who require assistance from another person may qualify. Individuals must be medically stable but at risk of hospital or nursing facility placement without community-based support services, and must be enrolled in Georgia Medicaid.",
      },
    },
    {
      "@type": "Question",
      name: "What services does the ICWP cover?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ICWP covers Personal Support Services (PSS), skilled nursing, respite care, adult day services, behavior management, counseling, specialized medical equipment and supplies, and environmental modifications to help individuals remain safely at home.",
      },
    },
    {
      "@type": "Question",
      name: "How do I apply for the ICWP in Georgia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "To apply for the ICWP, contact the Georgia Department of Behavioral Health and Developmental Disabilities (DBHDD) or the Division of Aging Services. You will need a Medicaid eligibility determination and a functional assessment. Once approved, a Care Manager will develop a person-centered plan and connect you with providers like Heart and Soul Healthcare. Call us at (678) 644-0337 for guidance.",
      },
    },
    {
      "@type": "Question",
      name: "Can the ICWP help someone with a traumatic brain injury stay at home?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The ICWP is specifically designed to support adults with traumatic brain injuries (TBI) and severe physical impairments who need assistance to live independently. Through services like personal support, skilled nursing, behavior management, and home modifications, ICWP helps individuals remain safely in their own homes and communities.",
      },
    },
  ],
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.heartandsoulhc.org" },
    { "@type": "ListItem", position: 2, name: "Programs", item: "https://www.heartandsoulhc.org/programs/icwp" },
    { "@type": "ListItem", position: 3, name: "Independent Care Waiver Program (ICWP)", item: "https://www.heartandsoulhc.org/programs/icwp" },
  ],
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

const faqs = [
  {
    question: "What is the Independent Care Waiver Program (ICWP) in Georgia?",
    answer: "The Independent Care Waiver Program (ICWP) is a Georgia Medicaid waiver that provides community-based services for adults aged 21–64 who have severe physical impairments or traumatic brain injuries (TBI). ICWP helps individuals live independently in the community rather than in a nursing facility or other institutional setting.",
  },
  {
    question: "Who qualifies for the ICWP in Georgia?",
    answer: "Adults between the ages of 21 and 64 with a severe physical impairment and/or traumatic brain injury (TBI) who require assistance from another person may qualify. Individuals must be medically stable but at risk of hospital or nursing facility placement without community-based support services, and must be enrolled in Georgia Medicaid.",
  },
  {
    question: "What services does the ICWP cover?",
    answer: "ICWP covers Personal Support Services (PSS), skilled nursing, respite care, adult day services, behavior management, counseling, specialized medical equipment and supplies, and environmental modifications to help individuals remain safely at home.",
  },
  {
    question: "How do I apply for the ICWP in Georgia?",
    answer: "Contact the Georgia Department of Behavioral Health and Developmental Disabilities (DBHDD) or the Division of Aging Services to begin the application process. You will need a Medicaid eligibility determination and a functional assessment. Once approved, a Care Manager will help develop a plan and connect you with providers. Call us at (678) 644-0337 for guidance.",
  },
  {
    question: "Can the ICWP help someone with a traumatic brain injury stay at home?",
    answer: "Yes. The ICWP is specifically designed to support adults with traumatic brain injuries (TBI) and severe physical impairments who need assistance to live independently. Through services like personal support, skilled nursing, behavior management, and home modifications, ICWP helps individuals remain safely in their own homes and communities.",
  },
];

const officialResources = [
  {
    label: 'Georgia.gov — Apply for ICWP',
    url: 'https://georgia.gov/apply-independent-care-waiver-program-icwp',
    description: 'Official Georgia.gov page with ICWP eligibility requirements and application steps.',
  },
  {
    label: 'Georgia Medicaid — Waiver Programs',
    url: 'https://medicaid.georgia.gov/programs/all-programs/waiver-programs',
    description: 'Complete listing of Georgia Medicaid waiver programs including ICWP details.',
  },
  {
    label: 'Georgia DBHDD',
    url: 'https://dbhdd.georgia.gov',
    description: 'Department of Behavioral Health and Developmental Disabilities — oversees ICWP services.',
  },
  {
    label: 'Medicaid.gov — Home & Community-Based Services',
    url: 'https://www.medicaid.gov/medicaid/home-community-based-services/index.html',
    description: 'Federal overview of Medicaid HCBS waiver programs supporting independent living.',
  },
];

export default function ICWPPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <ProgramPageTemplate
        icon={Accessibility}
        programName="ICWP"
        fullTitle="Independent Care Waiver Program"
        subtitle="Empowering adults with physical impairments or traumatic brain injuries to achieve dignified, independent lives within their communities."
        targetPopulation="Services are directed toward adults between 21 and 64 years of age who have a severe physical impairment and/or traumatic brain injury (TBI) and require assistance from another person. These individuals must be medically stable but at risk of hospital or nursing facility placement without community-based support services."
        programGoal="The goal of the Independent Care Waiver Program is to assist functionally impaired adults in achieving dignified and reasonably independent lives within their communities. Through comprehensive support services, we help individuals maintain their independence, prevent institutionalization, and improve their overall quality of life."
        services={services}
        faqs={faqs}
        officialResources={officialResources}
        accentColor="sage"
        populationImage="/images/icwp-population-v2.png"
        populationImageAlt="Adult with physical impairment receiving personal support services through the Independent Care Waiver Program (ICWP) in Georgia"
        goalImage="/images/icwp-goal-v2.png"
        goalImageAlt="Adult with traumatic brain injury living independently at home supported by ICWP services in Georgia"
        imageAspectRatio="1/1"
      />
    </>
  );
}
