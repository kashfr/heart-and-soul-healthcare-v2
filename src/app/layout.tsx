import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heart and Soul Healthcare | Professional Home Health Services",
  description: "Heart and Soul Healthcare provides compassionate, professional home health care services throughout Georgia. Serving GAPP, NOW/COMP, ICWP, and EDWP programs.",
  keywords: "home health care, Georgia, GAPP, NOW/COMP, ICWP, EDWP, skilled nursing, personal care, home health services",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
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
