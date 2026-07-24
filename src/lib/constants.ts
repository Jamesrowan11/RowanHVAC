export const COMPANY = {
  name: "Rowan Heating & Air Conditioning",
  shortName: "Rowan Heating & Air",
  phone: "410-531-0008",
  phoneHref: "tel:+14105310008",
  email: "info@rowanhvac.com",
  address: "P.O. Box 109, Fulton, MD 20759",
  hours: "Monday–Friday 9:00 AM – 5:00 PM",
  foundingYear: 1958,
};

// Where customers leave reviews — sent after a job is completed.
export const REVIEW_LINKS = {
  google: "https://g.page/r/CasogBhYScnHEAE/review",
  yelp: "https://www.yelp.com/biz/rowan-highland-2",
};

export const SERVICE_OPTIONS = [
  "Heating (furnace or boiler)",
  "Air Conditioning",
  "Heat Pump",
  "Geothermal System",
  "Custom Sheet Metal & Ductwork",
  "Aeroseal Duct Sealing",
  "Indoor Air Quality",
  "Maintenance / Service Agreement",
  "Other",
];

// Default (shared/computer) sessions: short, for security.
export const SESSION_IDLE_SECONDS = 30 * 60;
export const SESSION_MAX_SECONDS = 8 * 60 * 60;

// "Keep me signed in" / installed-app sessions: long-lived on a trusted device.
export const SESSION_REMEMBER_IDLE_SECONDS = 60 * 60 * 24 * 30; // 30 days idle
export const SESSION_REMEMBER_MAX_SECONDS = 60 * 60 * 24 * 90; // 90 days absolute
// Cookie lifetime must cover the longest possible session.
export const SESSION_COOKIE_MAX_SECONDS = SESSION_REMEMBER_MAX_SECONDS;

export const MAX_EMAIL_RECIPIENTS = 25;
