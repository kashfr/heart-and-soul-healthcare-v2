import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Staff SMS Notification Program & Terms | Heart and Soul Healthcare',
  description:
    'Terms, consent, and privacy details for the Heart and Soul Healthcare staff SMS notification program: how nurses are enrolled, message frequency, opt-out, help, and how mobile information is handled.',
  alternates: { canonical: 'https://www.heartandsoulhc.org/sms-terms' },
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Staff SMS Notification Program & Terms | Heart and Soul Healthcare',
    description:
      'Consent, message frequency, opt-out, help, and privacy for the Heart and Soul Healthcare staff SMS notification program.',
    url: 'https://www.heartandsoulhc.org/sms-terms',
  },
};

const NAVY = '#1a3a5c';

const pageStyle: React.CSSProperties = {
  maxWidth: 820,
  margin: '0 auto',
  // Top padding clears the site's fixed header (~127px tall) so the heading
  // isn't hidden behind it; the rest is normal page spacing.
  padding: '160px 24px 72px',
  color: '#2c3e50',
  lineHeight: 1.65,
  fontSize: 16,
};
const h1Style: React.CSSProperties = { fontSize: 30, color: NAVY, margin: '0 0 8px' };
const subStyle: React.CSSProperties = { color: '#5c6b7a', fontSize: 15, margin: '0 0 32px' };
const h2Style: React.CSSProperties = { fontSize: 20, color: NAVY, margin: '32px 0 10px' };
const pStyle: React.CSSProperties = { margin: '0 0 14px' };
const liStyle: React.CSSProperties = { margin: '0 0 8px' };
const calloutStyle: React.CSSProperties = {
  background: '#f5f9fe',
  border: '1px solid #c8def5',
  borderRadius: 8,
  padding: '16px 18px',
  margin: '0 0 24px',
};

export default function SmsTermsPage() {
  return (
    <div style={pageStyle}>
      <h1 style={h1Style}>Staff SMS Notification Program &amp; Terms</h1>
      <p style={subStyle}>Heart and Soul Healthcare &middot; Last updated June 17, 2026</p>

      <div style={calloutStyle}>
        <strong>Summary:</strong> Heart and Soul Healthcare sends operational text-message alerts to its
        own nursing staff. Message frequency varies. Message and data rates may apply. Reply <strong>STOP</strong> to
        opt out at any time, or <strong>HELP</strong> for help. We do not sell or share your mobile information, and
        we never send marketing texts under this program.
      </div>

      <h2 style={h2Style}>About this program</h2>
      <p style={pStyle}>
        Heart and Soul Healthcare (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or the &ldquo;Company&rdquo;) operates an
        internal SMS notification program for the nurses who use our staff portal. When a clinical supervisor flags a
        submitted progress note for review or correction, the assigned nurse receives a text message prompting her to
        sign in to the staff portal and respond. These are work-related, operational (transactional) messages only.
      </p>

      <h2 style={h2Style}>Who receives messages</h2>
      <p style={pStyle}>
        Only Heart and Soul Healthcare&rsquo;s employed and contracted nurses who use our staff portal receive these
        messages. This program is not directed at the general public, patients, or consumers, and we never obtain
        phone numbers from third parties.
      </p>

      <h2 style={h2Style}>How you are enrolled (consent)</h2>
      <p style={pStyle}>
        Consent is collected during staff onboarding. Each nurse provides her mobile phone number and agrees, in
        writing, to receive work-related operational SMS notifications from Heart and Soul Healthcare as a condition
        of using the staff portal. Enrollment is part of the employment/contractor onboarding process; there is no
        public sign-up form and no keyword to text in. Consent records are retained in our onboarding documentation.
      </p>

      <h2 style={h2Style}>Types of messages and frequency</h2>
      <ul>
        <li style={liStyle}>Alerts that a progress note you documented needs review or correction.</li>
        <li style={liStyle}>Follow-up questions a reviewer adds to a note that is awaiting your reply.</li>
      </ul>
      <p style={pStyle}>
        Message frequency varies and depends on documentation and review activity. We do not send promotional or
        marketing messages under this program.
      </p>

      <h2 style={h2Style}>Cost</h2>
      <p style={pStyle}>
        <strong>Message and data rates may apply.</strong> Heart and Soul Healthcare does not charge for these
        messages, but your mobile carrier&rsquo;s standard message and data rates may apply.
      </p>

      <h2 style={h2Style}>How to opt out</h2>
      <p style={pStyle}>
        You may opt out at any time by replying <strong>STOP</strong> to any message. You will receive one
        confirmation message and then no further texts under this program. To start receiving messages again, reply{' '}
        <strong>START</strong>.
      </p>

      <h2 style={h2Style}>How to get help</h2>
      <p style={pStyle}>
        Reply <strong>HELP</strong> to any message, or contact us at{' '}
        <a href="mailto:info@heartandsoulhc.org" style={{ color: NAVY }}>info@heartandsoulhc.org</a> or
        (678) 644-0337.
      </p>

      <h2 style={h2Style}>Privacy</h2>
      <p style={pStyle}>
        We use your mobile phone number only to deliver the operational notifications described above. We do not sell
        your personal information, and <strong>no mobile information is shared with third parties or affiliates for
        marketing or promotional purposes</strong>. Information may be shared with service providers that help us
        deliver the messages (for example, our messaging provider), solely for that purpose. An example of a message
        you might receive: &ldquo;Heart and Soul Healthcare: one of your progress notes was flagged for correction.
        Please sign in to review and respond: https://www.heartandsoulhc.org/login Reply HELP for help, STOP to opt
        out.&rdquo;
      </p>

      <h2 style={h2Style}>Contact</h2>
      <p style={pStyle}>
        Heart and Soul Healthcare
        <br />
        1372 Peachtree Street NE, Atlanta, GA 30309
        <br />
        <a href="mailto:info@heartandsoulhc.org" style={{ color: NAVY }}>info@heartandsoulhc.org</a> &middot; (678) 644-0337
      </p>
    </div>
  );
}
