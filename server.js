/**
 * Production server entry point for cPanel (Phusion Passenger).
 *
 * cPanel's "Setup Node.js App" boots this file. Passenger provides the port via
 * the PORT environment variable; we start Next.js in production mode and hand
 * every request to its router. (Vercel/local still use `next start` — this file
 * is only for the long-running Node host that cPanel provides.)
 */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      try {
        handle(req, res, parse(req.url, true));
      } catch (err) {
        console.error("Request handling error:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }).listen(port, () => {
      console.log(`> Rowan HVAC ready on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start Next.js server:", err);
    process.exit(1);
  });
