// EpoxyGarageFloors.ai Growth Dashboard — server
// Zero runtime dependencies. Requires Node 18+ (built-in fetch).
//
//   Run:   node server.js
//   Open:  http://localhost:3000  (or http://localhost:3000/c/<slug> per client)
//
// See README.md for the project layout and how to add a client.

const http = require("http");
const fs = require("fs");
const path = require("path");

const companycam = require("./lib/companycam");
const brightlocal = require("./lib/brightlocal");
const facebook = require("./lib/facebook");
const gbp = require("./lib/googlebusiness");
const citations = require("./lib/citations");
const schedule = require("./lib/schedule");
const website = require("./lib/website");
const ghl = require("./lib/ghl");
const reviews = require("./lib/reviews");
const geogrid = require("./lib/geogrid");
const autoposter = require("./lib/autoposter");
const email = require("./lib/email");

const ROOT = __dirname;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------- env loading ----------------

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// Agency-wide vars (shared across every client): PORT, ANTHROPIC_*, RESEND_API_KEY
const agencyEnv = parseEnvFile(path.join(ROOT, ".env"));
for (const [k, v] of Object.entries(agencyEnv)) if (!process.env[k]) process.env[k] = v;

const SHARED_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL", "RESEND_API_KEY"];

// ---------------- client registry ----------------

function loadClients() {
  const file = path.join(ROOT, "clients.json");
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw.clients || [];
}

const clients = loadClients();
const clientBySlug = new Map(clients.map((c) => [c.slug, c]));

if (!clients.length) {
  console.error("No clients configured in clients.json — see clients.json.example");
  process.exit(1);
}

function clientEnv(slug) {
  const fileVars = parseEnvFile(path.join(ROOT, "clients", `${slug}.env`));
  const env = { ...fileVars };
  for (const k of SHARED_KEYS) env[k] = process.env[k] || "";
  return env;
}

