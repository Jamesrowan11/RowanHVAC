/**
 * Production entry point for Plesk (Phusion Passenger) or PM2.
 *
 * Plesk → Node.js → "Application Startup File": server.js
 * Passenger supplies the port; standalone runs honor PORT (default 3000).
 *
 * Run `npm install && npm run build` before starting.
 */
const { createServer } = require("node:http");
const { parse } = require("node:url");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  }).listen(port, () => {
    console.log(`Rowan HVAC app ready on http://localhost:${port}`);
  });
});
