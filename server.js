// Epoxy Ops Panel — BrightLocal + CompanyCam integration server
// Zero dependencies. Requires Node 18+ (built-in fetch).
//
// Run:  node server.js
// Then open http://localhost:3000
//
// Configure keys via environment variables or a .env file (see .env.example).

const http = require("http");
const fs = require("fs");
const path = require("path");
const companycam = require("./lib/companycam");
const brightlocal = require("./lib/brightlocal");
const facebook = require("./lib/facebook");
const gbp = require("./lib/googlebusiness");

loadDotEnv();

const PORT = process.env.PORT || 3000;
const CC_TOKEN = process.env.COMPANYCAM_TOKEN || "";
const BL_KEY = process.env.BRIGHTLOCAL_API_KEY || "";
const BL_CAMPAIGN = process.env.BRIGHTLOCAL_CAMPAIGN_ID || null;
const FB_TOKEN = process.env.FB_ACCESS_TOKEN || "";
const FB_AD_ACCOUNT = process.env.FB_AD_ACCOUNT_ID || "";
const FB_PAGE = process.env.FB_PAGE_ID || "";
const GBP_READY = !!(process.env.GBP_CLIENT_ID && process.env.GBP_CLIENT_SECRET && process.env.GBP_REFRESH_TOKEN && process.env.GBP_LOCATION_ID);
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = {};

async function cached(key, fn) {
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const data = await fn();
  cache[key] = { at: Date.now(), data };
  return data;
}

async function companycamSummary() {
  if (!CC_TOKEN) return companycam.getMockSummary();
  try {
    return await cached("cc", () => companycam.getSummary(CC_TOKEN));
  } catch (err) {
    console.error(err.message);
    return { ...companycam.getMockSummary(), error: err.message };
  }
}

async function brightlocalSummary() {
  if (!BL_KEY) return brightlocal.getMockSummary();
  try {
    return await cached("bl", () => brightlocal.getSummary(BL_KEY, BL_CAMPAIGN));
  } catch (err) {
    console.error(err.message);
    return { ...brightlocal.getMockSummary(), error: err.message };
  }
}

async function facebookSummary() {
  if (!FB_TOKEN || !FB_AD_ACCOUNT) return facebook.getMockSummary();
  try {
    return await cached("fb", () => facebook.getSummary(FB_TOKEN, FB_AD_ACCOUNT, FB_PAGE));
  } catch (err) {
    console.error(err.message);
    return { ...facebook.getMockSummary(), error: err.message };
  }
}

async function gbpSummary() {
  if (!GBP_READY) return gbp.getMockSummary();
  try {
    return await cached("gbp", () => gbp.getSummary(process.env));
  } catch (err) {
    console.error(err.message);
    return { ...gbp.getMockSummary(), error: err.message };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/api/companycam/summary") {
      return json(res, await companycamSummary());
    }
    if (url.pathname === "/api/brightlocal/summary") {
      return json(res, await brightlocalSummary());
    }
    if (url.pathname === "/api/facebook/summary") {
      return json(res, await facebookSummary());
    }
    if (url.pathname === "/api/gbp/summary") {
      return json(res, await gbpSummary());
    }
    if (url.pathname === "/api/status") {
      return json(res, {
        companycam: CC_TOKEN ? "configured" : "mock",
        brightlocal: BL_KEY ? "configured" : "mock",
        facebook: FB_TOKEN && FB_AD_ACCOUNT ? "configured" : "mock",
        googleBusinessProfile: GBP_READY ? "configured" : "mock",
      });
    }

    // Static files
    const file = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(__dirname, "public", path.normalize(file).replace(/^(\.\.[/\\])+/, ""));
    if (filePath.startsWith(path.join(__dirname, "public")) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
      res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

function json(res, data) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

// Minimal .env loader so no dotenv dependency is needed
function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

server.listen(PORT, () => {
  console.log(`Epoxy Ops Panel running at http://localhost:${PORT}`);
  console.log(`CompanyCam: ${CC_TOKEN ? "live" : "mock mode (set COMPANYCAM_TOKEN)"}`);
  console.log(`BrightLocal: ${BL_KEY ? "live" : "mock mode (set BRIGHTLOCAL_API_KEY)"}`);
  console.log(`Facebook: ${FB_TOKEN && FB_AD_ACCOUNT ? "live" : "mock mode (set FB_ACCESS_TOKEN + FB_AD_ACCOUNT_ID)"}`);
  console.log(`Google Business Profile: ${GBP_READY ? "live" : "mock mode (set GBP_* vars)"}`);
});