function dataDir(slug) {
  const dir = path.join(ROOT, "data", slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------- per-client cache + safe fallback ----------------

const cache = new Map();

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function safe(cacheKey, configured, live, mock) {
  if (!configured) return mock();
  try {
    return await cached(cacheKey, live);
  } catch (err) {
    console.error(`[${cacheKey}]`, err.message);
    return { ...(await mock()), error: err.message };
  }
}

// ---------------- per-panel summaries ----------------

async function companycamSummary(slug, env) {
  return safe(`${slug}:cc`, !!env.COMPANYCAM_TOKEN,
    () => companycam.getSummary(env.COMPANYCAM_TOKEN),
    () => companycam.getMockSummary());
}

async function brightlocalSummary(slug, env) {
  return safe(`${slug}:bl`, !!env.BRIGHTLOCAL_API_KEY,
    () => brightlocal.getSummary(env.BRIGHTLOCAL_API_KEY, env.BRIGHTLOCAL_CAMPAIGN_ID || null),
    () => brightlocal.getMockSummary());
}

async function facebookSummary(slug, env) {
  return safe(`${slug}:fb`, !!(env.FB_ACCESS_TOKEN && env.FB_AD_ACCOUNT_ID),
    () => facebook.getSummary(env.FB_ACCESS_TOKEN, env.FB_AD_ACCOUNT_ID, env.FB_PAGE_ID),
    () => facebook.getMockSummary());
}

function gbpReady(env) {
  return !!(env.GBP_CLIENT_ID && env.GBP_CLIENT_SECRET && env.GBP_REFRESH_TOKEN && env.GBP_LOCATION_ID);
}

async function gbpSummary(slug, env) {
  return safe(`${slug}:gbp`, gbpReady(env), () => gbp.getSummary(env), () => gbp.getMockSummary());
}

async function citationsSummary(slug, env) {
  return safe(`${slug}:ct`, !!(env.BRIGHTLOCAL_API_KEY && env.BRIGHTLOCAL_CT_REPORT_ID),
    () => citations.getSummary(env), () => citations.getMockSummary(env));
}

async function websiteSummary(slug, env) {
  return safe(`${slug}:web`, !!(env.GA4_PROPERTY_ID && env.GBP_REFRESH_TOKEN),
    () => website.getSummary(env), () => website.getMockSummary());
}

async function scheduleSummary(slug, env) {
  const jobsPath = path.join(dataDir(slug), "jobs.json");
  const hasGhl = !!(env.GHL_API_KEY && env.GHL_LOCATION_ID && env.GHL_CALENDAR_ID);
  const hasFile = fs.existsSync(jobsPath);
  return safe(`${slug}:sched`, hasGhl || hasFile,
    () => schedule.getSummary(env, jobsPath), () => schedule.getMockSummary(env));
}

async function pipelineSummary(slug, env) {
  return safe(`${slug}:ghl`, !!(env.GHL_API_KEY && env.GHL_LOCATION_ID),
    () => ghl.getSummary(env), () => ghl.getMockSummary());
}

async function reviewsSummary(slug, env) {
  const logPath = path.join(dataDir(slug), "review-requests.json");
  return safe(`${slug}:rev`, gbpReady(env) && !!env.GBP_ACCOUNT_ID,
    () => reviews.getSummary(env, logPath), () => reviews.getMockSummary());
}

async function geogridSummary(slug, env) {
  // Always demo — see lib/geogrid.js for why.
  return geogrid.getMockSummary(env);
}

async function autoposterDrafts(slug, env) {
  const cc = await companycamSummary(slug, env);
  return cached(`${slug}:autoposter:${cc.source}`, () => autoposter.getDrafts(cc, env));
}

const PANELS = {
  companycam: companycamSummary,
  brightlocal: brightlocalSummary,
  facebook: facebookSummary,
  gbp: gbpSummary,
  citations: citationsSummary,
  website: websiteSummary,
  schedule: scheduleSummary,
  pipeline: pipelineSummary,
  reviews: reviewsSummary,
  geogrid: geogridSummary,
};

async function statusFor(slug, env) {
  return {
    companycam: env.COMPANYCAM_TOKEN ? "configured" : "mock",
    brightlocal: env.BRIGHTLOCAL_API_KEY ? "configured" : "mock",
    facebook: env.FB_ACCESS_TOKEN && env.FB_AD_ACCOUNT_ID ? "configured" : "mock",
    googleBusinessProfile: gbpReady(env) ? "configured" : "mock",
    citations: env.BRIGHTLOCAL_API_KEY && env.BRIGHTLOCAL_CT_REPORT_ID ? "configured" : "mock",
    website: env.GA4_PROPERTY_ID && env.GBP_REFRESH_TOKEN ? "configured" : "mock",
    pipeline: env.GHL_API_KEY && env.GHL_LOCATION_ID ? "configured" : "mock",
    reviews: gbpReady(env) && env.GBP_ACCOUNT_ID ? "configured" : "mock",
    geogrid: "demo",
    autoposter: env.ANTHROPIC_API_KEY ? "ai" : "template",
  };
}

// ---------------- monthly email report (manual + auto-send on the 1st) ----------------

async function buildReportData(slug, env) {
  const [pipeline, revs, gbpData, bl] = await Promise.all([
    pipelineSummary(slug, env),
    reviewsSummary(slug, env),
    gbpSummary(slug, env),
    brightlocalSummary(slug, env),
  ]);
  return { pipeline, reviews: revs, gbp: gbpData, brightlocal: bl };
}

async function sendReportForClient(client, env) {
  const data = await buildReportData(client.slug, env);
  return email.sendMonthlyReport(env, client, data);
}

function monthKeyOf(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastSentPath(slug) {
  return path.join(dataDir(slug), "last-report-sent.json");
}

function readLastSent(slug) {
  const p = lastSentPath(slug);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")).month; } catch { return null; }
}

function writeLastSent(slug, month) {
  fs.writeFileSync(lastSentPath(slug), JSON.stringify({ month, sentAt: new Date().toISOString() }, null, 2));
}

async function checkAutoSend() {
  const now = new Date();
  if (now.getDate() !== 1) return;
  const thisMonth = monthKeyOf(now);
  for (const client of clients) {
    const env = clientEnv(client.slug);
    if (!env.RESEND_API_KEY || !env.REPORT_TO_EMAIL) continue;
    if (readLastSent(client.slug) === thisMonth) continue;
    try {
      await sendReportForClient(client, env);
      writeLastSent(client.slug, thisMonth);
      console.log(`Monthly report sent for ${client.slug}`);
    } catch (err) {
      console.error(`Monthly report failed for ${client.slug}:`, err.message);
    }
  }
}

setInterval(checkAutoSend, 60 * 60 * 1000);
checkAutoSend();

// ---------------- HTML rendering ----------------

const DASHBOARD_HTML = fs.readFileSync(path.join(ROOT, "public", "dashboard.html"), "utf8");

function renderDashboard(client) {
  const logoImg = client.logo
    ? `<img src="${escapeHtml(client.logo)}" alt="${escapeHtml(client.name)}" style="height:44px;width:auto">`
    : "";
  return DASHBOARD_HTML
    .replace(/{{CLIENT_NAME}}/g, escapeHtml(client.name))
    .replace(/{{CLIENT_TAGLINE}}/g, escapeHtml(client.tagline || ""))
    .replace(/{{CLIENT_LOGO_IMG}}/g, logoImg)
    .replace(/{{CLIENT_SLUG_JSON}}/g, JSON.stringify(client.slug));
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderPickerPage() {
  const items = clients.map((c) => `
    <a href="/c/${encodeURIComponent(c.slug)}" style="display:flex;align-items:center;gap:14px;padding:16px;background:#101014;border:1px solid #26262e;border-radius:12px;text-decoration:none;color:#e8ecf2;margin-bottom:10px">
      ${c.logo ? `<img src="${c.logo}" alt="" style="height:36px">` : ""}
      <span style="font-weight:600">${escapeHtml(c.name)}</span>
    </a>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Growth Dashboards</title>
  <style>body{background:#050507;color:#e8ecf2;font-family:"Segoe UI",system-ui,sans-serif;padding:32px;max-width:480px;margin:0 auto}</style>
  </head><body><h1 style="font-size:18px;margin-bottom:16px">Choose a dashboard</h1>${items}</body></html>`;
}

// ---------------- HTTP server ----------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);

  try {
    // Static assets: /assets/logos/xyz.png
    if (parts[0] === "assets") {
      return serveStatic(res, path.join(ROOT, "public", "assets", ...parts.slice(1)));
    }
    if (url.pathname === "/dashboard.js" || url.pathname === "/dashboard.css") {
      return serveStatic(res, path.join(ROOT, "public", url.pathname));
    }

    if (url.pathname === "/") {
      if (clients.length === 1) {
        res.writeHead(302, { Location: `/c/${clients[0].slug}` });
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(renderPickerPage());
    }

    if (parts[0] === "c" && parts[1]) {
      const slug = parts[1];
      const client = clientBySlug.get(slug);
      if (!client) return notFound(res);
      const env = clientEnv(slug);

      // /c/:slug
      if (parts.length === 2) {
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end(renderDashboard(client));
      }

      // /c/:slug/api/...
      if (parts[2] === "api") {
        const panel = parts[3];
        const action = parts[4];

        if (panel === "status" && !action) {
          return json(res, await statusFor(slug, env));
        }
        if (panel === "autoposter" && action === "drafts") {
          return json(res, { drafts: await autoposterDrafts(slug, env), aiEnabled: !!env.ANTHROPIC_API_KEY });
        }
        if (panel === "reviews" && action === "log-request" && req.method === "POST") {
          const logPath = path.join(dataDir(slug), "review-requests.json");
          const total = reviews.logRequestSent(logPath, 1);
          return json(res, { requestsSentThisMonth: total });
        }
        if (panel === "email" && action === "send-report" && req.method === "POST") {
          try {
            await sendReportForClient(client, env);
            return json(res, { ok: true });
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        }
        if (PANELS[panel] && action === "summary") {
          return json(res, await PANELS[panel](slug, env));
        }
      }

      return notFound(res);
    }

    return notFound(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

function serveStatic(res, filePath) {
  if (!filePath.startsWith(path.join(ROOT, "public")) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return notFound(res);
  }
  const ext = path.extname(filePath);
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

function json(res, data) {
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Growth Dashboard running at http://localhost:${PORT}`);
  for (const c of clients) console.log(`  ${c.name}: http://localhost:${PORT}/c/${c.slug}`);
});
