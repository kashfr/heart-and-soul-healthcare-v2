import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import "./globals.css";

const siteUrl = "https://www.heartandsoulhc.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Heart and Soul Healthcare | Home Health Services in Georgia",
    template: "%s | Heart and Soul Healthcare",
  },
  description: "Heart and Soul Healthcare provides compassionate, professional home health care services throughout Georgia. Specializing in GAPP, NOW/COMP, ICWP, and EDWP waiver programs.",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    siteName: "Heart and Soul Healthcare",
    title: "Heart and Soul Healthcare | Home Health Services in Georgia",
    description: "Compassionate home health care services throughout Georgia. Specializing in GAPP, NOW/COMP, ICWP, and EDWP waiver programs.",
    url: siteUrl,
    images: [{ url: "/images/logo.webp", width: 130, height: 67, alt: "Heart and Soul Healthcare Logo" }],
  },
  twitter: {
    card: "summary",
    title: "Heart and Soul Healthcare | Home Health Services in Georgia",
    description: "Compassionate home health care services throughout Georgia. Specializing in GAPP, NOW/COMP, ICWP, and EDWP waiver programs.",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": ["Organization", "MedicalBusiness", "HomeHealthCareService"],
  name: "Heart and Soul Healthcare",
  url: siteUrl,
  logo: `${siteUrl}/images/logo.webp`,
  telephone: "+16786440337",
  email: "info@heartandsoulhc.org",
  address: {
    "@type": "PostalAddress",
    streetAddress: "1372 Peachtree St NE",
    addressLocality: "Atlanta",
    addressRegion: "GA",
    postalCode: "30309",
    addressCountry: "US",
  },
  areaServed: {
    "@type": "State",
    name: "Georgia",
  },
  description: "Heart and Soul Healthcare provides compassionate, professional home health care services throughout Georgia, specializing in Medicaid waiver programs including GAPP, NOW/COMP, ICWP, and EDWP.",
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "10:00",
    closes: "15:00",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <Header />
        <main style={{ paddingTop: '0' }}>
          {children}
        </main>
        <Footer />
        <CookieConsent />
      </body>
    </html>
  );
}
