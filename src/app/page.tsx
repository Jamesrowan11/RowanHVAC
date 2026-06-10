import Link from "next/link";
import { db } from "@/lib/db";
import { COMPANY } from "@/lib/constants";
import ContactForm from "@/components/public/ContactForm";

export const dynamic = "force-dynamic";

const services = [
  {
    title: "Heating",
    body: "Gas, electric, and oil furnaces plus boilers — expert repair, seasonal service, and full installations.",
  },
  {
    title: "Air Conditioning",
    body: "Repair, service, and installation to keep your home comfortable through Maryland summers.",
  },
  {
    title: "Heat Pumps",
    body: "Sales, service, and repair of efficient heat pump systems for year-round comfort.",
  },
  {
    title: "Geothermal Systems",
    body: "Ground-source comfort with outstanding efficiency, installed and serviced by experienced techs.",
  },
  {
    title: "Custom Sheet Metal & Ductwork",
    body: "Fabricated in-house and fitted right — ductwork built for your home, not forced into it.",
  },
  {
    title: "Aeroseal Duct Sealing",
    body: "Seal leaky ducts from the inside to improve comfort, air quality, and energy bills.",
  },
  {
    title: "Indoor Air Quality",
    body: "Humidifiers, dehumidifiers, air cleaners, and smart thermostats for healthier air at home.",
  },
  {
    title: "Maintenance & Service Agreements",
    body: "Seasonal tune-ups and priority scheduling that keep your system running its best.",
  },
];

const whyUs = [
  { title: "Licensed & Insured in Maryland", body: "Fully licensed and insured for your peace of mind." },
  { title: "Family-Owned Since 1958", body: "Three generations of honest service in Howard County." },
  { title: "Honest, Upfront Pricing", body: "Clear estimates before work begins — no surprises." },
  { title: "Fast, Reliable Service", body: "When your comfort is on the line, we show up." },
];

const reviews = [
  {
    name: "Marcia White",
    text: `We have used Rowan Heating & Air Conditioning on three occasions -- always emergencies. The first time our furnace failed on the coldest day of the winter. BG&E said they couldn't service us for at least 4 or 5 days. Rowan came out the next day. Yesterday, our air conditioning stopped working on the hottest day of the summer. We called Rowan around 9 pm last night and someone actually answered the phone, was helpful in telling us what to check until someone could come out, and Jake, the service tech who came out, was professional, thorough, knowledgeable, and just a great guy. He had us up and running before noon today! I love this company because they understand what their customers are going through when the heat and a/c aren't working and they care enough to help ASAP. I also love that they're a family-owned business. Their owner Teresa rocks too! I won't call anyone else for our heating and a/c needs.`,
  },
  {
    name: "John Duncan",
    text: `The Rowan family has been taking care of my family's heating and cooling needs in two houses since the summer of 2007. We are very satisfied. The technicians are courteous, thorough, very professional and knowledgeable about oil and gas furnaces as well as electric cooling systems. They do all the analytical work to make sure the systems are working efficiently. They keep detailed notes so all tests are documented and available for review. When we have had emergencies they have been quick to respond. I recommend without any qualification.`,
  },
  {
    name: "Ebony Qualls",
    text: `What great folks! My heat broke when it was freezing in DC. After two days of trying to get service from other companies, I saw the Rowan van parked in my neighborhood. I called the number on the van and they sent Dean over in a matter of minutes. What a nice guy! Everything is fixed and Dean gave some maintenance recommendations. This is a family-run business and I feel they're good people.`,
  },
];

const serviceAreas = ["Highland", "Clarksville", "Fulton", "Dayton", "Maple Lawn"];

function Stars() {
  return (
    <div className="flex gap-0.5 text-accent" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} aria-hidden="true" className="h-5 w-5 fill-current" viewBox="0 0 20 20">
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9L10 1.5z" />
        </svg>
      ))}
    </div>
  );
}

