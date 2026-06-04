import { Logo } from "@/components/Logo";
import { Stars } from "@/components/Stars";
import { ServiceIcon } from "@/components/ServiceIcon";
import { QuoteForm } from "@/components/QuoteForm";
import { LOGIN_URL } from "@/lib/links";
import {
  COMPANY,
  SERVICES,
  WHY_CHOOSE,
  TESTIMONIALS,
} from "@/lib/company";

export default function HomePage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-navy-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo />
          <nav
            className="hidden items-center gap-6 text-sm font-medium text-navy-700 md:flex"
            aria-label="Primary"
          >
            <a className="hover:text-accent" href="#services">
              Services
            </a>
            <a className="hover:text-accent" href="#why">
              Why Us
            </a>
            <a className="hover:text-accent" href="#area">
              Service Area
            </a>
            <a className="hover:text-accent" href="#reviews">
              Reviews
            </a>
            <a className="hover:text-accent" href="#contact">
              Contact
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <a href={COMPANY.phoneHref} className="btn-outline btn-sm hidden sm:inline-flex">
              {COMPANY.phone}
            </a>
            <a href={LOGIN_URL} className="btn-navy btn-sm">
              Portal Login
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden bg-navy-900 text-white">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            aria-hidden="true"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, #476497 0, transparent 45%), radial-gradient(circle at 80% 0%, #f57c1f 0, transparent 35%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:py-28">
            <p className="mb-3 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-navy-100">
              {COMPANY.name}
            </p>
            <h1 className="max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Reliable Heating &amp; Cooling for Highland and Howard County
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-navy-100">
              Family-owned and operated in Howard County since 1958 — honest,
              dependable heating and cooling you can trust.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#contact" className="btn-primary">
                Request a Quote
              </a>
              <a href={COMPANY.phoneHref} className="btn-outline border-white/30 bg-white/10 text-white hover:bg-white/20">
                Call Now · {COMPANY.phone}
              </a>
            </div>
          </div>
        </section>

        {/* Services */}
        <section id="services" className="mx-auto max-w-6xl px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-navy-900">
              Our Services
            </h2>
            <p className="mt-3 text-navy-600">
              Full-service heating and cooling for your home or business.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((s) => (
              <div
                key={s.title}
                className="card flex flex-col gap-3 p-6 transition hover:shadow-soft"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                  <ServiceIcon name={s.icon} />
                </span>
                <h3 className="text-base font-semibold text-navy-900">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-navy-600">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-center text-sm font-medium text-navy-700">
            {COMPANY.brands}
          </p>
        </section>

        {/* Why choose us */}
        <section id="why" className="bg-navy-50 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-navy-900">
                Why Choose Us
              </h2>
            </div>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {WHY_CHOOSE.map((w) => (
                <div key={w.title} className="card p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-navy-900">
                    {w.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-navy-600">
                    {w.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Service area */}
        <section id="area" className="mx-auto max-w-6xl px-4 py-20">
          <div className="card grid items-center gap-8 overflow-hidden p-8 sm:grid-cols-2 sm:p-12">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-navy-900">
                Service Area
              </h2>
              <p className="mt-4 text-navy-600">
                We proudly serve {COMPANY.serviceArea}
              </p>
              <a href="#contact" className="btn-primary mt-6">
                Request Service
              </a>
            </div>
            <ul className="grid grid-cols-2 gap-3 text-sm font-medium text-navy-800">
              {[
                "Highland",
                "Clarksville",
                "Fulton",
                "Dayton",
                "Maple Lawn",
                "Howard County",
              ].map((c) => (
                <li
                  key={c}
                  className="flex items-center gap-2 rounded-lg bg-navy-50 px-3 py-2"
                >
                  <svg
                    className="h-4 w-4 text-accent"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Reviews */}
        <section id="reviews" className="bg-navy-50 py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-navy-900">
                What Our Customers Say
              </h2>
            </div>
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <figure key={t.name} className="card flex flex-col p-6">
                  <Stars count={t.stars} />
                  <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-navy-700">
                    {t.text}
                  </blockquote>
                  <figcaption className="mt-4 text-sm font-semibold text-navy-900">
                    — {t.name}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* Contact / Quote */}
        <section id="contact" className="mx-auto max-w-6xl px-4 py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-navy-900">
                Request a Quote
              </h2>
              <p className="mt-3 text-navy-600">
                Tell us what you need and we&apos;ll get back to you. Prefer to
                talk? Give us a call.
              </p>
              <dl className="mt-8 space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <dt className="font-semibold text-navy-900">Phone</dt>
                  <dd>
                    <a
                      className="text-accent hover:underline"
                      href={COMPANY.phoneHref}
                    >
                      {COMPANY.phone}
                    </a>
                  </dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="font-semibold text-navy-900">Email</dt>
                  <dd>
                    <a
                      className="text-accent hover:underline"
                      href={`mailto:${COMPANY.email}`}
                    >
                      {COMPANY.email}
                    </a>
                  </dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="font-semibold text-navy-900">Mail</dt>
                  <dd className="text-navy-600">
                    {COMPANY.address.pobox}, {COMPANY.address.city},{" "}
                    {COMPANY.address.state} {COMPANY.address.zip}
                  </dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="font-semibold text-navy-900">Hours</dt>
                  <dd className="text-navy-600">{COMPANY.hours}</dd>
                </div>
              </dl>
            </div>
            <div className="card p-6 sm:p-8">
              <QuoteForm />
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-navy-900 text-navy-100">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Logo light />
              <p className="mt-4 max-w-xs text-sm text-navy-200">
                {COMPANY.tagline}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-navy-300">
                Licensed &amp; Insured in Maryland
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">Contact</h3>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a className="hover:text-accent" href={COMPANY.phoneHref}>
                    {COMPANY.phone}
                  </a>
                </li>
                <li>
                  <a
                    className="hover:text-accent"
                    href={`mailto:${COMPANY.email}`}
                  >
                    {COMPANY.email}
                  </a>
                </li>
                <li className="text-navy-200">
                  {COMPANY.address.pobox}, {COMPANY.address.city},{" "}
                  {COMPANY.address.state} {COMPANY.address.zip}
                </li>
                <li className="text-navy-200">{COMPANY.hours}</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">Quick Links</h3>
              <ul className="mt-4 space-y-2 text-sm">
                <li>
                  <a className="hover:text-accent" href="#services">
                    Services
                  </a>
                </li>
                <li>
                  <a className="hover:text-accent" href="#why">
                    Why Choose Us
                  </a>
                </li>
                <li>
                  <a className="hover:text-accent" href="#reviews">
                    Reviews
                  </a>
                </li>
                <li>
                  <a className="hover:text-accent" href="#contact">
                    Request a Quote
                  </a>
                </li>
                <li>
                  <a className="hover:text-accent" href={LOGIN_URL}>
                    Portal Login
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white">Service Area</h3>
              <p className="mt-4 text-sm text-navy-200">{COMPANY.serviceArea}</p>
            </div>
          </div>

          <div className="mt-12 border-t border-white/10 pt-6 text-xs text-navy-300">
            <p>
              © {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
            </p>
            <p className="mt-2 text-navy-400">{COMPANY.credit}</p>
          </div>
        </div>
      </footer>
    </>
  );
}
