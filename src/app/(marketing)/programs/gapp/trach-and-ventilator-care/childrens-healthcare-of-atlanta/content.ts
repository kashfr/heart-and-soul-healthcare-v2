/**
 * Copy for the "coming home from Children's Healthcare of Atlanta" page.
 *
 * Children's Healthcare of Atlanta (CHOA) is named only descriptively, as the
 * place families are coming home from. Heart and Soul Healthcare has no
 * relationship with CHOA, and the page says so plainly in the hero, the FAQ,
 * and the closing note. No CHOA logo or branding anywhere. Nothing on this
 * page may describe how CHOA staff choose agencies.
 *
 * Agency claims are limited to what the owner confirmed on 2026-10-06 and
 * 2026-10-20: trach/vent trained nurses; RN oversight with on-call support;
 * same-business-day response to hospital referrals; a nurse can meet the
 * family in the hospital and sit in on trach/vent teaching; GAPP paperwork
 * can start while the child is inpatient; ONE child brought home from CHOA
 * on a trach and ventilator so far (so the wording stays singular).
 *
 * Hospital facts: Arthur M. Blank Hospital opened 2024-09-29 at 2220 North
 * Druid Hills Road NE and took over Egleston's services. No em dashes in
 * visitor-facing copy.
 */

import { PHONE_DISPLAY } from '../content';

export const PATH = '/programs/gapp/trach-and-ventilator-care/childrens-healthcare-of-atlanta';
export const PAGE_URL = `https://www.heartandsoulhc.org${PATH}`;

export const TITLE = "Home Nursing After a Trach or Ventilator Discharge From Children's Healthcare of Atlanta";
export const META_TITLE = "Home Nursing After a CHOA Trach or Ventilator Discharge | Heart and Soul Healthcare";
export const META_DESCRIPTION =
  "Bringing your child home from Children's Healthcare of Atlanta with a trach or ventilator? Independent GAPP nursing agency in Atlanta. Same-business-day response, nurses who can meet you at the hospital.";

export const INDEPENDENCE_LINE =
  "Heart and Soul Healthcare is an independent home nursing agency. We are not affiliated with or endorsed by Children's Healthcare of Atlanta.";

export const HOSPITALS: { name: string; detail: string }[] = [
  {
    name: 'Arthur M. Blank Hospital',
    detail:
      'Opened in September 2024 at 2220 North Druid Hills Road NE. The services that were at Egleston, including its intensive care units, moved here.',
  },
  {
    name: 'Scottish Rite Hospital',
    detail: 'The north metro campus in the Sandy Springs area.',
  },
  {
    name: 'Hughes Spalding Hospital',
    detail: 'The downtown Atlanta campus.',
  },
];

export const INPATIENT_STEPS: { title: string; description: string }[] = [
  {
    title: 'We respond the same business day',
    description:
      'Send a referral while your child is still inpatient and you will hear from us that day. The earlier we start, the more time we have to staff your child\'s first nights home.',
  },
  {
    title: 'A nurse can meet you at the hospital',
    description:
      'One of our nurses can come to the hospital to meet your family, learn your child, and sit in on trach and ventilator teaching with you.',
  },
  {
    title: 'We start the GAPP paperwork before discharge',
    description:
      'We work with your child\'s physician on the plan of treatment and get the GAPP request moving while your child is still in the hospital, instead of after you get home.',
  },
  {
    title: 'We coordinate with the discharge team',
    description:
      'Case managers, social workers, and the equipment company all have a piece of the plan. We stay in touch with them so nursing lines up with the rest of your discharge.',
  },
];

export const CHECKLIST: string[] = [
  'Two trained adults at home, if the hospital asks for it',
  'A spare trach in your child\'s size and one size smaller',
  'Suction, humidification, and monitors delivered and set up before discharge',
  'Georgia Medicaid in place, including through Katie Beckett if needed',
  'A home nursing agency chosen and the referral sent',
];

export const FAQS: { question: string; answer: string }[] = [
  {
    question: "Is Heart and Soul Healthcare part of Children's Healthcare of Atlanta?",
    answer:
      "No. We are an independent home nursing agency in Atlanta. We are not affiliated with or endorsed by Children's Healthcare of Atlanta. We serve families who are coming home from its hospitals, the same way we serve families coming home from any hospital in Georgia.",
  },
  {
    question: 'Do we have to use the home nursing agency the hospital suggests?',
    answer:
      'No. Under Medicaid, families generally have the right to choose any enrolled provider. A list from the hospital is a starting point, not a requirement. If you want Heart and Soul Healthcare, tell your case manager or social worker that you are choosing us, and we will take it from there.',
  },
  {
    question: 'Can you start before my child is discharged?',
    answer:
      'Yes, and we prefer to. We respond to hospital referrals the same business day, a nurse can meet you at the hospital and sit in on trach and ventilator teaching, and we start the GAPP paperwork while your child is still inpatient.',
  },
  {
    question: 'Have you cared for a child coming home from Children\'s Healthcare of Atlanta before?',
    answer:
      'Yes. We have brought a child home from Children\'s Healthcare of Atlanta on a trach and a ventilator, and our nurses are trained in trach care, suctioning, trach changes, and ventilator management. A registered nurse oversees every child\'s care, with on-call support after hours.',
  },
  {
    question: 'Does GAPP nursing cost our family anything?',
    answer:
      'No. The Georgia Pediatric Program (GAPP) is a Georgia Medicaid program, and approved nursing hours are covered in full. Your child must have Georgia Medicaid. Many children with complex medical needs qualify through the Katie Beckett pathway, which looks at the child\'s needs rather than the parents\' income.',
  },
  {
    question: 'What if we live outside metro Atlanta?',
    answer:
      `We currently staff Fulton, DeKalb, Cobb, Clayton, Henry, Gwinnett, Fayette, Douglas, Forsyth, Rockdale, Cherokee, Paulding, Bartow, Newton, Spalding, Coweta, Carroll, Barrow, Gilmer, and Pickens counties. Families elsewhere in Georgia are welcome to call ${PHONE_DISPLAY}. We will tell you honestly whether we can staff your child's care.`,
  },
];