export default async function HomePage() {
  const techs = await db.teamMember.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HVACBusiness",
    name: COMPANY.name,
    description:
      "Family-owned and operated HVAC company serving Highland and Howard County, Maryland since 1958.",
    foundingDate: "1958",
    telephone: "+1-410-531-0008",
    email: COMPANY.email,
    address: {
      "@type": "PostalAddress",
      postOfficeBoxNumber: "109",
      addressLocality: "Fulton",
      addressRegion: "MD",
      postalCode: "20759",
      addressCountry: "US",
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "17:00",
    },
    areaServed: [...serviceAreas, "Howard County"].map((name) => ({
      "@type": "Place",
      name: `${name}, MD`,
    })),
    url: process.env.APP_URL || "https://rowanhvac.com",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-navy-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="text-lg font-extrabold tracking-tight text-navy sm:text-xl">
            Rowan <span className="text-accent">Heating &amp; Air Conditioning</span>
          </Link>
          <nav aria-label="Main navigation" className="flex items-center gap-3 sm:gap-5">
            <a href="#services" className="hidden text-sm font-medium text-gray-600 hover:text-navy md:block">Services</a>
            <a href="#reviews" className="hidden text-sm font-medium text-gray-600 hover:text-navy md:block">Reviews</a>
            <a href="#contact" className="hidden text-sm font-medium text-gray-600 hover:text-navy md:block">Contact</a>
            <Link href="/login" className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-navy-700">
              Portal Login
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="bg-navy text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
            <p className="text-sm font-semibold uppercase tracking-widest text-accent-300">
              {COMPANY.name}
            </p>
            <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
              Reliable Heating &amp; Cooling for Highland and Howard County
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-navy-100">
              Family-owned and operated in Howard County since 1958 — honest,
              dependable heating and cooling you can trust.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a href="#contact" className="btn-primary w-full sm:w-auto">Request a Quote</a>
              <a href={COMPANY.phoneHref} className="btn-secondary w-full sm:w-auto">
                Call Now · {COMPANY.phone}
              </a>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 className="text-center text-3xl font-bold text-navy">Our Services</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
            Complete heating, cooling, and air-quality care for your home.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((s) => (
              <div key={s.title} className="card transition hover:-translate-y-0.5 hover:shadow-lg">
                <h3 className="font-bold text-navy">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{s.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center font-medium text-navy-600">
            We service and install Trane, Carrier, and WaterFurnace systems.
          </p>
        </section>

        {/* Why Choose Us */}
        <section className="bg-navy-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
            <h2 className="text-center text-3xl font-bold text-navy">Why Choose Us</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {whyUs.map((w) => (
                <div key={w.title} className="card text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-accent-600">
                    <svg aria-hidden="true" className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                      <path d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" />
                    </svg>
                  </div>
                  <h3 className="mt-3 font-bold text-navy">{w.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{w.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Service Area */}
        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-20">
          <h2 className="text-3xl font-bold text-navy">Proudly Serving Howard County</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600">
            We serve homeowners throughout Howard County, Maryland, including:
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-3">
            {serviceAreas.map((a) => (
              <li key={a} className="rounded-full bg-navy-50 px-5 py-2 font-medium text-navy">
                {a}
              </li>
            ))}
            <li className="rounded-full bg-navy-50 px-5 py-2 font-medium text-navy">
              …and surrounding Howard County, MD
            </li>
          </ul>
        </section>

        {/* Meet Our Techs — populated from the admin dashboard (Team page) */}
        {techs.length > 0 && (
          <section className="bg-navy-50">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
              <h2 className="text-center text-3xl font-bold text-navy">Meet Our Techs</h2>
              <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">
                The friendly faces who keep Howard County comfortable.
              </p>
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {techs.map((t) => (
                  <div key={t.id} className="card text-center">
                    {t.photoPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/team-photos/${t.id}`}
                        alt={`Photo of ${t.name}`}
                        className="mx-auto h-36 w-36 rounded-full object-cover shadow-sm"
                      />
                    ) : (
                      <div aria-hidden="true" className="mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-navy-100 text-4xl font-bold text-navy-400">
                        {t.name.charAt(0)}
                      </div>
                    )}
                    <h3 className="mt-4 font-bold text-navy">{t.name}</h3>
                    {t.title && <p className="text-sm text-gray-600">{t.title}</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Reviews */}
        <section id="reviews" className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <h2 className="text-center text-3xl font-bold text-navy">What Our Customers Say</h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {reviews.map((r) => (
              <figure key={r.name} className="card flex flex-col">
                <Stars />
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-gray-700">
                  “{r.text}”
                </blockquote>
                <figcaption className="mt-4 font-semibold text-navy">— {r.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="bg-navy-50">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold text-navy">Request a Quote</h2>
              <p className="mt-3 max-w-md text-gray-600">
                Tell us what you need and we&apos;ll get back to you — usually the
                same business day.
              </p>
              <dl className="mt-8 space-y-4 text-gray-700">
                <div>
                  <dt className="font-semibold text-navy">Phone</dt>
                  <dd><a href={COMPANY.phoneHref} className="hover:text-accent-600">{COMPANY.phone}</a></dd>
                </div>
                <div>
                  <dt className="font-semibold text-navy">Email</dt>
                  <dd><a href={`mailto:${COMPANY.email}`} className="hover:text-accent-600">{COMPANY.email}</a></dd>
                </div>
                <div>
                  <dt className="font-semibold text-navy">Mailing Address</dt>
                  <dd>{COMPANY.address}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-navy">Hours</dt>
                  <dd>{COMPANY.hours}</dd>
                </div>
              </dl>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-navy-950 text-navy-200">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
          <div>
            <p className="font-bold text-white">{COMPANY.name}</p>
            <p className="mt-2 text-sm">
              Reliable, honest HVAC service for Highland and Howard County, Maryland.
            </p>
            <p className="mt-2 text-sm">Licensed &amp; Insured in Maryland</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">Contact</p>
            <ul className="mt-2 space-y-1">
              <li><a href={COMPANY.phoneHref} className="hover:text-white">{COMPANY.phone}</a></li>
              <li><a href={`mailto:${COMPANY.email}`} className="hover:text-white">{COMPANY.email}</a></li>
              <li>{COMPANY.address}</li>
              <li>{COMPANY.hours}</li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-semibold text-white">Quick Links</p>
            <ul className="mt-2 space-y-1">
              <li><a href="#services" className="hover:text-white">Services</a></li>
              <li><a href="#reviews" className="hover:text-white">Reviews</a></li>
              <li><a href="#contact" className="hover:text-white">Request a Quote</a></li>
              <li><Link href="/login" className="hover:text-white">Portal Login</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-navy-800 py-4 text-center text-xs text-navy-400">
          <p>© {new Date().getFullYear()} {COMPANY.name}. All rights reserved.</p>
          <p className="mt-1">
            This website was made and is hosted by Rowan Copy, a part of the Northvale Unified family.
          </p>
        </div>
      </footer>
    </>
  );
}
