# Growth Dashboard — EpoxyGarageFloors.ai

A multi-client growth dashboard for coating contractors. Eleven panels pull
live data from CompanyCam, BrightLocal, Facebook, Google Business Profile,
GoHighLevel, and (for AI captions) Anthropic — each with a demo-data fallback
so every panel renders before you've connected a single account. Zero runtime
dependencies — just Node.js 18+.

## Quick start

```
node server.js
```

Open http://localhost:3000 — with one client configured (the default) this
redirects straight to its dashboard. With no keys configured, everything runs
in demo mode. The status pills at the top show which panels are live vs demo.

## Project structure

```
server.js              the HTTP server, multi-client routing, caching, scheduler
lib/                    one file per integration — API client + getSummary() + getMockSummary()
public/                 dashboard.html (template), dashboard.css, dashboard.js, logo assets
clients.json            the client registry: slug, name, logo, NAP
clients/<slug>.env      per-client API keys (gitignored — copy clients/_example.env.example)
data/<slug>/            per-client runtime state: jobs.json, review-requests.json, sent-report log
.env                    agency-wide settings shared by every client (gitignored)
scripts/                Windows auto-start installer
```

Each `lib/*.js` module is self-contained: shape live data in `getSummary()`,
keep `getMockSummary()` in sync, and render it in `public/dashboard.js`. That's
the whole extension pattern — adding a metric touches those two places.

## Multi-client setup

Every client gets their own entry in `clients.json` and their own URL at
`/c/<slug>`:

```json
{
  "clients": [
    { "slug": "acme-coatings", "name": "Acme Coatings", "logo": "/assets/logos/acme-coatings.png",
      "nap": { "name": "Acme Coatings LLC", "address": "...", "phone": "...", "website": "..." } }
  ]
}
```

To add a client:
1. Add an entry to `clients.json` (pick a URL-safe `slug`).
2. Drop their logo in `public/assets/logos/<slug>.png` and point `logo` at it.
3. Copy `clients/_example.env.example` to `clients/<slug>.env` and fill in
   their CompanyCam/BrightLocal/Facebook/Google/GoHighLevel keys.
4. Restart the server. Their dashboard is now live at `/c/<slug>`.

With more than one client configured, `/` shows a picker page linking to each
dashboard instead of redirecting.

Agency-wide settings that aren't client-specific (Anthropic key for AI
captions, Resend key for email reports) live once in the root `.env`, not per
client — copy `.env.example` to `.env` to set those up.

## What each panel needs, and what's wired vs. demo

**Fully wired — goes live the moment you add keys:**
- **Install schedule & material ordering** — jobs from a GoHighLevel calendar
  (`GHL_API_KEY/GHL_LOCATION_ID/GHL_CALENDAR_ID`) or a `data/<slug>/jobs.json`
  file, converted into base coat / flake / topcoat order quantities.
- **Pipeline — money in motion** — dollars won this month, open estimate
  value, and the biggest deals sitting in the pipeline, pulled from GoHighLevel
  via a Private Integration token (Settings → Private Integrations in your GHL
  agency; scope `opportunities.readonly`).
- **Reviews — velocity** — new Google reviews this month against requests
  sent, with a conversion rate. New reviews come from your Google Business
  Profile (reuses the GBP_* OAuth vars, plus `GBP_ACCOUNT_ID`); requests sent
  is logged locally with the "+1 request sent" button (no platform exposes
  that number via API).
- **Auto-poster** — drafts a caption for each of the latest CompanyCam
  photos. Add `ANTHROPIC_API_KEY` and captions are genuinely written per job
  by Claude instead of templated. One-click publishing to Google/Facebook is
  the natural next build once GBP access is approved — `createPost()` in
  `lib/googlebusiness.js` is ready for it.
- **Website, local rankings, citations, job photos, Facebook ads, Google
  profile** — same as before: BrightLocal, CompanyCam, Facebook, and Google
  Business Profile/GA4 keys light these up. See each file in `lib/` for the
  exact setup steps (they're in the header comment of each module).
- **Email monthly report** — the header button fires a branded HTML summary
  (jobs won, pipeline, reviews, calls, rankings) via Resend
  (`RESEND_API_KEY` in the root `.env`, plus `REPORT_TO_EMAIL` per client). It
  also auto-sends once a day-of-month check finds it's the 1st and no report
  has gone out yet this month — no cron needed, the server checks hourly.

**Demo-only by design:**
- **Geo-grid** — the 7×7 colored dot spread across town with average rank and
  top-3 count. BrightLocal's Local Search Grid product doesn't expose a public
  read API yet, so this sells the concept now; when BrightLocal ships an API
  for it (or you export a grid manually), wire it in `lib/geogrid.js` —
  `getSummary()` is the documented hook.

Restart the server after editing any `.env` file. Every integration falls
back to demo data independently, so connect them in whatever order is
easiest.

## Running it on a wall tablet

Run the server on any always-on machine (an old laptop, a Raspberry Pi, or
the shop PC) and point the tablet's browser at
`http://<that machine's IP>:<port>/c/<slug>`. The page refreshes itself every
5 minutes.

## Auto-start on Windows

So you never have to run `node server.js` by hand:

```
powershell -ExecutionPolicy Bypass -File scripts\install-windows-autostart.ps1
```

This registers a scheduled task that starts the dashboard, hidden in the
background, whenever you log in — and starts it immediately so you don't need
to log out and back in. To remove it: run
`scripts\uninstall-windows-autostart.ps1`.

## Extending

Adding a panel means: shape the data in a new `lib/<thing>.js` module (with
`getSummary()` + `getMockSummary()`), register it in the `PANELS` map in
`server.js`, add a `<section class="panel">` to `public/dashboard.html`, and a
`load<Thing>()` function in `public/dashboard.js`. Good next candidates:
one-click publishing from the auto-poster straight to Google/Facebook, and
CompanyCam webhooks for instant photo alerts instead of polling.
