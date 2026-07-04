# Epoxy Ops Panel — BrightLocal, CompanyCam, Facebook, and Google Business Profile

A small self-hosted dashboard panel that pulls live data from BrightLocal (local keyword rankings), CompanyCam (job photo documentation), Facebook (ad spend, leads, and scheduled posts), and Google Business Profile (views, calls, direction requests) and displays them in a dark wall-panel layout. No dependencies to install — just Node.js 18 or newer.

## Quick start

```
node server.js
```

Open http://localhost:3000. With no keys configured it runs in demo mode so you can see the layout with sample data. The status pills at the top right show which services are live vs demo.

## Connecting your accounts

Copy `.env.example` to `.env` and fill in the two keys:

**CompanyCam** — log into the CompanyCam web app, go to Company Settings, then Integrations, then Access Tokens, and create a token. You need the Admin role. Paste it as `COMPANYCAM_TOKEN`.

**BrightLocal** — log into BrightLocal, open Account Settings, then API Access, and copy your API key. Paste it as `BRIGHTLOCAL_API_KEY`. New keys start as trial keys with 250 free requests; the panel caches responses for 5 minutes so a wall tablet running all day uses roughly 150–200 requests per day. If you track multiple rank campaigns, set `BRIGHTLOCAL_CAMPAIGN_ID` to pin the panel to one; otherwise it uses the first campaign on your account.

**Facebook** — go to developers.facebook.com and create an app (Business type), then use the Graph API Explorer to generate a token with the ads_read and pages_read_engagement permissions, and exchange it for a long-lived token (about 60 days; the token debugger shows expiry). Set `FB_ACCESS_TOKEN`, plus `FB_AD_ACCOUNT_ID` (the number in your Ads Manager URL, without the act_ prefix) and `FB_PAGE_ID` if you want scheduled posts shown.

**Google Business Profile** — this one has the most setup because Google gates the Business Profile APIs behind an access request. In Google Cloud Console: create a project, request Business Profile API access (Google's form, usually approved in a few days for legitimate businesses), enable the Business Profile Performance API, create OAuth credentials, run the consent flow once with the business.manage scope, and save the refresh token. Fill in the four GBP_* variables. The panel then pulls views, calls, and direction requests, and `lib/googlebusiness.js` includes a `createPost` function ready for auto-posting finished-floor photos.

Restart the server after editing `.env`. Every service falls back to demo data independently, so you can connect them one at a time in whatever order is easiest — CompanyCam and BrightLocal are quick wins, Facebook is a lunch break, Google is a form and a few days of waiting.

## What each panel shows

**BrightLocal panel**: your tracked keywords with current Google rank and movement since the last check, plus summary tiles for best rank, number of top-3 positions, and keywords that moved up. Review summary data (average rating, reviews awaiting reply) is included in demo mode as a placeholder — BrightLocal's review data comes from their Reputation Manager reports, and wiring that in depends on which BrightLocal plan and report setup you have, so that hook is left in `lib/brightlocal.js` ready to extend.

**CompanyCam panel**: photos uploaded today across the company, your most recent projects with per-job photo counts, and a red alert banner for any job with no activity in 3+ days — the "crew forgot to document" catcher.

## Running it on a wall tablet

Run the server on any always-on machine (an old laptop, a Raspberry Pi, or the shop PC) and point the tablet's browser at `http://<that-machine's-ip>:3000`. The page refreshes itself every 5 minutes. If you use Home Assistant like your existing wall panel, you can embed this as a webpage card or iframe.

## Files

- `server.js` — the web server and API proxy. Your keys stay on the server; the browser never sees them.
- `lib/companycam.js` — CompanyCam API client (Bearer token, api.companycam.com/v2)
- `lib/brightlocal.js` — BrightLocal API client (API key, tools.brightlocal.com)
- `lib/facebook.js` — Meta Graph API client (ad insights + page scheduled posts)
- `lib/googlebusiness.js` — Google Business Profile client (OAuth refresh flow, performance metrics, post creation)
- `public/index.html` — the dashboard page

## Extending

Both client modules return one summary object each, so adding a metric means touching two places: shape it in the `getSummary` function of the module, then render it in `index.html`. Good next candidates: CompanyCam webhooks for instant photo alerts instead of polling, BrightLocal Reputation Manager reports for live review data, and the auto-posting pipeline — a small cron job that takes the day's final CompanyCam photos and calls `createPost` in `lib/googlebusiness.js` so finished floors publish themselves to your Google profile.
