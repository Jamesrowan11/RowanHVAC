import type { Metadata } from "next";
import "./globals.css";
import { COMPANY, SEO_KEYWORDS } from "@/lib/company";

const SITE_URL = process.env.AUTH_URL || "https://rowanhvac.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:
      "Rowan Heating & Air Conditioning | HVAC in Highland & Howard County, MD",
    template: "%s | Rowan Heating & Air Conditioning",
  },
  description:
    "Family-owned and operated in Howard County since 1958 — honest, dependable heating and cooling for Highland, Fulton, Clarksville, and surrounding Maryland communities.",
  keywords: SEO_KEYWORDS,
  authors: [{ name: COMPANY.name }],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: COMPANY.name,
    title:
      "Rowan Heating & Air Conditioning | HVAC in Highland & Howard County, MD",
    description:
      "Reliable heating & cooling for Highland and Howard County. Family-owned since 1958.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rowan Heating & Air Conditioning",
    description:
      "Family-owned HVAC serving Highland & Howard County, MD since 1958.",
  },
  robots: { index: true, follow: true },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "HVACBusiness",
  name: COMPANY.name,
  foundingDate: COMPANY.foundingDate,
  telephone: COMPANY.phone,
  email: COMPANY.email,
  url: SITE_URL,
  description:
    "Family-owned heating and air conditioning company serving Highland, Fulton, and Howard County, Maryland since 1958.",
  address: {
    "@type": "PostalAddress",
    postOfficeBoxNumber: "109",
    addressLocality: COMPANY.address.city,
    addressRegion: COMPANY.address.state,
    postalCode: COMPANY.address.zip,
    addressCountry: "US",
  },
  areaServed: [
    "Highland, MD",
    "Clarksville, MD",
    "Fulton, MD",
    "Dayton, MD",
    "Maple Lawn, MD",
    "Howard County, MD",
  ],
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    opens: "09:00",
    closes: "17:00",
  },
  brand: ["Trane", "Carrier", "WaterFurnace"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
