/**
 * Copy for the pediatric trach and ventilator nursing page. Kept apart from
 * the page so the visible FAQ and the FAQPage structured data come from one
 * list and can never disagree (Google penalizes FAQ markup that does not
 * match the page). Claims here are limited to what the owner confirmed on
 * 2026-10-06: the agency serves trach/vent children today, its nurses are
 * trach/vent trained, it accepts hospital discharges, and an RN supervises
 * care with on-call support. GAPP facts are from the Q4 October 2026 manual.
 * No em dashes in visitor-facing copy.
 */

export const PAGE_URL = 'https://www.heartandsoulhc.org/programs/gapp/trach-and-ventilator-care';
export const PHONE_DISPLAY = '(678) 644-0337';
export const PHONE_TEL = '+16786440337';

export const TITLE = 'Pediatric Trach and Ventilator Nursing at Home in Georgia';
export const META_TITLE = 'Pediatric Trach & Ventilator Home Nursing in Georgia | Heart and Soul Healthcare';
export const META_DESCRIPTION =
  'In-home nursing for Georgia children with a tracheostomy or ventilator, paid through GAPP at no cost to families. Trach and vent trained nurses, RN oversight, and help bringing your child home from the hospital.';

export const TRUST_POINTS = [
  'We care for children with trachs and ventilators today',
  'Nurses trained in tracheostomy and ventilator care',
  'We work directly with hospital discharge teams',
  'Registered nurse oversight with on-call support',
];

export const NURSING_SERVICES: { title: string; description: string }[] = [
  {
    title: 'Tracheostomy Care',
    description: 'Daily stoma care, trach tie changes, and skin checks to prevent breakdown and infection, done the way your child\'s care team ordered.',
  },
  {
    title: 'Suctioning and Airway Clearance',
    description: 'Suctioning as needed, humidification, and watching for the early signs of a plug or a change in breathing.',
  },
  {
    title: 'Trach Tube Changes',
    description: 'Routine and emergency trach changes when your child\'s physician orders them, with the spare trach and supplies always ready.',
  },
  {
    title: 'Ventilator, BiPAP, and CPAP Management',
    description: 'Checking settings against orders, responding to alarms, caring for the circuit, and keeping the backup equipment ready to go.',
  },
  {
    title: 'Oxygen and Monitoring',
    description: 'Oxygen delivery, pulse oximetry, and vital signs, with clear notes so your child\'s doctors see how the shift went.',
  },
  {
    title: 'Emergency Airway Response',
    description: 'A nurse in the home who knows your child\'s emergency plan and can act on it, including accidental decannulation and equipment failure.',
  },
  {
    title: 'Feeding Tubes and Medications',
    description: 'Many trach and vent kids also have a G-tube or J-tube. Our nurses handle feedings, flushes, and medications on the same shift.',
  },
  {
    title: 'Overnight and Daytime Shifts',
    description: 'Night shifts so parents can sleep, and day shifts so parents can work or care for siblings, based on the hours GAPP approves.',
  },
];

export const HOME_STEPS: { title: string; description: string }[] = [
  {
    title: 'Send Us a Referral',
    description: 'A parent, hospital discharge planner, case manager, or physician can start it. The sooner we hear from you before discharge, the more time we have to staff your child\'s shifts.',
  },
  {
    title: 'We Gather the Medical Orders',
    description: 'We work with your child\'s physician on the plan of treatment and the records GAPP needs, then submit the request for nursing hours.',
  },
  {
    title: 'GAPP Sets the Hours',
    description: 'State reviewers decide how many nursing hours your child is approved for, based on medical need. We keep you updated and answer questions along the way.',
  },
  {
    title: 'Care Starts at Home',
    description: 'We match your child with trach and vent trained nurses, a registered nurse oversees the care, and someone is reachable after hours if a question comes up.',
  },
];

/**
 * Blog guides shown in the "Guides for Families" section, in reading order.
 * Titles, excerpts, and images come from each post's frontmatter so the
 * cards never drift from the articles.
 */
export const GUIDE_SLUGS = [
  'bringing-your-child-home-with-a-trach-georgia',
  'gapp-nursing-hours-trach-ventilator-child',
  'night-nursing-child-trach-ventilator-georgia',
  'trach-ventilator-emergency-plan-at-home',
];

export const FAQS: { question: string; answer: string }[] = [
  {
    question: 'Does GAPP cover in-home nursing for a child with a tracheostomy or ventilator?',
    answer:
      'Yes. The Georgia Pediatric Program (GAPP) is a Georgia Medicaid program that pays for in-home skilled nursing for medically fragile children under 21. Tracheostomy and ventilator care are skilled nursing needs, so children with a trach or vent are among the children GAPP is designed to serve. State reviewers approve the number of nursing hours based on your child\'s medical needs.',
  },
  {
    question: 'How much does trach and ventilator nursing at home cost through GAPP?',
    answer:
      'GAPP services are provided at no cost to the family. Your child must be enrolled in Georgia Medicaid, and the nursing hours must be approved by GAPP based on medical need.',
  },
  {
    question: 'Can a nurse stay overnight with my child who has a trach?',
    answer:
      'Yes. Night shifts are one of the most common ways families use their GAPP hours, so parents can sleep while a trained nurse watches the airway, the monitors, and the ventilator. The number of hours depends on what GAPP approves for your child.',
  },
  {
    question: 'Are your nurses trained in trach and ventilator care?',
    answer:
      'Yes. Heart and Soul Healthcare cares for children with tracheostomies and ventilators today, and our nurses are trained in trach care, suctioning, trach changes, and ventilator management. A registered nurse supervises every child\'s care.',
  },
  {
    question: 'Can you help us bring our child home from the NICU or PICU?',
    answer:
      'Yes. We accept referrals directly from hospital discharge planners and case managers, and we coordinate with your child\'s care team so nursing is in place for the move home. Reach out as early as you can before discharge.',
  },
  {
    question: 'Can I be paid to care for my child with a trach or ventilator?',
    answer:
      'Under GAPP, a legally responsible family member who lives with the child can be paid only for personal care, such as bathing and dressing, through the Family Caregiver Option. Trach and ventilator care is skilled nursing, which a parent cannot be paid to provide, and every child in GAPP must have skilled nursing involved. A nurse from the agency provides that care.',
  },
  {
    question: 'What areas of Georgia do you serve?',
    answer:
      'We currently provide care in Fulton, DeKalb, Cobb, Clayton, Henry, Gwinnett, Fayette, Douglas, Forsyth, and Rockdale counties, and in Cherokee, Paulding, Bartow, Newton, Spalding, Coweta, Carroll, Barrow, Gilmer, and Pickens counties. We are growing, so families elsewhere in Georgia are welcome to reach out and we will tell you honestly whether we can staff your child\'s care.',
  },
  {
    question: 'How do I get started?',
    answer:
      `Submit a referral on our website or call us at ${PHONE_DISPLAY}. We will talk through your child's needs, explain the GAPP process, and work with your child's physician on the paperwork.`,
  },
];
