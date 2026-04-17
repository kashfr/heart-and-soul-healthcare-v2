import type { Metadata } from "next";
import Script from "next/script";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

const GA_MEASUREMENT_ID = "G-26HBSM36Q3";

const siteUrl = "https://www.heartandsoulhc.org";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  verification: {
    google: "wVGldzSX3AazX6w2I-Dq7HgyIDbt3DYzHYQeD8UucUM",
  },
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
    card: "summary_large_image",
    title: "Heart and Soul Healthcare | Home Health Care Services in Georgia",
    description: "Georgia home health care serving Atlanta and surrounding counties. GAPP, NOW/COMP, ICWP & EDWP Medicaid waiver programs.",
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
  areaServed: [
    { "@type": "State", name: "Georgia" },
    { "@type": "City", name: "Atlanta", containedInPlace: { "@type": "State", name: "Georgia" } },
    ...["Fulton", "DeKalb", "Cobb", "Clayton", "Henry", "Gwinnett", "Fayette", "Douglas", "Forsyth", "Rockdale", "Cherokee", "Paulding", "Bartow", "Newton", "Spalding", "Coweta", "Carroll", "Barrow", "Gilmer", "Pickens"].map(county => ({
      "@type": "AdministrativeArea", name: `${county} County, Georgia`,
    })),
  ],
  geo: {
    "@type": "GeoCoordinates",
    latitude: "33.7558",
    longitude: "-84.3880",
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
      <head>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </head>
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <AuthProvider>
          <Header />
          <main style={{ paddingTop: '0' }}>
            {children}
          </main>
          <Footer />
          <CookieConsent />
        </AuthProvider>
      </body>
    </html>
  );
}
