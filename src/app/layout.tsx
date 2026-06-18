import type { Metadata, Viewport } from "next";
import "./globals.css";
import { COMPANY } from "@/lib/constants";
import ServiceWorker from "@/components/ServiceWorker";

const description =
  "Family-owned and operated in Howard County since 1958 — honest, dependable heating and cooling you can trust. Serving Howard County, Montgomery County, Prince George's County, and Washington, DC.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: `${COMPANY.name} | HVAC in Highland & Howard County, MD`,
    template: `%s | ${COMPANY.name}`,
  },
  description,
  keywords: [
    "heating", "air conditioning", "geothermal", "aeroseal", "custom sheet metal",
    "HVAC", "a/c", "heat pump", "service", "repair", "installation", "cooling",
    "ducts", "furnaces", "gas furnace", "electric furnace", "furnace repair",
    "furnace service", "furnace sales", "furnace installation", "boilers",
    "heat pumps", "air handler", "coils", "maintenance", "service agreements",
    "humidifier", "dehumidifiers", "clean air", "programmable thermostats",
    "thermostat", "ductwork", "heat pump repair", "heat pump service",
    "a/c service", "a/c repair", "heat pump sales", "boiler service",
    "estimates", "Trane", "Carrier", "WaterFurnace", "Fulton MD", "Highland MD",
    "Howard County HVAC", "Columbia MD", "Ellicott City MD", "Silver Spring MD",
    "Montgomery County HVAC", "Prince George's County HVAC", "Washington DC HVAC",
  ],
  openGraph: {
    title: `${COMPANY.name} | HVAC in Highland & Howard County, MD`,
    description,
    type: "website",
    locale: "en_US",
    siteName: COMPANY.name,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rowan HVAC",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a2b4a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
