import type { Metadata } from "next";
import "./globals.css";
import { COMPANY } from "@/lib/constants";

const description =
  "Family-owned and operated in Howard County since 1958 — honest, dependable heating and cooling you can trust. Serving Highland, Clarksville, Fulton, Dayton, Maple Lawn, and surrounding Howard County, MD.";

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
    "Howard County HVAC",
  ],
  openGraph: {
    title: `${COMPANY.name} | HVAC in Highland & Howard County, MD`,
    description,
    type: "website",
    locale: "en_US",
    siteName: COMPANY.name,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
