import SharedReferralClient from './SharedReferralClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Shared Referral — Heart & Soul Healthcare',
  robots: { index: false, follow: false },
};

export default async function SharedReferralPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedReferralClient token={token} />;
}
