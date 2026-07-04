// ============================================================
// EpoxyGarageFloors.ai Growth Dashboard — ALL-IN-ONE
// Server + 7 panels in one file: install schedule & material ordering,
// website analytics, BrightLocal rankings, citations, CompanyCam photos,
// Facebook ads & scheduled posts, Google Business Profile.
// No folders. No dependencies. Requires Node.js 18+.
//
//   Run:   node epoxy-panel.js
//   Open:  http://localhost:3000
//
// Connect accounts via a  .env  file in the SAME folder as this file:
//
//   COMPANYCAM_TOKEN=
//   BRIGHTLOCAL_API_KEY=
//   BRIGHTLOCAL_CAMPAIGN_ID=
//   BRIGHTLOCAL_CT_REPORT_ID=
//   NAP_NAME=
//   NAP_ADDRESS=
//   NAP_PHONE=
//   NAP_WEBSITE=
//   FB_ACCESS_TOKEN=
//   FB_AD_ACCOUNT_ID=
//   FB_PAGE_ID=
//   GBP_CLIENT_ID=
//   GBP_CLIENT_SECRET=
//   GBP_REFRESH_TOKEN=
//   GBP_LOCATION_ID=
//   GA4_PROPERTY_ID=              <- website panel (reuses GBP_ Google login)
//   GHL_API_KEY=                  <- optional: pull install schedule from GoHighLevel
//   GHL_LOCATION_ID=
//   GHL_CALENDAR_ID=
//   BASE_COAT_SQFT_PER_KIT=450    <- material math, match your supplier
//   FLAKE_LBS_PER_SQFT=0.2
//   TOPCOAT_SQFT_PER_KIT=500
//
// INSTALL SCHEDULE without GoHighLevel: create jobs.json next to this file:
//   [{ "name": "Henderson", "date": "2026-07-08", "sqft": 780, "system": "flake" }]
//
// Any service without keys shows demo data. Restart after editing .env.
// ============================================================

const http = require("http");
const fs = require("fs");
const path = require("path");

// ---------------- integration modules ----------------

const companycam = (() => {
// CompanyCam client — https://docs.companycam.com
// Auth: Bearer access token. Generate one in CompanyCam:
// Web app -> Company Settings -> Integrations -> Access Tokens (Admin role required).

const BASE = "https://api.companycam.com/v2";

async function ccFetch(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CompanyCam ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Recent projects (CompanyCam returns newest activity first)
async function getProjects(token, perPage = 25) {
  return ccFetch(`/projects?per_page=${perPage}`, token);
}

async function getProjectPhotos(token, projectId, perPage = 5) {
  return ccFetch(`/projects/${projectId}/photos?per_page=${perPage}`, token);
}

// Company-wide photo feed, newest first
async function getRecentPhotos(token, perPage = 50) {
  return ccFetch(`/photos?per_page=${perPage}`, token);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// Shape everything the dashboard panel needs in one object.
async function getSummary(token) {
  const [projects, photos] = await Promise.all([
    getProjects(token),
    getRecentPhotos(token),
  ]);

  const todayStart = startOfToday();
  const photosToday = photos.filter((p) => (p.created_at || 0) >= todayStart);

  // Photo counts per project for the recent feed
  const countByProject = {};
  for (const p of photosToday) {
    if (p.project_id) countByProject[p.project_id] = (countByProject[p.project_id] || 0) + 1;
  }

  const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 86400;
  const activeProjects = projects.slice(0, 12).map((proj) => ({
    id: proj.id,
    name: proj.name,
    address: proj.address ? `${proj.address.street_address_1 || ""}, ${proj.address.city || ""}`.replace(/^, /, "") : "",
    photosToday: countByProject[proj.id] || 0,
    lastActivity: proj.updated_at || proj.created_at,
    stale: (proj.updated_at || 0) < threeDaysAgo,
    url: proj.public_url || null,
  }));

  const nameByProject = {};
  for (const proj of projects) nameByProject[proj.id] = proj.name;

  // Fall back to most recent photos overall if none yet today (early morning)
  const feedSource = photosToday.length ? photosToday : photos;
  const latestPhotos = feedSource.slice(0, 12).map((p) => ({
    id: p.id,
    projectId: p.project_id,
    projectName: nameByProject[p.project_id] || "",
    capturedAt: p.captured_at || p.created_at,
    creator: p.creator_name || "",
    // uris is an array of sized variants; grab a web-friendly one
    thumb: pickUri(p, "web_thumbnail") || pickUri(p, "thumbnail") || pickUri(p, "web"),
    full: pickUri(p, "web") || pickUri(p, "original"),
  }));

  return {
    source: "live",
    photosToday: photosToday.length,
    activeProjects,
    projectsMissingPhotos: activeProjects.filter((p) => p.stale).map((p) => p.name),
    latestPhotos,
  };
}

function pickUri(photo, type) {
  if (!Array.isArray(photo.uris)) return null;
  const hit = photo.uris.find((u) => u.type === type);
  return hit ? hit.uri || hit.url : null;
}

// Demo data so the panel renders before keys are configured.
function getMockSummary() {
  const now = Math.floor(Date.now() / 1000);
  return {
    source: "mock",
    photosToday: 38,
    activeProjects: [
      { id: "1", name: "Henderson — 3-car full flake", address: "1412 Cedar Ridge Dr, Springfield", photosToday: 16, lastActivity: now - 900, stale: false },
      { id: "2", name: "Ramirez — 2-car solid gray", address: "88 Loganberry Ln, Nixa", photosToday: 12, lastActivity: now - 3600, stale: false },
      { id: "3", name: "Whitfield — topcoat", address: "301 E Walnut St, Ozark", photosToday: 10, lastActivity: now - 7200, stale: false },
      { id: "4", name: "Barker — estimate", address: "77 Prairie View Rd, Rogersville", photosToday: 0, lastActivity: now - 4 * 86400, stale: true },
      { id: "5", name: "Doyle — 4-car metallic", address: "560 Timber Creek Ave, Republic", photosToday: 0, lastActivity: now - 5 * 86400, stale: true },
    ],
    projectsMissingPhotos: ["Barker — estimate", "Doyle — 4-car metallic"],
    latestPhotos: mockPhotos(),
  };
}

// Placeholder thumbnails for demo mode: simple epoxy-flake style SVGs
function mockPhotos() {
  const jobs = [
    ["Henderson — grind", "Brad", "#4a5568", "#718096"],
    ["Henderson — patch", "Tyler", "#5a4a3a", "#8a7a6a"],
    ["Ramirez — base coat", "Marcus", "#3a4a5a", "#5a7a9a"],
    ["Ramirez — flake", "Joe", "#4a4a52", "#9a9aa2"],
    ["Whitfield — topcoat", "Brad", "#3d4451", "#6d7481"],
    ["Whitfield — final", "Tyler", "#44505e", "#8494a8"],
  ];
  const now = Math.floor(Date.now() / 1000);
  return jobs.map(([name, who, c1, c2], i) => {
    let flakes = "";
    for (let f = 0; f < 40; f++) {
      const x = (f * 37) % 200, y = (f * 53) % 120;
      flakes += `<rect x="${x}" y="${y}" width="3" height="3" fill="${f % 2 ? c2 : "#cbd5e0"}" transform="rotate(${f * 23} ${x} ${y})"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="${c1}"/>${flakes}</svg>`;
    return {
      id: String(i),
      projectName: name,
      creator: who,
      capturedAt: now - (i + 1) * 1800,
      thumb: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
      full: null,
    };
  });
}

return { getSummary, getMockSummary, getProjects, getProjectPhotos, getRecentPhotos };

})();

const brightlocal = (() => {
// BrightLocal client — https://apidocs.brightlocal.com and https://developer.brightlocal.com
// Auth: API key (Account Settings -> API Access). Most read endpoints take api-key as a
// query parameter. Trial keys allow 250 free requests; Management API calls are unlimited
// on an active subscription.

const BASE = "https://tools.brightlocal.com/seo-tools/api";

async function blFetch(path, apiKey, extraParams = {}) {
  const params = new URLSearchParams({ "api-key": apiKey, ...extraParams });
  const res = await fetch(`${BASE}${path}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`BrightLocal ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// All Local Search Rank Checker campaigns on the account
async function getRankCampaigns(apiKey) {
  const data = await blFetch("/v2/lsrc/get-all", apiKey);
  return data?.response?.results || [];
}

// Latest ranking results for one campaign
async function getRankResults(apiKey, campaignId) {
  const data = await blFetch("/v2/lsrc/results/get", apiKey, { "campaign-id": campaignId });
  return data?.response?.result || null;
}

// Shape the dashboard payload: keyword ranks + movement for the first campaign
// (or a specific one via BRIGHTLOCAL_CAMPAIGN_ID).
async function getSummary(apiKey, campaignId = null) {
  const campaigns = await getRankCampaigns(apiKey);
  if (!campaigns.length) return { source: "live", campaign: null, keywords: [] };

  const target = campaignId
    ? campaigns.find((c) => String(c.campaign_id) === String(campaignId)) || campaigns[0]
    : campaigns[0];

  const result = await getRankResults(apiKey, target.campaign_id);
  const keywords = [];

  const kwList = result?.rankings?.keywords || [];
  const rankings = result?.rankings?.rankings || {};
  for (const kw of kwList) {
    const google = rankings[kw]?.google?.[0] || {};
    const current = normalizeRank(google.rank);
    const previous = normalizeRank(google.last);
    keywords.push({
      keyword: kw,
      rank: current,
      previous,
      change: current != null && previous != null ? previous - current : 0,
    });
  }
  keywords.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  return {
    source: "live",
    campaign: { id: target.campaign_id, name: target.name || target.campaign_name || "Rank tracking" },
    keywords: keywords.slice(0, 10),
  };
}

function normalizeRank(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Demo data so the panel renders before keys are configured.
function getMockSummary() {
  return {
    source: "mock",
    campaign: { id: 0, name: "Springfield MO — epoxy floors" },
    keywords: [
      { keyword: "epoxy garage floor springfield mo", rank: 2, previous: 3, change: 1 },
      { keyword: "garage floor coating springfield", rank: 3, previous: 3, change: 0 },
      { keyword: "polyaspartic floor coating near me", rank: 4, previous: 6, change: 2 },
      { keyword: "epoxy flooring nixa mo", rank: 5, previous: 4, change: -1 },
      { keyword: "concrete floor coating ozark", rank: 7, previous: 9, change: 2 },
      { keyword: "garage floor epoxy cost", rank: 11, previous: 14, change: 3 },
    ],
    reviews: {
      averageRating: 4.9,
      totalReviews: 127,
      newThisWeek: 2,
      awaitingReply: [
        { author: "Denise K.", rating: 5, site: "Google", daysOld: 4, snippet: "Floor looks amazing, crew was in and out in two days..." },
      ],
    },
  };
}

return { getSummary, getMockSummary, getRankCampaigns, getRankResults };

})();

const facebook = (() => {
// Facebook / Meta Graph API client
// Auth: a long-lived access token. Easiest path:
//   1. developers.facebook.com -> create an app (Business type)
//   2. Graph API Explorer -> generate a token with ads_read, pages_read_engagement,
//      pages_manage_posts, then exchange it for a long-lived token
// Env: FB_ACCESS_TOKEN, FB_AD_ACCOUNT_ID (numbers only, no "act_"), FB_PAGE_ID

const GRAPH = "https://graph.facebook.com/v21.0";

async function fbFetch(path, token, params = {}) {
  const qs = new URLSearchParams({ access_token: token, ...params });
  const res = await fetch(`${GRAPH}${path}?${qs.toString()}`);
  const data = await res.json();
  if (data.error) throw new Error(`Facebook: ${data.error.message}`);
  return data;
}

// Spend + leads per campaign for a date preset ("today", "last_7d", etc.)
async function getAdInsights(token, adAccountId, datePreset = "today") {
  const data = await fbFetch(`/act_${adAccountId}/insights`, token, {
    level: "campaign",
    date_preset: datePreset,
    fields: "campaign_name,spend,actions,cpm,clicks",
  });
  return (data.data || []).map((row) => {
    const leadAction = (row.actions || []).find((a) => a.action_type === "lead" || a.action_type === "leadgen.other");
    const leads = leadAction ? parseInt(leadAction.value, 10) : 0;
    const spend = parseFloat(row.spend || 0);
    return {
      campaign: row.campaign_name,
      spend: Math.round(spend * 100) / 100,
      leads,
      costPerLead: leads ? Math.round((spend / leads) * 100) / 100 : null,
    };
  });
}

// Posts scheduled on the Facebook page but not yet published
async function getScheduledPosts(token, pageId) {
  const data = await fbFetch(`/${pageId}/scheduled_posts`, token, {
    fields: "message,scheduled_publish_time",
  });
  return (data.data || []).map((p) => ({
    message: (p.message || "").slice(0, 90),
    publishAt: p.scheduled_publish_time,
  }));
}

async function getSummary(token, adAccountId, pageId) {
  const [today, week, scheduled] = await Promise.all([
    getAdInsights(token, adAccountId, "today"),
    getAdInsights(token, adAccountId, "last_7d"),
    pageId ? getScheduledPosts(token, pageId).catch(() => []) : Promise.resolve([]),
  ]);

  const weekSpend = week.reduce((s, c) => s + c.spend, 0);
  const weekLeads = week.reduce((s, c) => s + c.leads, 0);

  return {
    source: "live",
    campaignsToday: today,
    week: {
      spend: Math.round(weekSpend * 100) / 100,
      leads: weekLeads,
      costPerLead: weekLeads ? Math.round((weekSpend / weekLeads) * 100) / 100 : null,
    },
    scheduledPosts: scheduled,
  };
}

function getMockSummary() {
  return {
    source: "mock",
    campaignsToday: [
      { campaign: "Summer flake special", spend: 18.4, leads: 3, costPerLead: 6.13 },
      { campaign: "Retargeting — site visitors", spend: 6.1, leads: 1, costPerLead: 6.1 },
    ],
    week: { spend: 172.9, leads: 7, costPerLead: 24.7 },
    scheduledPosts: [
      { message: "Henderson before/after reel — full flake, 780 sq ft in 2 days", publishAt: isoInDays(1, 9) },
      { message: "Why flake beats paint: 5 photos that settle it", publishAt: isoInDays(2, 10) },
      { message: "July promo: $200 off any 3-car garage booked this month", publishAt: isoInDays(4, 8) },
    ],
  };
}

function isoInDays(days, hour) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

return { getSummary, getMockSummary, getAdInsights, getScheduledPosts };

})();

const gbp = (() => {
// Google Business Profile client
// Auth: OAuth 2.0 with a refresh token (server-side, no browser needed once set up).
// One-time setup:
//   1. console.cloud.google.com -> create a project, enable "Google Business Profile API"
//      family (requires requesting access via Google's Business Profile API form)
//   2. Create OAuth credentials (Desktop type), run the consent flow once with scope
//      https://www.googleapis.com/auth/business.manage, save the refresh token
// Env: GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REFRESH_TOKEN, GBP_LOCATION_ID
//   (GBP_LOCATION_ID is the numeric id from your location resource name "locations/123...")

let cachedToken = { value: null, expiresAt: 0 };

async function getAccessToken(clientId, clientSecret, refreshToken) {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Google OAuth: ${data.error_description || data.error}`);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function gFetch(url, accessToken, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GBP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// Profile performance: views, calls, direction requests over the last N days
async function getPerformance(accessToken, locationId, days = 7) {
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const metrics = [
    "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
    "BUSINESS_IMPRESSIONS_DESKTOP_MAPS", "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
    "CALL_CLICKS", "BUSINESS_DIRECTION_REQUESTS", "WEBSITE_CLICKS",
  ];
  const params = new URLSearchParams();
  for (const m of metrics) params.append("dailyMetrics", m);
  params.append("dailyRange.start_date.year", start.getFullYear());
  params.append("dailyRange.start_date.month", start.getMonth() + 1);
  params.append("dailyRange.start_date.day", start.getDate());
  params.append("dailyRange.end_date.year", end.getFullYear());
  params.append("dailyRange.end_date.month", end.getMonth() + 1);
  params.append("dailyRange.end_date.day", end.getDate());

  const data = await gFetch(
    `https://businessprofileperformance.googleapis.com/v1/locations/${locationId}:fetchMultiDailyMetricsTimeSeries?${params}`,
    accessToken
  );

  const totals = {};
  for (const series of data.multiDailyMetricTimeSeries || []) {
    for (const metricSeries of series.dailyMetricTimeSeries || []) {
      const sum = (metricSeries.timeSeries?.datedValues || [])
        .reduce((s, dv) => s + parseInt(dv.value || 0, 10), 0);
      totals[metricSeries.dailyMetric] = sum;
    }
  }
  const views =
    (totals.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH || 0) + (totals.BUSINESS_IMPRESSIONS_MOBILE_SEARCH || 0) +
    (totals.BUSINESS_IMPRESSIONS_DESKTOP_MAPS || 0) + (totals.BUSINESS_IMPRESSIONS_MOBILE_MAPS || 0);
  return {
    views,
    calls: totals.CALL_CLICKS || 0,
    directions: totals.BUSINESS_DIRECTION_REQUESTS || 0,
    websiteClicks: totals.WEBSITE_CLICKS || 0,
  };
}

// Create a "What's New" post on the profile (v4 local posts endpoint)
async function createPost(accessToken, accountId, locationId, summary, photoUrl = null) {
  const body = {
    languageCode: "en-US",
    topicType: "STANDARD",
    summary,
    ...(photoUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: photoUrl }] } : {}),
  };
  return gFetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/localPosts`,
    accessToken,
    { method: "POST", body: JSON.stringify(body) }
  );
}

async function getSummary(env) {
  const token = await getAccessToken(env.GBP_CLIENT_ID, env.GBP_CLIENT_SECRET, env.GBP_REFRESH_TOKEN);
  const perf = await getPerformance(token, env.GBP_LOCATION_ID, 7);
  return { source: "live", last7Days: perf };
}

function getMockSummary() {
  return {
    source: "mock",
    last7Days: { views: 142, calls: 9, directions: 3, websiteClicks: 21 },
    nextQueuedPost: "Whitfield finished floor — metallic gray, ready for the weekend",
  };
}

return { getSummary, getMockSummary, getAccessToken, getPerformance, createPost };

})();

const citations = (() => {
// Citations — NAP master record + BrightLocal Citation Tracker
// The NAP (Name, Address, Phone) record here is the single source of truth:
// every citation built must match it exactly. Set it via env vars.
//
// Live citation data comes from BrightLocal's Citation Tracker report:
//   GET /v2/ct/get-results?api-key=...&report-id=...
// Find the report-id in the BrightLocal dashboard URL when viewing a
// Citation Tracker report for the location.
//
// Ordering NEW citations at volume goes through BrightLocal Citation Builder
// (their team manually submits to 1,500+ directories; $2.00-$3.20 per listing,
// white-label). Campaign ordering via their Management API:
// developer.brightlocal.com/docs/management-apis (Citation Builder section).
//
// Env: BRIGHTLOCAL_API_KEY (shared), BRIGHTLOCAL_CT_REPORT_ID,
//      NAP_NAME, NAP_ADDRESS, NAP_PHONE, NAP_WEBSITE

const BASE = "https://tools.brightlocal.com/seo-tools/api";

async function getCitationResults(apiKey, reportId) {
  const params = new URLSearchParams({ "api-key": apiKey, "report-id": reportId });
  const res = await fetch(`${BASE}/v2/ct/get-results?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`BrightLocal CT ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function napFromEnv(env) {
  return {
    name: env.NAP_NAME || "",
    address: env.NAP_ADDRESS || "",
    phone: env.NAP_PHONE || "",
    website: env.NAP_WEBSITE || "",
  };
}

async function getSummary(env) {
  const data = await getCitationResults(env.BRIGHTLOCAL_API_KEY, env.BRIGHTLOCAL_CT_REPORT_ID);
  const results = data?.response?.results || {};
  const shape = (c) => ({
    source: c.source,
    url: c.url,
    domainAuthority: parseFloat(c["domain-authority"]) || null,
    siteType: c["site-type"] || "",
    status: c["citation-status"] || "",
  });
  const active = (results.active || []).map(shape)
    .sort((a, b) => (b.domainAuthority || 0) - (a.domainAuthority || 0));
  const pending = (results.pending || []).map(shape);
  const possible = (results.possible || []).map(shape);

  return {
    source: "live",
    nap: napFromEnv(env),
    counts: { active: active.length, pending: pending.length, opportunities: possible.length },
    topCitations: active.slice(0, 8),
    opportunities: possible.slice(0, 5),
  };
}

function getMockSummary(env) {
  const nap = napFromEnv(env);
  return {
    source: "mock",
    nap: nap.name ? nap : {
      name: "Ozarks Concrete Coatings LLC",
      address: "123 Commerce Dr, Rogersville, MO 65742",
      phone: "(417) 555-0148",
      website: "ozarksconcretecoatings.com",
    },
    counts: { active: 34, pending: 12, opportunities: 41 },
    topCitations: [
      { source: "google.com", domainAuthority: 98, siteType: "Search Engine", status: "active" },
      { source: "facebook.com", domainAuthority: 96, siteType: "Social", status: "active" },
      { source: "yelp.com", domainAuthority: 93, siteType: "Review Site", status: "active" },
      { source: "bbb.org", domainAuthority: 92, siteType: "Business Directory", status: "active" },
      { source: "angi.com", domainAuthority: 90, siteType: "Trade Directory", status: "active" },
      { source: "homeadvisor.com", domainAuthority: 89, siteType: "Trade Directory", status: "active" },
      { source: "houzz.com", domainAuthority: 88, siteType: "Trade Directory", status: "active" },
      { source: "nextdoor.com", domainAuthority: 87, siteType: "Local Network", status: "active" },
    ],
    opportunities: [
      { source: "thumbtack.com", domainAuthority: 85, siteType: "Trade Directory" },
      { source: "porch.com", domainAuthority: 78, siteType: "Trade Directory" },
      { source: "buildzoom.com", domainAuthority: 72, siteType: "Trade Directory" },
      { source: "417magazine.com", domainAuthority: 58, siteType: "Local Media" },
      { source: "springfieldchamber.com", domainAuthority: 52, siteType: "Chamber" },
    ],
    campaignInProgress: { name: "Citation Builder — 25 manual + Data Axle", submitted: 18, total: 25 },
  };
}

return { getSummary, getMockSummary, getCitationResults };

})();

const schedule = (() => {
// Install schedule + material ordering
// Groups upcoming jobs into This week / Next week / 2 weeks out, and converts
// square footage into product quantities so the owner knows what to order.
//
// JOB SOURCE, in priority order:
//   1. GoHighLevel calendar (if GHL_API_KEY + GHL_LOCATION_ID + GHL_CALENDAR_ID set)
//      Uses a GHL Private Integration token: Settings -> Private Integrations.
//      Appointment title format for auto-parsing: "Henderson - 780 sqft flake"
//   2. A jobs.json file next to the server:
//      [{ "name": "Henderson", "date": "2026-07-08", "sqft": 780, "system": "flake" }]
//      system: "flake" | "solid" | "metallic"
//   3. Demo data
//
// COVERAGE RATES (override in .env to match the products you buy):
//   BASE_COAT_SQFT_PER_KIT=450     e.g. 3-gal 100% solids epoxy kit
//   FLAKE_LBS_PER_SQFT=0.2         full broadcast
//   TOPCOAT_SQFT_PER_KIT=500       polyaspartic clear kit
// These defaults are typical but CONFIRM against your supplier's spec sheets.


function rates(env) {
  return {
    baseSqftPerKit: parseFloat(env.BASE_COAT_SQFT_PER_KIT) || 450,
    flakeLbsPerSqft: parseFloat(env.FLAKE_LBS_PER_SQFT) || 0.2,
    topSqftPerKit: parseFloat(env.TOPCOAT_SQFT_PER_KIT) || 500,
  };
}

function weekBuckets() {
  const now = new Date();
  const day = now.getDay(); // 0 Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const w = (n) => new Date(monday.getTime() + n * 7 * 86400000);
  return [
    { label: "This week", start: w(0), end: w(1) },
    { label: "Next week", start: w(1), end: w(2) },
    { label: "2 weeks out", start: w(2), end: w(3) },
  ];
}

function materials(jobs, r) {
  const sqft = jobs.reduce((s, j) => s + (j.sqft || 0), 0);
  const flakeSqft = jobs.filter((j) => j.system === "flake").reduce((s, j) => s + (j.sqft || 0), 0);
  return {
    jobs: jobs.length,
    sqft,
    baseKits: Math.ceil(sqft / r.baseSqftPerKit),
    flakeLbs: Math.ceil(flakeSqft * r.flakeLbsPerSqft),
    topKits: Math.ceil(sqft / r.topSqftPerKit),
  };
}

function bucketize(jobs, env) {
  const r = rates(env);
  return weekBuckets().map((b) => {
    const inWeek = jobs
      .filter((j) => j.date >= b.start && j.date < b.end)
      .sort((a, c) => a.date - c.date)
      .map((j) => ({
        name: j.name,
        date: j.date.toISOString().slice(0, 10),
        sqft: j.sqft,
        system: j.system,
      }));
    return { label: b.label, jobs: inWeek, materials: materials(inWeek.map((j, i) => jobs.find((o) => o.name === j.name && o.sqft === j.sqft) || j), r) };
  });
}

// --- Source 1: GoHighLevel calendar ---
async function fromGhl(env) {
  const buckets = weekBuckets();
  const params = new URLSearchParams({
    locationId: env.GHL_LOCATION_ID,
    calendarId: env.GHL_CALENDAR_ID,
    startTime: String(buckets[0].start.getTime()),
    endTime: String(buckets[2].end.getTime()),
  });
  const res = await fetch(`https://services.leadconnectorhq.com/calendars/events?${params}`, {
    headers: {
      Authorization: `Bearer ${env.GHL_API_KEY}`,
      Version: "2021-04-15",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`GHL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.events || []).map((e) => {
    // parse "Henderson - 780 sqft flake" style titles
    const title = e.title || "";
    const sqft = parseInt((title.match(/(\d[\d,]*)\s*sq/i) || [])[1]?.replace(/,/g, "") || "0", 10);
    const system = /metallic/i.test(title) ? "metallic" : /solid/i.test(title) ? "solid" : "flake";
    return {
      name: title.split(/[-–—]/)[0].trim() || title || "Job",
      date: new Date(e.startTime),
      sqft,
      system,
    };
  }).filter((j) => j.sqft > 0 || j.name);
}

// --- Source 2: jobs.json ---
function fromFile() {
  const p = path.join(__dirname, "jobs.json");
  const p2 = path.join(__dirname, "jobs.json"); // single-file layout
  const file = fs.existsSync(p) ? p : fs.existsSync(p2) ? p2 : null;
  if (!file) return null;
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw.map((j) => ({ name: j.name, date: new Date(j.date + "T12:00:00"), sqft: j.sqft || 0, system: j.system || "flake" }));
}

async function getSummary(env) {
  let jobs = null;
  let source = "live";
  if (env.GHL_API_KEY && env.GHL_LOCATION_ID && env.GHL_CALENDAR_ID) {
    jobs = await fromGhl(env);
    source = "live-ghl";
  } else {
    jobs = fromFile();
    source = "live-file";
  }
  if (!jobs) throw new Error("no schedule source configured");
  return { source, weeks: bucketize(jobs, env), rates: rates(env) };
}

function getMockSummary(env) {
  const d = (offset) => { const x = new Date(); x.setDate(x.getDate() + offset); x.setHours(12,0,0,0); return x; };
  const jobs = [
    { name: "Henderson", date: d(0), sqft: 780, system: "flake" },
    { name: "Ramirez", date: d(1), sqft: 460, system: "solid" },
    { name: "Doyle", date: d(4), sqft: 1120, system: "metallic" },
    { name: "Barker", date: d(7), sqft: 520, system: "flake" },
    { name: "Simmons", date: d(9), sqft: 640, system: "flake" },
    { name: "Prater Auto (shop floor)", date: d(11), sqft: 2400, system: "flake" },
    { name: "Nguyen", date: d(15), sqft: 440, system: "solid" },
    { name: "Callahan", date: d(17), sqft: 880, system: "flake" },
  ];
  return { source: "mock", weeks: bucketize(jobs, env), rates: rates(env) };
}

return { getSummary, getMockSummary };

})();

const website = (() => {
// Website results — Google Analytics 4 (Data API)
// Reuses the same Google OAuth setup as the Business Profile panel:
// same GBP_CLIENT_ID / GBP_CLIENT_SECRET / GBP_REFRESH_TOKEN work here IF the
// consent flow included the scope https://www.googleapis.com/auth/analytics.readonly
// (run consent once with both scopes and one refresh token covers both panels).
//
// Env: GA4_PROPERTY_ID (numbers only, from GA4 Admin -> Property Settings)
//      plus the GBP_* OAuth vars above.

async function refreshAccessToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GBP_CLIENT_ID,
      client_secret: env.GBP_CLIENT_SECRET,
      refresh_token: env.GBP_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Google OAuth: ${data.error_description || data.error}`);
  return data.access_token;
}

async function runReport(accessToken, propertyId, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(`GA4: ${data.error.message}`);
  return data;
}

async function getSummary(env) {
  const token = await refreshAccessToken(env);
  const pid = env.GA4_PROPERTY_ID;
  const range = [{ startDate: "7daysAgo", endDate: "today" }];
  const prevRange = [{ startDate: "14daysAgo", endDate: "8daysAgo" }];

  const [totals, prev, sources] = await Promise.all([
    runReport(token, pid, { dateRanges: range, metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "conversions" }] }),
    runReport(token, pid, { dateRanges: prevRange, metrics: [{ name: "sessions" }] }),
    runReport(token, pid, {
      dateRanges: range,
      dimensions: [{ name: "sessionDefaultChannelGroup" }],
      metrics: [{ name: "sessions" }],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: 5,
    }),
  ]);

  const row = totals.rows?.[0]?.metricValues || [];
  const sessions = parseInt(row[0]?.value || 0, 10);
  const prevSessions = parseInt(prev.rows?.[0]?.metricValues?.[0]?.value || 0, 10);

  return {
    source: "live",
    last7Days: {
      sessions,
      users: parseInt(row[1]?.value || 0, 10),
      conversions: parseInt(row[2]?.value || 0, 10),
      sessionsChangePct: prevSessions ? Math.round(((sessions - prevSessions) / prevSessions) * 100) : null,
    },
    channels: (sources.rows || []).map((r) => ({
      channel: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value, 10),
    })),
  };
}

function getMockSummary() {
  return {
    source: "mock",
    last7Days: { sessions: 312, users: 268, conversions: 11, sessionsChangePct: 14 },
    channels: [
      { channel: "Organic Search", sessions: 141 },
      { channel: "Paid Social", sessions: 78 },
      { channel: "Direct", sessions: 46 },
      { channel: "Organic Social", sessions: 29 },
      { channel: "Referral", sessions: 18 },
    ],
  };
}

return { getSummary, getMockSummary };

})();


// ---------------- dashboard page ----------------

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EpoxyGarageFloors.ai — Growth Dashboard</title>
<style>
  :root {
    --bg: #050507;
    --tile: #101014;
    --tile-edge: #26262e;
    --text: #e8ecf2;
    --muted: #8b96a8;
    --green: #4ade80;
    --amber: #fbbf24;
    --red: #f87171;
    --blue: #60a5fa;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    padding: 20px;
    min-height: 100vh;
  }
  header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 18px; flex-wrap: wrap; gap: 10px;
  }
  header h1 { font-size: 20px; font-weight: 600; letter-spacing: 0.3px; }
  .status-pills { display: flex; gap: 8px; font-size: 12px; }
  .pill {
    padding: 4px 12px; border-radius: 999px; border: 1px solid var(--tile-edge);
    background: var(--tile); color: var(--muted);
  }
  .pill.live { color: var(--green); border-color: #1f4d33; }
  .pill.mock { color: var(--amber); border-color: #4d3d1f; }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } #ct-cols, #sched-weeks { grid-template-columns: 1fr !important; } }

  .panel {
    background: var(--tile);
    border: 1px solid var(--tile-edge);
    border-radius: 12px;
    padding: 16px 18px;
  }
  .panel h2 {
    font-size: 15px; font-weight: 600; margin-bottom: 12px;
    display: flex; align-items: center; gap: 8px; color: var(--text);
  }
  .panel h2 .dot { width: 8px; height: 8px; border-radius: 50%; }

  .row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 9px 0; border-bottom: 1px solid var(--tile-edge); font-size: 14px;
    gap: 12px;
  }
  .row:last-child { border-bottom: none; }
  .row .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row .sub { font-size: 12px; color: var(--muted); display: block; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .rank { font-weight: 700; font-size: 15px; min-width: 34px; text-align: right; }
  .delta { font-size: 12px; min-width: 36px; text-align: right; }
  .up { color: var(--green); }
  .down { color: var(--red); }
  .flat { color: var(--muted); }

  .badge {
    font-size: 12px; padding: 3px 10px; border-radius: 999px; white-space: nowrap;
  }
  .badge.ok { background: #12301f; color: var(--green); }
  .badge.warn { background: #33270f; color: var(--amber); }
  .badge.alert { background: #331414; color: var(--red); }

  .stats {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;
  }
  .stat {
    background: #10151d; border: 1px solid var(--tile-edge); border-radius: 10px;
    padding: 10px 12px;
  }
  .stat .n { font-size: 22px; font-weight: 700; }
  .stat .l { font-size: 11px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }

  .alert-banner {
    background: #2a1215; border: 1px solid #5c2626; color: #f5b5b5;
    border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 600;
    margin-bottom: 14px; display: none;
  }
  .alert-banner.show { display: block; }

  .review-card {
    background: #10151d; border: 1px solid var(--tile-edge); border-radius: 10px;
    padding: 10px 12px; margin-top: 10px; font-size: 13px;
  }
  .review-card .who { font-weight: 600; }
  .review-card .stars { color: var(--amber); letter-spacing: 2px; }
  .review-card .txt { color: var(--muted); margin-top: 4px; font-size: 12px; }

  footer { margin-top: 16px; font-size: 12px; color: var(--muted); text-align: center; }

  .photo-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px;
  }
  .photo-tile {
    position: relative; border-radius: 8px; overflow: hidden; aspect-ratio: 4 / 3;
    background: #10151d; border: 1px solid var(--tile-edge);
  }
  .photo-tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .photo-tile .cap {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: linear-gradient(transparent, rgba(0,0,0,0.85));
    color: #fff; font-size: 11px; padding: 14px 8px 6px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .photo-tile .cap .meta { color: #b8c2d0; font-size: 10px; display: block; }
  .section-label {
    margin-top: 14px; font-size: 12px; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.5px;
  }
</style>
</head>
<body>
<header>
  <div style="display:flex;align-items:center;gap:14px">
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASsAAADwCAYAAABYKkLsAACRn0lEQVR42u1dd5hlRfE99d7MRpa45JyD5AwCSgbJoiRRkgqKKKafoqioiBEVBREUFVQM5JxzBsk5x2WBhWVh2TDzQv3+uKeY2t7ue++bebM7u7z+vvlm5oV7+3aorjpVdQrotE7rtLm6qWol8lqXqq6iqvup6lmqumvqs0OlSWcqO63TPhACa1EAKwFYE8C6ANYBsAqAhQC8A2AdEXlRVSsi0uyMWKd1WqcNVOiIqlapGVUKPlvl711V9XVVremMzf4/wX++0zqt0zqtP4KpQuFUVVWJfabI/FPV851wsp9e/n5DVVe0e3VGvdM6rdPaJcDGquoWqnqUqq7mhVJCUK2kqhNVta6qDVVt8se0qpPmFK2qqzP9ndZpQ1OrAjAcwJIAPgRgfQCb8O8lAFQBPKiq24vIhAjWVAHQBLA7gAUA1LjfBYDy/SkAzsjTzjqt0zrtg2nOVVr4/EhVvUBVJ+vMra6q0/n31ao6iteX4BrdqnqHMwFDrerclGbWaZ3WaR8s4VTtjyBwJtweqjqNAqbX4U1m0vVS6JxhppwB8Px/S/c9+06Df9dU9aNzignYaZ3Wae0VUF0J/GiUqq6rqtuVFQxOYO1G7aruhE6TQqrhtKRv8/NdTlidxvd6nZDqdRpZtaNVdVqnfbAF10KqupmqHqmqf1PVhyggft+KJqOqXfy9nxNMHiRXp2HVVXVfE3SquoiqvsLPeY2qh6/t5u/RaZ3WaXOHOVcp+Iyo6vyq+l1VvUxVX3CYkrVJqrqi15paFFhHRbAnE0Bm4k1W1R34+c9FPt/L33eo6jDre2emO63T5lzhNJN5lBIwzuQ6PAKC96jqVP7/u1a0qqBP3fz7e4FZ13CaVp3vvaqqa6jqxe6zzeAzn+1PXzqt0zpt9gupamzjquoIVV1dVVdOCSwn4K52mFAj0H4mqOoKrWpVwT1MKP6OAmd6RGA1+N44VX03Isyaqvq4qs7X0ao6rdPmbKE1v6puRKzpn8Sa3mWU9+ahNuJA8I0pPMLAS9Nk/tBfQRUKLArGv/C60wIzsOEEljpcq+mA9S91sKpO67Q51+w7UlUvVNWnaLppZMM/q6rLBkLKtJ1fJcyzBgXKhl47GkB/K7zOMFU9L6FhNZwW5bW7pqo+3dGqOq3T5lzzTxwYrUHeXD0IwLzFbXYTVPNSyGlgctl3Lmhn3p0TWPOo6lUBiB6ahc0gvOFHHayq0zpt1mhA/kfatfn5+2AHiscAbDOjzmcsUzf79XGnzWgQz9Sjqlu2W0A4Qbmgqt7G+/YEAsr3o0ncbPlOwnKndVr7hVOSaSCG4wzwfhYecHTEg9YMXP+qqr923/1HjtftooFiVSUE1hKqel+g2XmBZWbtnzpaVad1Wvs2YCUG/NL0WklV1yf+s7qqLhgKnP5qW4FZd1xEU4kB1UeyX68HmpX3vH1sMAWE6/MyqvqwE1gaEZyntQM367RO62hSM3rZxqjqthQcl6jqMwx4NG1hOgMvL1HVL6vqcqFZN0CBdXKOhmX5eRNV9QqXBhMKh7tUdfhgg9lOK9yGArYW0bBUVW9tp/ncaZ32gdSm3N9LquqPGAvUjLANhJqOtQmq+nNVnacNAssA7D8FGpaPFu91oHU9gW0dPCvMLtffJZhe00gIz3GkNkZHYHVap/XfjBlGvGhcIJh6g+TdkDWgJwg1uE1VlxnIhgyi2P8dSQSuOyFQi2hdqqqPqeroWREiYNenFveA8w42nOAyAbvxYGFondZpc73ZR0rdm5zAmR6JE2rmuObtx4TW/aq68EC8Xk5bGaWql+YEYMZMxKaqHjUrtKpQOw3oizUSRvGpWdmvdreOhO202bLuRKShqqsDuArAVgB6ATSQsVn6dal8vc7fscorAqAbQA+yyi2/ExHtb+fIuCkiMhXAAQBuBjACfQybgnhlqAr7+JDr16xodp/Hct4DgNU6S6/TOq01rcowlkcDIDuMwq5rvNUT2pZpEU1V3WegWoTTWBYlYK4JjSrsx6OquhK/2z0LzelPRcxAb55e2DEDO22uNNPcT6WoykqLJlaF6S3qhIvnZ/I41PNMEj6L9CvjnYnTiJhlJuDuJTWwDLC/JgjWVNUpQfpKTFgZwP6oS14edJCdvy1HsRbkKZpH8GFVHTEQTK/TOm2oCKcuLc8T3jWAjb9/AFx7YWXC5mlVPUhVxwbXWEZVTwpKSzUCD6Ft1h3aoF1Znw91wii8X8gvZcL2EVVdvr/j1cr88fdidFI0E0R9bw2E/WF2t07m9QdUODnspUF8p+HeXxBZFZW1AKwMYFFiReMB3AngahGZ3Er1Xt6zqaojAfyfw3gMlxL2oQrgfgB7iciL7rtCHOklAF9R1XcBHEucStx1wL4OA/AxAFcPcJyaqjocwFEOk0KAqTVdHyp8hjrH8GJV/ZiIvKyqVRFpDOLUvsk5WiLA+6yizYKc0+fQqcbeaXOAWRcrlLkI+cG/zcTbZyPVe317TFX3bkVjcBrKxwLPmQ9FaPD0X4ufHRb21z3HcDJemicwLIigqnqPI66TfoybBVzu6rSqZqTfvQGOFka736mqiw2mSehMwX8HXOu+vaWqn5wVpmmndVq7FvZiqrqDqn5fVS9X1ZcjC9uD3D6uydP1frasSeGElQ+2rEeCKY37qbuEEPlsANCHbbKqrtJfs8eFMFwcYTeoOzNUIzFXTfecJrAWHywTLJIu1CC+dxUDbXdV1aU7WFWnDWVzzzQnE05XOlxDA5ynJ6IlxLi+DbeZoqrrF21A149qELgYgsANVd25KIfNCZHlGL3eTMQ8aX/LTTlNZRNSE4cpLCaEfqGqvw8ElgbPZAL+DhdFXm3zXFt/N1TVY5l+s0RnF3TanCao7o9oHTVuot4Iw2UjIkjqAbBswuDsFoTVwqr6kjv5QwB4inP5l7lehTlvGjEDp/H1AwYorM6IhEs0ncm6NIXw5QXcUjUXZT9YAktahQD6qW16T7EEUf/VwdLeOvEWcw7m1N8FMA3AGAKsvciA3zr6AimrDoC1oEsDiQ1Q1gCQVb6vAHZQ1WVFpJkjYOy7iwKYD30gdRhcORnAe+4e8YuJqAP3X+TL1k8N+rtgfzYkn2c1AJ/gtf2z2f+XAXiFr30awN3InFa1yJgZ6L45gHNVdQEGxrZNYHFcrH5hlc+hItLgjw5g/dn1mu56DV5fg9d1MDCxjjdw6GpF72/k/niQ3IaerKpPAFiR16skBIFfXG8CmABgFIBlnSAIhVETwEIA1qPQqCAeYW5tGAVk0609DYRg2QPUBMErri9dkUN4IEGZXwAwL4W8BD+9AP5mG1NE3mIg6iXIPG49vHcosHoAbAHg36q6r4hMUlUZSMR9OO8Uim3Dwrj+Gvx/SWRZAush8xQvyPF+B8CTAG4EcCsFcWlvcUdYzVkC6v00DhGp+01Md/8wEXmnH5pzE8CDAHZxp30osHoB3IEsreR/AB6hwBoO4JMAfsm/vbZgm6IKYHUAF+ZpQ06gNAPBCKcNzUMtEE7bK2o196yViACc1o95UFVdGsD+gRZpWlUXgNsB3MSDpcZN/SK9bVdSyNciQnkYf+8A4HIWG53YToHVTgyMQke4fg4EsCX6QiNirQHgDlU9QUSuaGe4RkdYzX7hBKrOTfdeF4DlAawPYGNk8UJXAvhqi6eVLf6nE2a/aTIvAdhNRN4L3p8M4FSaQ192wsmbW2belWkTAUwBMBp9sUnqTNBRAFZR1adQHAdk917CaS3qBJ096/OtKyfSJMXLwsEzw2mOZ3Ijd/Fwsb+fVNX9qWGNjVz/dQDPArgPWTxZ08y3IbQ23xcwqroLgG8A+GggkOAOL3XjItQcL1PVo0TklHZrWJ02C4RTQazTCqq6L4nf7iS5m2/XOROx9KLj7w8nmAIaDihemX3rdt42+3vPAFRvBNn8JzkhmzJrjcbk8QQgbt61E33f8zA89u9/kZw9A8NbCl1w1x2rqi9GUmsMPH9WVeePzYcb861V9TUyiV5KD91OjMCvDOE1ao6FtR2Lgwb0OKncyHpQzr6pqrvnrY1OGyK4U0o48b1lGPvyE1W9kQJDE1V9G9wgC7QisII0jNcDr5YXElEKXku/UdXdI9Qj3iV/QtGCdJvgEhd/1IgEcj7CnL4kq6WLs9o6SH/xvONNCv2usmPmPvvNCFNow3kYf54nUJ3AWl5Vl0p9ZigFZgbz/lXWS1RX+KJRIKgaEcFu+YjzdMp/DU0hVU1U7l1GVfdmTM6tTniEwqkWKVppG2W9slpCIKwq3LjqTr16EIz5tUBAdbnN+8uANTOM0D6ghLCyDXxUwA8V01yO4GeHOS3P3OMWkT6fY0IIx8u0tO8UaWkRrWpeRujXGF/VE8RPNVR13RLaXyVxcA05amE3zwuq6n+C8BaNhK7EBFWqwEaTuFwnan4ICy0LxDyOrAETcjSnnkQcj6VymFA4sNVJdxrNX52Q8JV7bUGeEdtIqrofT9laJOixWTY51vVjJVV9u4RZunXOtRYl/3kY1+Sv8UZYlLSkyXxAQOZnbSqF2HFlBc6cwHnuBNWqZKoICRA1J+6ulhBUGozhL9ohrDp2ZBvNPgKl+yCLuVkHwNIBIBx6riyWyYPM/n2/ycYDmB6Ay6UAY/5+0AHREgDsALA8geXhqroGgI0A7IrMC2TxVqEnsBvAtSLyHJ+/mYNaNwm0PqOqNwDYy4HXvq8NAAsAOE9VjwdwKZ99GDIP29YAPg9gleD7FlJg/TqN3rlCb5RLWB4D4Ae8zlsAnkJGpGdg+DMiMqUFpL45q9aem0dtIbm8S0Tq1NjPB7Ac11g3+hLdw3gxG3Mb95pbU359+D6sFjgnOm12g5P8fV6QXxdW+A2B4JrTcjzlyGuqeg1P8h1UdeGBYBGqumMBedwb5Iy6z2EzYaR5mBM3TVU3bUF7sVN85wDX8OMRJuFOUtUnyGvltZ2enKj6+1ghp7QG5EDl36nqLnlY01DDRAe4LtZloYlY9H0zol2Zdv4g50QT69rP440dCTHEsCr+/l5QCbcZJASnGDBfpWnzI3qNlmyzEF1NVd9JqOxhn5o52Fmv++yX+mOWcqP9J0j0bUQ8hPWIEK8FTJgh6d0brWJ7JTDIIYE1ed6x4PV5eBidSkxQCkxyW6urq+pzOeyr9UhJr3OYLzmK6VMnB4dHPUKEeENHQgxNYbVPIgvfT6QJp+spnLaNJZ1GGDv7Q3NiIPsoVX0oUT6qHgH3w6TgHqe5THeCqqvFcAoTVku7k7mnAKhtRk55L6SmunJTWwxEAxrs/Lb+Hjjh81Bz/KiqnujCQZQ1Fof5uU+M/6L0vIZsrc2I5m/z/s3IITiWa7mZ0LBUVc9N9ecDjx1Fki2rg31CusnbIFIJpRmURjoiRzh1uX62xN5Zom8XRDyCoRANwf1mYBJe4QRCZYD92cSV35qWYC2I1Qr0AtTajcTa5hivUxl3fuBVXEBVd1PVUwj2+zGxNffH1BgEh9+FiYMiNMstPOUbMU2TsW53RiAGb5b/ZE6alyFnv7f7BHUazII83UKTyU/mVk4rifKcR66/mONDkhb7ZljRTwJvTyPHm+O9YA+o6m9Vdctg/NrBbb6Gqt4eCT6sBwI+9Ixae1FVv+K0ia45YZ0GQqgSC3lxQn09emtfiHCO+XHJLVnvxvzrAa10qsSZCZuT3XqtRDT2RyKl671pvm87hFXXHC6kKpnTZYZEy24ASwJYht6NsfRsTAbwMjJK1xdFZJpfQAPNX7KUCRGZqKrPI0sctux8n1fWDWBTVb0VjiY39OAwH3ANAB9Glo/1YQAXADgScXrd3KHi7/v5u4p4wrB5JV9EliN4M7KcwUdFpMctUmnDeDU47o+p6nbIUjo+z7kLW9jXaQDuBXAegH+JyOu2Hpj6MuSEFFh+DDPSR1cReO/4mpUCa5JH/j8A5udHauhLJxLOpeVbPgngFn4uXE9W/mxNZHTQ9h3z4nkPnq2vLgCPAvgu91rT9dW+sxgyr7cGP5ZONZFrya/DD46wsgm1gWNRgY8A2BZZLt0KnNzYyf8egOdU9WYAFwG43jLEuXAGMqA2yc8A2C6YVN/WZt97A+1nVQCb8Wdj/u9ZA9azRdfqkPH3k8hy80YF/bIQhh5kyapXi8jk2KnMe7eLIcAy86cC+JGqnooswXdzACshy+ivUjhNpBB9iAL0EZurcD0MtbVqQkpVRyMLvdgSGWPBYshCJsYhC4+4QESectrWcgD+wrXci75wllTdwig3vtOCugH8mterBftfg0MVXA9Hicg7kQPdkuS3QMZM0eMEp62tbmSc/c994PIDfe4S/9+YrubnEuRyPQ4YrgfBkNZusiooAwUBnbl1ZCRdw6vVD1B9XppR7b8ii+Q7Ee9XjwNAx7GYQ6s5grZY56eJqhGyPTMp1glM1EH3gqWYQRnBPjIn57A6VEFbP270mn2LqSd57W1W7rE5/kOQOZBKbTGoYc/YWAYVejTBBusdLYZTnZpjUhpmdU1B+tS+Q908H9TFTO/ZRQF+4Rkv6wk6Xg0wEG9j/zLPi9IiDvORBLhu/09jAu6ECAbRm0jyNa/XOv0Bt106yVWRQpg+ReWIIlrhWYTpSBm8Zwhr/iD4fHhwmPZGxj50ZtzJWLRXEnFusTio8Rbu4sfOzftCzC9tRq4R491/XVWXjYVBBLF7jUgku/39sKqO/sDkBQZCakNmgjeDzR1LA4nFOKW4uu0UuHAgg+vAx6Vc7l8jIjSbkXzAWiKlwafjKOlH+kPTawvspITWZ8LqlKHiuXEbTeagQ9Wnr1wbEVIxDT/G7T49UYSikSjqelHsEHPz/s1I4KfmcNf/PKYRubzRYbQGNFLZx67xlXaupcoQnviKAwXHcvBuRpam4dkQuzBjykpog0uOjQ8HMvYA2IMYQRVAf8wfu/9ryDiikADCQwrhinuGOmakFh7GZ3wVwHXoY8bsL270uMPS4P62BbUmHQWN2S0kHGWuzgmCiiB6XVV3RcaYuS2xIWMxrSKfp0vQR4vc5fCp8DN+Pdv6uinc0y6NaBEAX3QAuiJNblglPniKfT+UGXRifB3ApuxrSPlcpSPr74lrzLXa1D5Mt9Agkzsv+zvPHZs6pfyp9oP+nghOu/p7wpYPT8VUus0LNHW/SyqURdsxpqq6VSIBteECKxcdKH73QWrebKbZ1xPBmkLepzwMqhFoX0UcUpNVde1Qs3J9+mqgTReFKpya0NJMa1xfVd8L4BWvQSrJC+fe2Kpg0hdT1TMDwLyRU7o7NP1aFVY+GHKaqm7YT2zI+v+tiLkV5tv5Z3uewuk7jExeKGUW9VdT5e8lA26rMKN+uqpu3J9nnwvWXqU/ToWIqVVPmHCxddrrqgw1W/ypu1zIYYEzxUzo4ap6dyTItpH46VXVTSM4sQHq8/F6sSwNE1TXDlU6nLZpU26g93BeK58jltKaNGcymiXTOMKSSf8ZoLDaJWCtbEYigy9Q1aOp7YwtAJwrAyl35N3XrFTsgwLrAZ9UIT/VXLTuKq2mDCXm+2tuA9dytPswKVgj/FEaSSuKXcuEw+8jFon1a7sSLJ/+WjeE6ytYh+clAovNSTDJ8X1V5kpB5TbS8YFK2UwUjmwkNK2YxtUoyDXTSJ7cJFVdtdVBdxrMqonEYevPu1YjL9g4qXps0sZx/ntEWPU4toXfzs3Cym2+cEOuQ/rhs4zlIm/c3XjuG8mNqyfWqBdSj6vq31T1N46eOZVQHPPg2d97RoSVrcM/RaLVY/ulNwDFuyLWzokRjSqs0/iNVtbOHOVEccyPyzi3eozYS0syFKZKn9dzBFwzQdd7VKub1mkwY1T1yQQti032x7lphgXCqSsR22Jso6cyBqe/HsFvB7znfhxeV9Xvz414QyKlZQ2mn9xAHMba5nkHlRvLLXiwhfhNIxJqYJrTS6p6mKrO5643H/Mbm5F8vRRDp6rqy6Fgdb/N5G/k7AH/M0lVVw7MPhNa30mYft6TfE6ZwzUvvWjIxs65Cd/SmX29OeZeEf5Ui+SOaQL3qgdCSiNA43/7s2ndYrkkMcF2/eM4OcMTVMhjGPh6tKpeFsRlvdMqEO4W3r5BIOIdPN0/Rs8R5iS8wZ/OJfmrVlDVz7OK8pRInNH9qjpPamyd1rKoqj4VrK1mQQn5m1R1eT8nqjqcfx8WMbFS6z5ZEdvtq4Mjiet52t71ARW2XefInGe0fjxBdlzJ4c6PBqzaYR0bY9+6ZtfiAlClm/cwAL8HMBKZ277LuWgRca/GXrd6dJaaMhFZ+alnAEwCsDiADZHlCzYi1wjduDZQG6jqfEw3aKWum1XffQgZ22bqGdYO8hrnQcaquCmylIz12Ofh7rtWU3AE33sd5XMFzYV8B4CfIcsVvB/As2EqxFBPjXClzJrhvFAo+3Qsq7B8ALJ0og2Rldny7nYb2+EALhGR92I5oxaiwN+nIkubCUuUhXNt170cwP4i8i772OAesOtOd+snL+TG5/FdG6wpv653dO/Fits2g7V/E3Ncuzl+DVX9OoCfo6/Qq7++5Q++AeAAEXkjlWcbpB2tiKy83JbIUuOGA5imqk8iKzl3gYhMdWOks/MUtJPp2OBEaxZgTXknjJKv6WhWFQkl9cIuILKeE+7QDLLGWyZycyfSfon7mQr/FKOAj1bVf5H2ozdimvUGp6Od0p9uF7Y0FHmcckyI0HyYT1WXoKbTFTP7VPXngQY1PcF7P0VV10/NuZvbLwZYTzNi+nmP3d2ufFc1ofEemWNqxfCwyazpiAgbwgIJYr1mgtFzOi0cr6H9PFLIpO485g2aztvkWSBuzBZletzbBWlHDzK5ffZBEUG+1G8itLllBFQjsMGVaQlfNdU9zzamUPCqb8qDWAuwi/4UaVjfxdo0IoBpLE7FpwPF4qHqjrvoN/0RVkO92koZE4J1Do9mTb6nSQD3CivefM+lnlQYp6YOJqhHPMl1Z6ZVY+aMe3050k7XC6CJuqOMXi21jtxm/mXO4RaLWr/dfVeCa20dpPbkkes1GTpjEMCCwT5pRDyHNQqqPfLWoBPEO7h4SQ2yNnrd3PQ4fq79ZovAcht4mKu00psjLPKElQeG/+QpgFMb0NzTxICmJkB2L0wMO9u2H8LKn27PR1IqwhPYOxTqCeK+WjDBFl8zd8ayRDYz/96I3syi0/kV5yW7OFJaqpGo8vPNEkLlb5EqMCkPW7NIA3br5aJE3mYsLk9V9deR8THhcExOYGrMMrmG39uE6yq2P/3n3/MFTBPYntdCazmspKEjosfl0G47SwWWE1QjVfXciPrcyo8Jqtcso9ufeiUEyPxM6NQEO2IYZbzdAISV0MtU1vQMT7zeRDzOmzxVj5kTTLcBauJV59k6LShm0RuYJyEf+xRqK5OC+U4lBE9W1dVjJqDrx0cDJo9Urp9tzvPy1meCdrpW4LWzNbFHTsjCRRFQXBP8+8oD4FBX3HR65NC0cZ1gTCUlNKrD3dj35JikjQRrw+M082VWCqrRbgD7E63rF+FN2lcWvBTtbxBS8FRBVLxnPdy8P5LdPffpQdpNbNHUnQpciwin8Qzr+AlpbZeNPdtcGAtlY7gnGUE1yPLXRNpSMzLWmrM5bGNcm+cBZBzgDYlYo5iFMIFgch6eExb0aES0tVTIwhKJkIWFqNE3EyZvbBzeS3jNbbynOzxp3ZIa1T6JA7peAv7xAv/QQfcGusEbCeBfAHZDX5KmIj+p03s4muhj2TwTwBEiMt3qnrXYre7Ec2vitVrO+2X6/pj7vk8gbbprWpKrtbfoSbwbwK0A7heRcSkPy5yQ6NsPQa/04H0fWS2/Cj1S3W6svDdXAg+XH+dKwkun7jtVZEys3pv7vpZAr93HkJE8NtwaDq+nzjP9OxF5toCJ9n3PMDISu4bzRodeanXvPwRgfEBqZ59fDcBSwbWsb2HSv63J0e51n3Bt/R6OrIbjISLyJp+pnlqT5MM/2d2nEuz5cP9LYiwVwL6q+teuQRZU5jL9GwVVLzIWgaLNFT6UsQ7+DsDRdK9WWxRUNgBLAVjETYp36fv7VxkWMG6AQ/Gke54G+opweuH0Bj93D7Ls+ftF5OXIBvYLTQdKLezm6P2XZrfgc2EGo5hQ+5lg3EIhlRfmAhSzHBhLwJsMLZhhPTjmgm4AXws2ki8CKsHaeQ7AH03wljjUNok8QzOyJ+z9u2wfuM/ZtVajMK1Hnl8LBIVvPpTo1wCOEZHenPAEyX7p/FQqFkbGZtIdEeyxvS6J510fwMpdgyioLI7qFAD7UEPpxsyxTRKRpn6yjF7jeyJyvJkH/dio5t1ZladI3Z2OlUgMSxXAEzy9pB9xR/YcLyCjUh7j3puCjKrldmpOd4vIiznAsgmnehvnpxJSFLuxbc4mQWWn8hgAZyOLUatjRgodjSzsZmKxI7JJYtpKBRm99fORuTaaop2pVdUDTS0mvKoAThWRCUX8/twjgozKGSWErlHI3Jjz2dVyFIBQowqVAqMpqvJerwD4moic4w6TRsGePxFZLFsPZqTlloQykpqzKg+TsQA+PFialfH6nADgCMzM91zGrFInqL4jIj91QWL92UzKk2gHt8DzpD2o4SjvW++nsHoJGen+AsiKHNyKjNT/8UjAYdX1tTlQzSklqKg9NXi/5Wl+vCsiz/BknOUCy53KowD8G1nQYG9Em/KtETGh4TSKMliefeaymAlIraoC4Cvo4x1PrWE75F4E8NciLic3zssiCy7VEppjBcCz6Cv+0YwI7RUi39OE+RVbs8O4Z88C8AMRebkEz70Jqn0BHMoxHBaY2giUA+tLMzInlYi22PZFZ7l+RyXA9DywrxkEQqqqHlPG21cSO1ucYHUzAq7HPCSfbIfblHQ3o2OaxKyk6XVgboXpJnep6kSCp5MIHm8S84bNCjCdv/8erJtUGfteF49zNj1Z+zGFJs+JE1t3rycogQ0o3ixw4zcSuX/Wp+PLrJtIYdzeBEtDGLJwZjhHQZrMbYkYqVQKW7gnzzfHUsnnsHW1CmPKmhGO+Lw0uLySYO97K9uuxjvvTW9OvEieZ8J7AX6X53VooV/mRj0iEkbQTMSzTDCv20A2brj4Z1cgplvMi7icxTCR20JCVm/1uZ3AafnZ3Lr5Rcn4JVvA96rqh4NrjSCDQTMScKsJWpR/x563BBV0MxBUxqZRavzc9X+XuL4mvGNfCIVI4O1+oiByPQzRMW/1JRaN7tZrpeS8j6CXPnwOH3pzK4O3t2UIyDH0ampB8Leq6oWDIahWTUjXorSZkK3z7HZtbEdCdm9iYJqR0/GKUNgM8P6zLbzACZGFHG/29ICPu659Zdj/GSsUkHiuaiR9pPTzRiqvTNd0GXuvXVzs01csIZz//zTYrJoTCtNkYrckNv8CjJBvBrxqqUDli0oKKnHC9d6EcNGI9jMtlgIWkCuOy4k+j7F/3GiEi14AlVzXpgic6jTdesDq8TA56mKBtiuq6qMRXvgwZOLidqvxo50KWgsmViMxMKGWZd+5md4gaYOgss3w8RwyvGaQMxY9vebUFqFanp7gS6q71IsFUsI6kT2/ECsHr9KPfq1OczSM3q8nUqCuMbM6kgsoqvrlgkhwr0G/pKqL5ZiAeydoW1LkdQeG/Sp49k0jmmQjJ0jyIYYChf01M3pZjmWzZDqQ57DqLrveA0H1rQQ/mhVhWch/J3K47BNozP4Atf14YbtwCQMKT6JXoxd9BQ+R8MrEwEnzPhzMwpeVgbjS3ek1HMA3MXP8RsxD1I2sOMMFJR0BQ11QVRkKsCOAA9DHABACuL6AZlfgxZlBSLGIQ4OpU7sSQ/kfstCL+8kmuXARXQg9tN1cNws48DXm7DAnzX3IMvynRMJXzHmQCkmRwHkDAPeIyGsEu2Oeqb1y3P9+LXdz7V7twP8ywP6OnA9NrLdwfd4mItNsHiLP/nH0FTEt8izaGCyufdWhGyX3lcWeHYKMwcO86xYOMgzA6QD2FpG3TLCJSJ2xgQ0ANQrtu5Cxo/giqX5NAhmTStvMv09HSv00SoCbXiWdzk3VFo3G9e3AnNyw2Ol42lykVYV5Z6noaA9kT2UStuck9ybSSFU9yNEjayQh+I955pDTLI6I5LCFp2uMMrcrZ75/lijWETMnPxvR0CoO3xtfwFnutZ6zymJ9Tsu4I5IKlFfM4eCYRsnfGzBlqBGwdBQ5sa5pgQus4sbn0EiydK+DcSp5JmWAo74UMbW9tvWjdpkXy9JObrTAg66RQfu/Mip0i6bp/KReCXmvmxGzw+zkTecGYeUWwwpM/G20wMX94wguMq+qfs4luqrz9NQDNoznHaYkkQUvrK84Lsj+jyV9Tw+SjLsK1uN/E2Rx4fp716XDVBLQQYh9NSKmqo3ZQVqiQKzr54YRoj3NqW4zVVXXinh2K8yfuzdHYchj2p2iqmvm9d2bffz/226+ewLc7jIeaLnYl3uGFWm6NnKE1cEDFQZme15UIjk5PDlCd+w17eRUcgvuh4ns8xBot35cHuNMmhMEU4QOx8bggJws+hTH0evMwBfSsXzL5VSqE0qxzHnl95dOeNkM6/h9RAOKhZE0uRFHlUgIHkamT82hxbYNcHlCmIZeunrBeDV4GKzSohfwxw5DLBIqM1WxCXCjM0p4LGPKg43FPwONb4YCJQE2+ZegmIs/UG4zuuYy48D77eEOylSC+UYD2Rw2SF8uMeApiW4dmxiSiLVJUK3H07Negn/aPrPdnKJVpbxxkTn6fiSZuqHpyrx2Mr9F0ri3gpiY3oRg8a7m11V1qZjXiv1ePeAuz6sEUxjz5k7ppR39c6ryUS3g2I95AYcHRRyKBN89GpTDyvMM0xn1WEFCfRhT9pfgWbuDPdiTEwKQ92PjcYJdM9Lv4Yxjeziitfa6JOcly+6fRFGLeqClK8dp3q5+bhKLUF8NwHHoy69KgXmpJFJL+PyWiDxRlJrQounTBeBEZGkudeRXn7ZI6CsBXNeOfgyyaVchWOkpkccC2BrAvSLynEWE82sLRMDaFKWzXb/O79mJZlHh1RKgMZClFE2NOVcI+B8BYL5gbsIoa0tCvgnABQVpVnbvVQEsiL4kXg+m+6TaHmQVvlPOnxWRRU1rAlwP+/xkXt6caxbpvSOvH1ubqcyK2+01JlfXyCl1IvpSZDx4XvbgN1rsYwB8VFX/BOARgvSL0Wm2G4B1+XlzoNn3ugG8DOCTIjKuzP6xnEl6Yne1sUE8jep/IvJuVz83i6mfv+WCDvOlUrk/fvDtIS8XkT8FCZkDabYYjuLm9RnyqVQD4cScwPSaIenViwioMQC2oMdqG26wEwF8A/HS47HNEPOKmkew6RZztWAMw9efEpGJnrueC7RJ83Bf9KWnIOcwEwC/55yWEZRro4+hQSJeTxM0jwB4IhDq/rNrIMshrSHO8hCO41Mlp9LG9NCc+QmvXwUwDcCD/L9LRHpUdU0Af3ZzU3FjVmY/hcnMDQCb8aeH/48KDnV1+8mICcYD2EtEnmqBCcUOrUMpEOuRtWD9ux7oH0WMJXZ+jm5XnxAsJV395l6eTGluvdcBbmjT+NYG8KPgdEXCJW45TOeJyC39TJIedJDc+sT4ok3oot4OwCrBafp05DKvRzYtIpvFCyf/O087Ti3+W4JT29ZOnWDpoi4cQSKalR0y9wC41ARdCSGwaWIjipvvCoAbueFTWsB6Bes3XO9PlzlwuHc2cAdptUDomxAaD+AZrs8eVV0cWQ7lwm6j23NMo/BcN5irVLhOKLDsEOl2/1cCTa3uBNXuInJvWUEVHFpfwoyFK/yzdwN41zTgrn5snCZLQH0XM1aKST18KiO+CuDnIvJQm82/kQD+gCzWpJ6zCHw/3gNw/CwUPrEkWw2TRAOtZCsAu/DnQ8GisY39HoAbIqf+wzlCKsV2UUStktKGqjxxL/f94HM3VHVeAJ9CPOs/tmn/7IRKMzWmPKXnRUYnAmemIHi+SiBMU0JvreDzMY2n6ebgtRaWweHUWHpTa8H9NkHxLIBJ1Pzno6D6EPqYDZroi6H7IYBzkHFejSqpwXlB5s2xSmBOV5ygegXAnhRU1ZKCSpxWdSyyylM+Yd3WkVEC3e5gjdY0F/4+OfCwxXjM84Dspqo+wFSDSpu8fwYm/zzH89VIRET/dLBB9TBWqegzLvRijCPv1whbZjNgUK0kmCPHue+l4pny8jfzqgDVA7D5Rp254nHomZyek2hbd2yYY0uA1r7gaG/gNNAIy+aLsesG4PpjCY9iWF+yRobPtfMcRM6xsAY/X89J+2pGCu7+0kx/l6wdWwP/cM/xyyAFplGSobOZmOOaC0941IVRlM7ddXO1u2PHjYVu2N78hN/frXrYPhxwUDcKBFaKqnTfdgmIoPRVsyC+Jixy+phxPA9G/l4k56zKBbsHi1oexijwZYLPVCPCd3oghMM4te+GE+sOmJ/wM1NLeGnD+aqXXNQ2t4dF+mEb6MrA85O3Rv5QZo24sTo2Qjlcj+SdXpQIWbCxWsmlrOTlkdrYTFRXybigj3/LiQGLeepsbvegULgoks7W68IGxriDbl7n0ZxeEMqgOfmIDecFVs7hYq3uXze+Szia6lqi6GqTnsfRRYdV6mToZtVWH89RprZfeLLdaHlIbcz9W5cu9hTHcyqJc/d2hUyk+sa/V2aJqHtcAQPf3lDV/3gWAc3KxU9I5MuFWsM0S0YNXfFOQ7u6ZLxVWOosVcsupm28GKbaBDmA7xUIR79Oti8ZZGkhHNdFQg3qkeDSH8Q2mltL20ZohFIaoMVYJUNv3HU3CTSJFN96eM/Jqro2E8zDuDQTwE8pKz0HUeZrM4wk3LNlhVXdCcYak8SH9UNQiYvbuiQSvxarNPSNlhUaN9ifDDZ6GUEVxlVNJ/7SDp4o2wwL06xMTUi4sW2CTxoM8y8I1luYNRInRaK+fVyJf+80miKHBOZ2I1JxpO4y20cmNAZPH3KqSzStJ1TvsKTVm5Ek8HBs7bu/iAhMG4v/S8xRTFA95YILpcRpvRLHOE+zt3HbNSGsrJ9fDYRCPecANIHx4ZiwckGW3U6Y1hJzmSoO8Zqq3hI5NOzvV50ZGqt0swmZI9QJn5rGi7z6qHS/Lu+wGMRWD/dgP/wmErwaJtQ3ue4Wa8nicRJxpFMpGwm7tlmCo+qf7RJU/Bmpqlfk5JeFi9cE1e2MiG5rtHpQlWVnt0g0p3xTM1K15TJVvdap+c0IQ4IXdKcVmCG2WDZ3h0aMM+oNas/Hq+p2FLYb8/VG8AxhbcN3wnSQYK6uzjlRG8FB8vsWTcDDguDkGDyhNNmWTwgWw5UuS5Dh5eUYHpxgo7Bx/0ZBhHlR9LoGwqPh8jiTgcxufBbXrF5nTyTlrBYcXL79T1U/67WpfvCV2RgcldDsG5FI+O8ORKv6XEHqQaOgfFCdOUjrtUlYhf3qTRCsxYjGxpdNjegHiG6C6ttuIacii+sF1B2aOP1iwuqAvHF1qQ1fj2gNls4yU5kvt9DHB6ByjCHzooigsvFYwWloReXWmqq6S0lhZdc/P8IwGhvTB1V1RARcN0G1JrMeipwzIbB9erAxxW3wrSMgdyrTQxMaRy1i2tZUdX/eo7skHLGRqv6a4/B2IKB6OM93qepvNaui3B27Tj80qs8GgLpGcG7TFB9tGUd2J+IYR5BVL8iRimXz1wJGxnaA6j5ptRmcWJrjhZziTqKuQdKoTgzMvaLUoxSdaxmmxybNn5WKvFH8/a/AnLC52SOCAQ3j34cVMGrYNT4VAdZTrBypvFGl53KRFkzAZVxKUCx9SEPGyRxW0F8l+pmiA7Z1/3IMdKYz5dlAc26UwI5STqEeByF8puw6Di0IeuJXIT63D9l9NyF5n8QOugHshyN15nL1MdyzHqyjfmlVB5fIYm/kMCs0AobDdgqrc5x5l8p96nGesI+3G6fy6j9PpBTxWwrIriVOXS1IoPUUH5UC7iir+vtoYEaYprlkmEjutI3zc5gsbYFFCfvcPP25QFh5zfeSMh4gnbE8eeghS4WpnBwRKKZ1rpDwAjZKeAWNvXQphw8eQjypDBFgEV+8hxGmO026qx/af5m8vX6TCgThM8dHkp7zqkxfmqJT7ioRADqcUaboR6AgXJTuf0Xk/jZGiNv9bgfwCcTLNFk+2zBGcR8kIldp/4qj5rWqq+bzFfSlaMRSOTQIxOsKxipWKgrIL110A4PsUlV47JorA1jOBX1ahP/9zOl6v6qN9tXvWwZZSk+qbJpFO18sIm8H17DgvxEusryCeHksv1bud4GdefNkz7x/JLo8FmQJZPUBZx6gLNjy68jSx2ool1fny2M1keXPraeqTyFLIVkjeK7kdkM8RU2DtdHFAMqDReTffPaW9pKfm0hAqroA5UY/D26L0u8mp5lVuqlgZvLDigscF2T1M4/m9yut3NRszT0DM6pRMkTB/z1N21w1xZmoCzlKkFoQFGjtCudabrfnzzLfDw00B83hFPJet6fp6XkpAj4WBQ2aWv2RIrwqwPemBdSzR+aYb4dGtGqN4G4fyfFGreZCFuolYvD2Lporpw1tETB+FJHXHRc8n/XRGDp6I5puGS2oGcFiahGztJ6wPPKslWnO+bFbuyGMNu7HbmeWX5Xw+qViuJR5gq3vUcdnc3kEr8gj04sRZ11WloS+n6ELS9NUmer68C69aXsGTAxtj6Miq+akAndwCEY/RqxgAW68xVX13xFzJtb8mD+dIrnLwaumu7CJSTFngxuzCxMMo978SfGChyR2tYKI8PdZSksIK3um03Nc4TFc7bee+8vF/lyb4NYqMsdjpbl6E8K9nuAazzMDrd/PqOqGQ1RQ+QNqe0ICsfluRLjkegL6m9YFlfMcTCtB2JYaaFvguw2GVhPZHOuQ4H9306T6ExfSCk7FKOH7CwInQ+zsElVdODLeizmvW0qz0oTToog6diG3iDzedX2IdwXcUCng2ruZfxzbRE47PzbHKxrGFL3A3NNc4cvxX4YBj80Sa9Se91LTiF3/ftoiw2ZZh0moAffQC1fT4hp+Xrg9pn3lvbqGmDZlB9Jwkgn2FDgompF4x9tVdZ5+ZZEkwGItafaFA32f8yrJIA1aJRE5LDpI+X6RdJhacIKmhMv5zqXd7cxZExDXFwCyoep8REkTcMdgXmqpeBa3iQ9KxBv55+xR1c0SQZahRldGWD1RlGIRIRXsjWhCGiGYM6LHdZ0p+aNEik4tAXKXSVEK53660+q+kzOmjUiw752WijVUCCEjKWQbUeBogo65maNlvpiKeysE2AmKNpjouTdm5slBArzUBFj3j5KkZP1H2h0o7EE8vj4YJdgNRNyIzgdPPujHo+KA/i4Cx4e68aiFGByycvMIAMjYeBvLwu0RMDbWtg6AcWNHuCryfWMT2CUHALZrPIo+nqXmzEOlXegrZ17JAZh9Rn+jQOtvUPs6NGfdhQ4NW8MLADiPHsf1AGyFOK9WV+x5EKcbymvGhHA9gG8DOC9wLMS4tGyvvYmsks9Lg+AUGsgh3eT6nx8Zd9rR6OP+6spxBPn1VUVWsWY/EXm+X/LBncSfCdyljYK8sEbklHwrxcM9pzadsQLt7YG528g5LSe56O5qSQymSAt5RPtqr+XxkneRnjg8+W4NM+bddxZl7FDMueIxoFMTcUsxmuFGTq5djzN5RuY8k63P4xIaSrMg+DZ0vtRzUlzqBQGhReZgr4sCX1BVx7o8vRQttB+LK4fC3tGA35/r/yDtq/ycl4KXcqK8q6rbtmLaVnI0pU8k3MtltCo7kS4XkZe9O3suaPYsn0bGqBhzc4djUQFwnIg8XOIEWcjNTSVxOtnftzqup7z6cKsCWBMz0gUDwKU8rauRNfFhAEvw+Ty3UbgW7khoGp5xc0HMWA8u9llx4QrVAo12eQBfdKEXMbpmJLQge/7e4Nngrnc9gP2oFRkRYGqtp8bc+JgeB7CPiExExpG1EGakWfYhIOE8P+hCDGanuSes9ddU1Z0BXAvgb1xXNadla8G4mEY1lRrVda1ojDOdhuzQSgC2xMwEadFYl0THFMDfW1SZh7xWhSy2ZwyAr0cWXbgZLTbmFgAnF1A320SPjZgdqQ1yQ8H42vxuA2CkW1hCE/LSHEG4Y0RY+g1bBfAOgDsLzNCPOBMsr5mAmhfAAolkbHvtBGQMmU3ESR9j86ERM68aMUPfRhbrcyMyltKQQDJ1wIcsp8OQUSfvSvK4KrI4tyK6YU8hfdtA2XMHgAF3WTFbyoTtVfUyZKSKW1PY+8Km4aETmrd2KE4BsL+IXM5Qh0Z/O2kq9tEJrpmysT9q5Hp5QOkcKKzC8ekpMA0MqN22AAQ302u0U63z4pGUtCGrFHgCTW2/PAhZUCYVVxIm4LxBln4jQbJ3v4utkRB/o4fo/hxzK+b9ajjvcbe7nv19WML9nzLDtUSKU90lwR/o7rlHTvJxKv+11zmWljNPGX//LeEpixEEjlPVJWbV/tFIpSSSBHzCsUWExI/1El5Tbw6/pqrb+LltBx5zQ8KVW4ZtwTr2k6HkwSg7SZpTl84FoT4XwT/CJOPpZWPMnFBZVfvKU+UxSZqXqDsH24kRydVcv74c8QLaGOycSLQOsZh/JvAqzwZZDwRLM0ew2OeuCJ+Df29LZgfPtVUmcFMLhFVPSG/jxu8UdzDllXPrdX063+U22nW+yzCgFMNBGFd15WDEJib2e+jFXYY0OWEx21pCGOUJqx6Hr67XCkaFEhtmDZ7aZdyzMaFV56RsOlSBdS2ot1egVX05iDuKBTbWHZvqjkVC2117X15jes6Y22L+TcmQhW8EzJwWCLpaRBjYd36dw2Dg46uOiy0+F2x5VQu0KGGe3Sku13CMqh7uOMF6I/QpjYSQDwWaJg7XaxliU/XhJNQO/+42rE8k7gnYPt4kq4XXMkc70rwU2V5sfn/Qlo2dY+YFcz+c4S1nOoeIutzVMhH8qaDhK13sXLUdD2AL9UslY6tSPM126ncNZmxVuwQUI8h3U9U/kMH0D2FEuFu8I7SvyGM9EY3tx+7mcFEk+mZxQycWbG6v1eyX41kU97y3BCdj9NTWGfnH78lJXPaayP7hhnLraKeAxK1ZQIoYgxKeYnLwY5HUFLvGeJqaqVQeLZGC84TmF2StqOoPSKmiCZbXPzuz3DTexSLMus1EHFhY0XrbdlomTkCFWOAaDNq9L3im3px5axRoyj6d7GQHBw3oWboiwOq2OR4oyfF6SeAFrOsQKBbqYq+arpzVfAR+dwGwPYDlA0B4MoBvoS+R1sqPbYusooj3AOZ54c7gOHQVgKoNLqK1Aq+bRgBcK2F2f879DdDeBMDGDjy2PvybibvVADxWZDFRa2DGOLHw2ez1Kb4PTuB1A/ge11cN8TJLEvHY+c/VCEivzPetsKaPReoC8AMA0wGciZmLj0qOc8KcH28Q8H0lXK8EloXe3x+q6tnICnKuQAB9MrIYs5tE5CUT9vTQrg7gbGTlsHz1FhR4zSoAXnXz2+zv4ezHlM9g8YgrAvgYssTrD6OvNmATM9YdjCU6hw6L0Hlh9UDfBvB1Efmrc9412rWhjcj9tZzkyjKq4DSX21WZzVqUV8e7yJJ5EvOsNGKPW4LvzcHms/E5O0gETsXKKKlBFi4aB3ePJQiqNhP4oNdc787LCnDazSmRmK3XHXAbMwH3zwHEw2fcPfhud0I7j2kPRZQoMarbkBrnHs7zpgnur7y4LqVZuXWRuaXleOCr7vm31L6CCD1avi6A9ev8/uyfPHhDsxoARzKp/60AvqiVoMSJRfKHpd7tvVs8zXK7rKuu4JTbBFnxyXoQNxGrN5eKaH6CLtuiE2SwtKgK4zZMi1obwB48STZy7uqGO4kr7u8q+gpWVjQ7Wq0g47buRI/V3ms6LeZ8EZlQIsbMioCu4+KaKhGtwChdqgDuSWUFuAyExfjcXqvqAnCZiLya06+Ng5ijmNvfrrk4x7zK+9ZUdQUAx+aEFUiOtq5F4TXuGu8BOJLP+gjX3Rol4qBMo5rE+KcbtKDmHcMHGkGGxExhJ3z+PQH8FVndyh70FQAu02zM7ygT8pPQnhpO+K7NNbsD53Ve9/W605KrCS0JOVaWt6YsVGMagF8A+JmITG+3ZRWeJtsUyQPMzGkUqvO3DHZ6TWTCKl7VVdV5AOwE4GAXY2SbrB6YMhKJ9bk+srl2A7AIhUl3wSQ2AJxbZsG59uESn7Fr3Z1zbRN++wBYMjBZmzRNYt9tcizXTTxbLFZqTxE5jWaOmdd/5YHXQDEnVCqYM3w9DLLtBvBDEbmbZtd7NNF+EjG5/LOaoHoTwCdF5EZV7fZpT7mdTRdZtWDVQwCcxvtbIdA8fq1YILU6EzAlnGy9+2BV0AO5Edf8VoQVhgcCCoGAKupXat7UHYAAcBvNvrv8mAzGZkcQE1MmszyVuLzXrAhZSJDzr0tmwkcjcSH1HBZJb9q8Q5veA6ziPFt1zS96aekVI4ocDO7aEklgTo3/u7GiDDmOgJqLIbrDzMfEGliIVUVixS1SDpVvMDVnG6bvxOhaNIfCV3O4vzSRhnK+Y7K0ORpLqhpjhO1xVC3eY3eHRirBDHQNquoRGi+vlSoM20iA1uMcPbKnsImZdvOQivhoMnm8EhlTX0WpkVMroWwKUVjY5FWGOXS32+wrClmYUsIDmOeufDPmVRkEt6uPDRrGeJ4LAz6rHo1Xe01hGSbMbvMxVwZIUog1c/iYvEv/2DJuZzf2q/D6jUQenu/fIylWAudV3DcQrLbJP5sKNXDCfmoCk8jLD33V9a8nUsxiesTbpS2wFzSD3MFFA6YK+72mqj6e8Ni9yXzC0e0ICQgE1TedkM6riNPIwe/qRfmAXPsrE1c8g2PRm8Bf65pf3LeZEzOVygH2sWRTVPWPvsDIYGPUXU6934BeAY9XSQk10auD9wEY5zwobTf3nEdvUZo6nwGwYcQW7454hWJmrKng9vdtVOm952lr2vt1zExXrAGO0wPgupKYnY39trx+LTH2/n4visgUjrFGTLkKgM8Hz9UN4FkA5ztzKGYmLUuT2eNVoWkWw1kW533qDqOpARhBc/guAL901y0alxg99TAAE5DllL3uzQxiihUReURVtwTwBc7ZPMhSgq6nB/R555mqt2Mtquq3AfzUeT09POLZHDTHDPZ45M2B02NVAOsjy0PdhP/PE6z3moMxKgn8KY+ZQiLYtAawRoXryCCOn4rIfa6fzcHO//Wny+YlNlgKMLXX7nYu8UYbBZUtzAaB7iOQJRIv7SbM+MyrJezuMIfJh13cFcERdkjgU81ggXbTufBwSbez4UR7JARCbC6eCbCpEDfZFH0J1jYPAuAcEZmYwBLsnou7fuf1JQwL0ADzM1xpAoCvEUf6AQ/DMmCznxtzhb+HjC7lodgzUGBVReRNAD8G8OPQidDGTZUSVD5swgTsywytWCkRrhEedDfytW5kubW7Osw1xJ5S2CsSgqos0K9u7MXJiYsAnCgit7jx1FkVnmTcQFV6o5Bz8mlES9HAY/O/wcCluDAWYcT0PQC+Q0FVQx8ZfTUHtNXICRL2vQLgLQD3BhtgYWRJ3SGwCMTjhu4j4FvJS0J1G2kVnpjNHM+XX2gvpnBHti+5xW0L7T1kcUhFC3aBAi1Ac74fjm0VwHdF5GVksUwX8vlqyE/mVszMXDABwN4icm0ecMt18n7YisVJGbbFpFwd4Jq09XgMBVU9ooWaoHoWwAHI4rEE8eIfvnDIC+6gWw3AxzmXdffTcOu9gnyigVicniS8++EBYZpUFcAlALYRkT1F5BbD0izJeVZ5+7uoCS2GPoI0SXgAU94ZO1HfQRtDFpyZ02B9tB8iq8wC5+Gq5pwmsYmrRMy3Bn+GIyOSeynY/Osiq1TSRLmKJ3e34FEBgN3p5u4N3Nwhg0MlJazcSb8VTWPzepkZco6IPJGz0e2eo4KDTAtMiNg6MQFzAYA/uwosJyALH5kv4imsBBvXXP7DADyGrJrLPWXoRGzNhGuoTYdnF4N8v8Ln8YLKr6fhnCcjL1wPafJKuHm6XUQm87VN+VoPxyHPM98f7SnU8JoOzqkgC/i9EMCfROQmj+HOrkBvWzArIKMmqUc2ieSc9F7LeA7AK+0QVuaipYfyVGoFy3FDNwNzr2gDxSbSm35dXFzPIOOcChfV5m4R5gkgY958oGgMHNVM1ZmAVaRjeDxb62vxS2o3XffdwVxNA3ByyaGvFmg8SGBp6nAq0xC+7E0cEXkcGQdVk5vPNAWL02m6MR7O6/0JwEcoqKqt4kztpFex+7MA568D/NJv+G4A46gJPglgO/eeFmCA17i/t4sI8nBfxjS0vLmK3bvhDuIuAOMB/ArAxiJyoIjc5C2c2ZmRYrboGhz4WsFGjwkuAwafYCBYO4j2bBOcAuAwJ0S7gr5USpz0eYGsXVS7TwJwoYi85c2HQFihALCs0Nx5qoTANk1oczo2GhFgPaQZ9kDs+++70/4gZPX96m4uh1Gruq8g3cHuOS0HmwTisXWVAEeZAuAQn77iFvt/VHUygN/Q/E0J/MsAnORP9Nm5Sdxz7ATgdMwYExWm/7wF4BMiYnDChgEuFVunXcgofu/h/caiL+6uElkHRfMiBfsq1KIMwvkHgHNFZFxEk5qtaXNeWK3VoioZe//5kuZP2YWxDQVVDfFirLHJUeTnM/oTrgrgRGTBhZM9jmTmAxfN6hFMJlWI9GVGrUvBqW7vHYbMY5ZiG21GcKCFnOZpp/3SBLDrATA6hYKhbJtQ4BVCjjA1UPgLDLb03rr3I8BJunYnMn7/bQjqN6iVPwDgZtvo9GzqEBFUGyMLqB3pDoTwsJpCJ8Cd3Oijac5pgdYsAJ50Jv5ayAJrmznrTQqw03D9hxkbFWTBsVcSyL/BgmNnNXDeqrBaKSGhY1I5dfI+3ea+fcxtBB2AEGxG1N5hAH4lIt/k5HQDqDuN0FcwLhONbWPxmHdcpIB1mm2rANjT4RWxZ6xEPEBri8hljLyezoz2vyALOzDcywDeM0XkgRY0k2eCZ20mtOuwCIMVRfixiJyRwpacx24iTbw/5YyRDIEkeBNUSwP4Fx0Q9QBbbLhxOUxErlbVYcziWIsQS3gYxTDA210k/WbOGdGdOKTD9VJJAOuNAN9tElf9N4ALROQF/7xwCf9DrXWp6oIRcD0vxiocDNuYz7WpT02Ho6VMT3VCzJ8WeU4Ae72bJ8qvXbxMLSIkmjzhhuVod3ALtgt9lWkkH0qRpqoeTLC5jjiDg0QEgwLYW1VPFpHJqjovgD8S3zBg28yKCQBO4DMWacq2OO8jZrFUsMFSAHvTAconicj3rfpMzsM3fIpUxKGgs5qv36WxqGnE7lAZTfNohWAdeFB6GIBv0Mz1DBub873eHMjCxvh615ctEkqB5lg2IYZsAsoOwoeRVTK6CMAdLl5xJlaSodq6qIaPzQGjw80TM03eBvB6O8B1J/wmJdTZputDq1HIJtjuY3+lwDu2YYvelvEFm6JCYH1hAAe68SsKC/D44AYArlbV/yHL/1o7MEvsmr9liaNCDJEmb4VxWFcA+Bw32AjEy4F5bbcbwB8AfN2dzFoC+G6UgBYGWzhV0Bd3pZH3mzwMtnJaK4K1OAzAKSJyYoQK6KOBQIqtoSoPuXv4/7KcY++9zsOiwvAHr2E9AeBqZFz7t4rINPeMXZgFgZztFlYr8IRvYmY3rOQA7v5z7zi8o12L7jwAh3Az1NAXHOhZEh4GcAUyl/sRSFeE8dpYFcCNZpKktDsu2FVyTjiNnI5vFoyBaVVHIIsTC5NuUyepX9h14iCbOq3Iq/hVYj8nmXbQ4rifAuBT7FczAaqb2QdifseZQ2J2FDgoKZy8BtH0Wgg50j+ErOrKk8hCemqq+j0eKl5r9WZ5N4XB13wgNIX/4uhLCq9GMCo4c/1GEbH9sxGyhHmfSRILItXIgT0NGb/WDcgKO9wvIlMCM0+pQdYxpzVVPTSSoNsoQcKvQeGAYW5htGNxQVW/5/IVLUH1EVa23cbqy/GzdwdJ2BrJibKk1iTlsrv3/I73ql6QjGr5Wbt5L0qoVdErtizZLWuRghxl8zLrkbzHhuNO+pg7PVvCaPj72IAVtDdIXlUWlNjdP9tQEk4MBO1KzPEIVV2ba/8s5tg9r6qruTzD7ZjT2FNQTXhZP9ZuDHcNPhtbN5bveJjr2+9cHp4GhUd6I3twAplfj2ZuZ5jc3zWoycWzWLNaJmFyFHkX/Mn/JgFFacfJypNJROTHqnouT5smAezHA3XW7PJawqyQQE1+iD8pDcg+Px9/UtpkzCExJqauO2yszkIai6EvHaaMKRSbgzDnzBwHf6fHrT/5b5Zjd7yq1pBVEJ4/+MwLyLxiJ4nIG0OEDTbJ62QHDzWnjZDl2a1L58kId5l9GThbYTL+GeiLB4vhQjUC6i8mYsC2QHF6WjetklvZz3mQeUgb7r5hHcUeZOExt/HnVg+SB4dlc47UoHKE1WIJFTUP9wk30FuJzTzQRWjBhI+HpwX6CM8aPN1WQTqcIfS6TC2xyRaj8Gm2IMyXT5xgZlZ8Cln6RehRynNoVApMQ3MGdFOQfKckqJ7Ckuyg+DkZK7clVPAOzcu7mH832+KfSmBOo5DFDn4YWarUBjS7w3ADM8P/LiL/Na8wsri7ZTBjYrl3RnQD+B7Tf7qdy9+ID4chS6QODxgN8McuZPFN5klfD1mismDGfMDXkHFcXYcsd/BxEZkajIdRVOtQB8oHIqzmKyGMijCV93K+02/tihunEgie9+1td4JsTieBLb5UxV9FVk0WBUA2kBXRHJ7QgFLf2YhaoV9EJqg2A/B7B4DnjWveWKaEcQ3AETEu8X5qthUReRqRkJTZ4eL268CRzhnmNIaH1cbUaNbj/9XAKVALnBpdFATH8nlrqrovspy8OmauUWDa69UATuQ41CPzuBayXNt6xHkSzts1DuTeDX288I8BuJ3a0/0iMj6hPZkmWcdc3rqQlfZGwuuTZ6JosFEGpRV4K+z+OxdodmYCvoqsOjJQzIgwOvHssfAO0262UtUVrAIvN1VNVdcB8B/0xelUA2A+j00yj1raA70niMhVLhdvwOOeoPFtzmIGWBGResCe0EXNaQv+bETNaXgwfvXgsPJakkVw/1ZEXqb5twiy5ORG4jCp0or4siuIElsb27EvsXxPv/em0kFkz3s/gH2RhRa8HBHWlbldeypaFPdEgGktQb7vAcKTU8DyIC9mK3f0WgGxnjF4/quonw4g/Uyk0GuzRD2/q1wl3gVU9RDXv56g8MPzLOOUxx6ZR0xnIOx5qtodK7U0B61DKWDFXEFV9yPh270B0aIvfFDLcUo0guIGz3GODFQ/zZEFhqSNNr9fja2hoNbgDRG21XpkPd7i2Whja3FuAcfbpVmNDKR+E+nwhZhpBcziwhBOK2kQU/GpCTGtyl5vhRc9xn6QhzFVeJLvAOAuVX0UWXDlyk779O7vaciIA39IfCPMHSvCD02jegDA4TRhqkMxdKCE9oQIn/gYZOEZ29DMXwt9FDY2PrVgjioojhP0/58sIm/zfhsjC5UxTCp0XnQhi/w+1eLlZlZGpcnisRtj5rJgsbV1tovq9wUpVESaH0jtqUBYFbEXaA62YpM/bDY+w95OyKY0Jgu8u8EtvqLWyDHR8sD2GrI4mUWckPLeOzM//kZuoJdKXDcUniaoXgZwoIi82ba6bLMOewqrsVhcmwmozZyg9wLaZyx0tXBYeiFW5dj903mwv4G+mL5qYN4bXvVDV7Wlmbj+9uhj3O0KIAdP0vgmsoTt9/s/JwVozi5hVYlsBi3QpMLNNM+s1LBsY7KwwzYJ0NoDqxUAlzJCuywrRE8JzC42Pl3B4uyKnNAvIGOyFGQenoMwM/NoDLsKBdWeIvLoUAgfKKs9BdjTQsSbPorMa7cW+sI/UsLJR2ynSsSlXvOHxT9F5HX2YzOC27VAO7Pf3chKq12eM9YWSLxrgXZsuXrXichLbWIp+cAIq0YwsGWThv0CGDOL+2392w99+XXVnM82AJzTggkIZOk+TaRZB5Azbnn5jE1keWTjubgvp/BaBn3ezFjSa9OZKM8goyF5cCgKqoh552OeVkGWvrIDstCCJSKb2VMAhQelIN+Rkhp/wYzsCP9yWtVnkcVc9SIe09YD4OepA9mxdaxBjTDU8mMU2n9vcT12hBXinryUwErhQvPOKjXWEdctQI2kmWM+2aK5C8Dt9t2SQvg5ZBxDCxUI8BQjQexEHUbz7zwrSEEOrR8hY04Ixzisz1ZBlox6OIMRu4ZC0F8Q99QI2DpHI4tz2obY3DqYMVzGk78J4ulSKDgwUGLjq9NK7wDwMEM0lkdfMdjuYO3Ya5ezRmFKC7L7fpJWhnkBYwebFVa5LjARO62EsOop0BiAGROYY5O0gKqOoD0vgwzyGofTAcQ0fNXblAn1zxYKr9p3XkfG+DgW8erTRQR1YQBgN7LYmW8YQOvimf6qqhshq8oCd4B4ru23APwWwM8Jpldmp6BKgOMW97QEtabtAXwEMxPt+ecL8zmBOJU2UExTlHfg+jV8k1ujO/FAqicwsAb6qGwk5/Cch8IKiFey9tVu/jMYFYs/CMLqnRZNr9gCWZCn5fRZpFXNi4wi1wf4xTCeKrKgv/PKYmpOgExV1ceoCTQLhHnKLPTlqd4GcCg1KQ/QWuDr0RSOhyDLvDdeqieRZc2fJiJPO7L+5hAQUN68W5PY03bIvGGLR7QUCbAnlIQdYtQ/WiCwYvNlQZy3ude3j1zLp8M8AODmHK284sgi18DMBSQ00KpeBXB2SS2/0wJh9WbkNMsz/0JO6AaF1VLURtqacpNYGIe6hVHFzBzXnhngYhF5tcUNbl6gKwDs7zalIO5oSPEU2cKtUVDdFZ6mFqlP0+EnqnoKsjy2sRzPx0TkXQqEUhQss0JAMaVlAwqnrZHR6fgUkXqgZZTxOueFw0gBbooCDMuExRs8AMBDb50EDuYZOqaUKLbx2UB7CtOlzLnyr3ZkGXzQNau8OnF5J18Dmat2GWRlrGSQNo1xQS0G4OsOLE2R7FWo6Z3Rj9vZIroEWdLoim6xpe4XMx/MgfF5EbkwD2Nyyc6TgpN/ltPM+mjpILxgHmQR4ztTI1ktEC41zAyEl10PUgIPjAmhMs1SbbqIRRody3LIIt9TJI9N9IW7xMbJ4qM+wjExQRWjI64gc9qc2t/czY6w6ktCznMFa2TwwwFfC1n5pcFqFnT3HWpxDczscfHelm5qRve0ajZZoVYRmaSqfwbwC8wMfMdO9orbtMORpVN8QUTOKqrO4njKw2KZgy6kEonBhj8tjMzD9TGaeatGQGtx6ynvsEtpSzEO/ZT2KgWCzV/H5ryKPoaFCY4Zdjn08XaFhRkqyOr9PZanxfEg+Z47mMJK3x6z/LeIPNsJV+i/sHqpJC6VZzIBWfIoBsMOD0j7D3OaT4glhQvuZMOg+nFby407DVn157XQF1oQalJmNloMzXBqZF8Qketb8dq1s85di+adB8hXpGm3DTKgfJnAvPPR2WVSrIo0obJBnUWf81CAL6Xeiyzv7i4Af3fCYnGnBUtEWE3nd/PW5N7Isig8JKHBwVkhZvmbTurMwITVazlqdkqIxVgy11XVBRl42TaPoMsBrCIrLDkKfcF7seh6U8VvAHC90Xb0Q40zqpR3VfVAZCD30m7xViL4hgWE/hXAd0Tktf7Uu5sN+FMXsZutad5tghnDC+pu03nTu4niIrg6ACGWJ6jCasPVYE5eR5YecxUy9oKHHVuHLwCLiJZuzzYKwMhQwLjyZ2OR1WpsIr++Zhcy6uOnOljVwBbwOqr6ToIltJlIaE4lOW9tLI1t7J8xMB7uGBRTib4+8Xh3J+QGpNXx9xqqeqOm2xRVPZdeIbTj3u3Cn2LJwao6RlW3UtUfq+qdLila3TjWggTueoSdNMUi2yyRiF32J2TarEWYS5WJyaep6j4k0JtpLjkeqTUVS0w/jJ8dFny3iwnk4ZqM7ZUnVHVBS3TuSJ3+a1avIPOQzIt4HbLUiRiqzV0AdhGRG9ql6rq6eB/iCdZAfuViC/q7CsDl7ciXswRTEXmMgmgPZGXBF+E936OJcaWIPOIA6tlG4xHJv4PDnzYHsCOyCPIV3dcaDn+qIB6BnZfMnXLIlAXG87yBGmjNXc68ewBZZZhrANwrIu9ENMkZEoPd+hzvtORK0D/7/+uqernjk2pSozoVM/JexcbFsKof0OLoaFUD2YucuCu5eBtOzW/mqORhMyHyEjIX9lsGiA9wwylV8WuRJbiaRydmFhgoXAOwTSxMoB24WRkhMZvYM23DNbwJTu/pVgB25++lI2NWNp0lBh6XJWlsxSuogYDyXtipyCrBXEEh9YAvpeZYZJMlvVx6zJrIosm7EsLXhM19yEqqv0Rs9ovIit/WEhimF1TnIQsWrXQEVXsW+m8DE0pzzD+N8DvVnRnxlYGaQFSXTd0+w6naeaapcWv92W3etmM+nmMo+L8yOwRU7N6quoyqHqSq/2VxirDIRy0oENIs4OpqOpMrj+OsrFnXKFEMoxGY2Deq6ndVdb2EeVea98nhoCNV9WG3vuoB71UjYh6r4yarJ8zVmjNLl0jxVXVa62YgaMZ4dbsM+BnGkNh3jlbVswC80x8XbaS4wqGYsbik5jzLRPQV9my/Ghr31DVmtYByGpQ38ZZFFuuzKwHysQFAjghAXuRISTlWBOXj8Eo9lgPwrUBCD7KyUpchi3d7wBUg9ayfLfM+udCUaap6PYA1MWN+on+ebswYFByWwPJxfX6M6shopl/tmH/t3QDrq+q0EgyVjRIlolRVf8vrdrciOCyVhH8fmwA/85hAvzVUgO1ZpEGtpKqfI7D/ZgQg7w0A8VY0n0YLGlejH4B63QHlvj2mqj9X1U0iToG2abDOcbKV60sM2NccZ05sLOx5vuYdRJ3Wvs0wWlUfD2rklfUOxqh2rZILUrXbUmYf/z8xoIWN9SGsXXiXqo4aajXsBiiguiJu8xVV9YuqeoWqvh0RUPWgVmI7vHHNNgmrRkJAPU8v3o5MgZlhXQzGnAY0yucH1MXNEuauRryHZrp+1639jvnXxkmzE+asHDdu0anbCE7MOjW1T3vgM8B6xLuC+ZmFVfXsCH913mlWI2f2lnO6VlWgQX1WVS8OBFTTFSFtJMIGmgHHfpmDqBERQs2SvPwpjbzXHSyqqhMpJPald20mDWqwN7rT4ld1XPi9Bc8TG4seN8bHumfoCKo2T5gB2QcHIHszWOhlTmhfQdZeO4lVQ3L7wGIAT5TQqGKg+nFzqsqdo0GtoqpfUtXLuLF982BwnvOjWSCsmjmf7y9A7g+tUEDVWUzhaFVdObIGZvkGdwJrNx56HjyvJwqpmNnoHQEvqeqe7TZXO81hjc6NuzyymBWLtyoTa+VBRYkApha9+xKyKr5XI6tDN43A5WLIoqb3R0ZvC8xYWDIs1uABzhoyMrvrkcUNWYkinQME1AzxP15AIUvd2A1ZwvAYN54+BipkvojNTZmCHkUhBXlR6akQBx9uYO0ZZIyo/0FWZkqDcWjOznlzEem7IYufWtKB5LEIfR8tPw3APwD8qMOmMMjCyhYNPSQXIgt6bGBmQrTYIs9b7DaxxpBp7Q1kgZTD0FdI1IQP0BeMKIlN5xf1RAAfYcDmkE4OzQnUXJHCdldkCcPzu6+FHOSxMQbiVZsl8X/q79S1Z1grCWHl+eNt/iYhC9Q8D8C1IvKWE1BGddMcInMj6CN1XBrAUcgCPpdDPPexBuAJPt+/ROR/plF1BNXgCytLyvwEMq5yHxyaRy0bc3FLQqiFvNp+Q0pCOCGhHVj/9hWRc4cKvW+OBgW/iJkKsj03xFbUZv14IDL+RYwPRVqwJARcqmJwbL7D6zWDAwbUzi8A8F8ReSLARnWIHyhVF+U+Bhlf17LIIv0XRMbC8BSAxwHcJyK97iDSOakM2tygWc2HLDp4pcSpm0f7UYks+lSkuSJN/Yoc88JraieIyHetAvFQWSg5AmphmrwfR0b1u1hwUofaU9ly8q0IqxRvEzBjxkIRK6o9l5l67yDLgjgTGVndNCegMLvNvH5owKUooy0hukP3MguFVWC3Hw/guw47koSgEuTXFCwSdkC54EINNvVwYh+fGkobIbbIeTp/BMBeNPWWzNGgYodAK2OYmg/JMRtTmrNEMCsTaF6oPoascOzZIvLknKRFtXLopCCOjiY1+4SVLeDlkVFrLICZCfkEcRbEImykjBlZRC1iuVa3IksknowB5h+2S0B5zY6n7WbE/nbFjGR1DczMcFomubddwioPcwLSbJkeMG8CuAXAn5FRRr87p2pRnTaHCivbfPQMngDgGMxYj6+VZFQtwFckZ8N5rcLzvHcDeATAzvS6DJWiCfb6mhRQexLrEKcNCtIUzEVCqwxxnZQQeincKbUufJ1CICOPuxRZKbHr5yYtqtPmTGFl/4+ldrUsZvQMpqhCUCCMikxI5Ag3o315GsCuJDCb5YB6wsxbBBnd7z7IKgrP4zSoVK5ZGWHRytxpCa1WS+BQYSFWE1KvIXPN/0VEHg8EdkeL6rTZI6zspKRn8DPIAFOfRIwCITTQDRl+3guqPUTk8VnpHo5pUarajYwTan9k8VBLBJiax3TKhAm0ovUUhRqUqagdOzg8VYxp0o8DOAtZzcWXncCWjnu+04aKsHr/1EQWI7MX4uXZy5ZKKoPNhM2f7rcDOFBEnp9VGlVCi1oZwN7IvHkbOIFUc5u+kvPsUkKL7I+w0gJzOs/strGGm9+7iUf914jsOl6vThuSwsptVqXWcD2yirphxdr+1HXL2zTitCnzQp4J4CgRmTwrNCoDiZ0WNQpZRZcDkYH68zozT0vgUCntM1appaw5lVfoMxUcmgoh8QL2NgCnADjPxQ/N8jqFndZpLQmrwBxcFxkr42KYkRmxP5pVnpni03MmAzhGRE7xfRlkU6/pPHorAtiPWNTaETMPCSwqr4xUnucTJc3DgQorX57KDp4bKKQuCgoqNDpCqtPmmOYYGTZW1ReYsDnN0WHUI4mvWkD4n5eQrKp6s6puaBreYCW2xgpbqOrmqvrHIHHYJ+Q2E8wFzRLcX40WmQ9aTR7WgkTmuksqbqrqVaq6ux/fDlNAp83pAstYGVZS1evdwu9JCKtmAfeP51ryvEYvqOoXCGAPGoOC0bC4/0eq6gGqel1AYVtGQJX9e6DCaiC0wfWAPuZSVd0xENod3qVOm+s0rBGqejxLd2lwYodCKEbKVnfkfNZeVdWfquoSAWY22EJqEVKwPBhoJbUS/EVlS5U1+klmV5atM0YN0whoTKzdpqp7xea10zptjsasUhgW/14LwJeRBUEuHGAkIZ4lEXynDuBOZKka54nIK7xuN4B6O7GSMGhRVVcD8FlkFUes0nAvZi4/lReWEetfJYJL6UDGPAerysOkDJeyOKm7APyW41zrhB902lwvrMxkgEtxIZ3Gzsjy39YDsBSy3L1hbjP1IAOm30BGq3E7MlD3bif8BsXr5CtDq+raAA5H5tnzXj0TNGUFhh+3snFkKY9gUeR5K30R9DlAgIxD6qcA/uG9ex0h1WkfCGEVmGkSpJuMAbA4Mj6msRRa05ClabwD4DURmRTBwwYlfscxSWyBrM7brsjI7CyNpNKCkEoJnaLI8FjOXpnvtlo5xhd/nQDg9wD+KCIT3Dh3vHud9sETVoGmNRPjZZnPYxCz1l2O49IAHqIAVczMJBETIKlxKROoqTnaU6s5f2W0Lx882wvg7wB+ISJPDabG2mmdNjvagDxuvo6emYiRTfV+7lqi7t5gCuG1KagsZWhYDpbUDgypSFD1Jx8wZL4IKxVXAdyMjFb3ukCT6ph8ndYRVgnBNdRO8M1QjramiE4lptXEBHNRwGfIhqoltSr/tyVIdwF4GcDPAZxO8NycCfXO0u60jrAa4o0aXlNVhyFjRGg1kRr9MAVj3x+oqR2jMa5TO6wD+AuAn4jIS2byzc2alI8DG0yzdlbdZ24Yq46wGnizJOzNAayFPjC9iPgPKGY77a8nT3M0sSIhKe4ZhiEL+ThGRG40IYVECXWHEbbKQ/b+fWOLnfeM5hu2a3METJ0zXDfvvTbfx49d6fu4ohitmvv9ep5ZNVazW9DOjcJK6QXcn89XQzFjRKsLqgirCoVUf7U7HzM1HcAvAfxMRKY6T2qjwDRvu7Y1mBqcbS7eoxG85wszNALh2dJGTN2H96gii/drRoR04X34fn0AY1C6AIXTqFPPMNNYDVUN3Icaxf6fq1IsHFvEygDuQBZPJRHNCm3ErorMxBRGVXQfW1DdyIp4fFVEbiuz4FzYxqIADkFfuTMvUBuIsz/YeHUjI9x71k47XnMYr7k4PzuMG2M6snCJV8NF1p9NyjLyH0UWw7cy+sJh6gDeRBazdxuA60Vkku9j2dM7uM+WAFYDsCjvMx3AeGTstDcBuF1EpuTdx437SgA+48bY1x+sOG3XwmgayJL3XwDwkAuSTo5j8AxLAdgJwCbIyofNz3mZ7sbqJgDX8RmGbNk6VZ0HwGgA04wye27FNay67ukuv69Rohx4K6XSy5ZTbzV3MEz5UVWdylSkefhcpXL43DhspANru5hwtPuq6nyq+kri85v7+/dX/VfVz6vqYyX7+KSqfsWlhFVauM/hrgp4UXtEVQ+JXSfQvKCqew1gzN9Q1Z/xUEjdR9x8/J+qvl7y2g+o6rb9naNZsG834Hy8oqrPqepBQ62v7X7gtVX1vX7m6GlE6DQKEok1wSrR6GcCsgmqp1V1+3AjtDgW66vqFJZF7+G17We6++lxOZu9ZNbodQvbC6t5KUjq7vPTVXWyqm7cal+tv9yAo1X1H25Me1zCfM3dr8f12dqFFKSSWtzuPqNU9Z8RZo2amwO7fm+QCH4m+zkTI4gTVru4a4R9nurGfDrHerq7t7W/Whn6yH0qfO8PkWfodeup1z2XPwB3HkpCwI3bF52Soap6tu9nZS5UsL5HNbI/uFSs7mEeh3osFzI0/STH9PTNir12AfgXskrT15g21U+cwUqd248Bv100dexnGM2+Lv62/1NVoCvB9ao5ny8Fg/Hnz8hKrNVoGnXxmo3gXv45msgCYvdAFhTbFdNIXBygADgdwAHoSwUTh99aWEiXe73i7vMZAKfQjJKcuexy/ex24zrSjflwACPQV47enCm9AA4GsAvvUwkwpyYyvrUv0NSrcV6Ma+4JZMVY7b5mfvby/iexRqgOMbYNddDHTPJprgDYHVHgx5HRDqdomAXFZdHzAPSypHkxAZVXwqzGxfsugO+LyEnuuQYSM5UStk1k5d17MCNffDMC6ue1phMenthP+zF3h3ADes5/dULpXfZnDDecOsFpEfy7AThMRP7o8EuHe0tDVT9PgdjrBAqcYJoCYCrvMyKY0yrH7CBVvZTVwGP4Yd0JWL+m3kOWF9vjBOIyyIKXPYGizcPeAC4OnqPJZzscfWSVNsfPAPgcMU4h3vcHZIy/Ndf/FZFVifo3tZpGm/ah9z7HvO8p54Stm6uRUakvwD79fa4z/6jaL6yqzzh6lJhJpm3mjWqFLK+R4P0y9fweVd3APVNlIGPiMIDeAGtTmmxbquriqrq0qi7Jn8VVdTH3MyzEaFR1jKo+7kwPG7NpzgyslF3c/BlD09LGw/f1PVU9RlXXUNXlVHVDYjrTA0ofM38edRifBL8XJG9aOB82Jt8hjLAs7/PLyH38fI0M8CMzZ7YJuMTsXo9FCB9HOXOu7r6nqnqHm0t/n8WJbWnw+WMcttldgJ+dbp9tJwxT5nBK4XBFGGPXHC6ozP1cV9Uf8MTodWokIl6wIk0kppYCxUGiYbS5IB6Brs4TZCbH3wF8RUTebrNrOZVV0ADwooiMH6C6PlATosq52xHA6k7bsXvUAHxeRM5233kBwP9U9TEAfwrGssnrbImMittMSPv9MfSVl6s6DaYO4CAROd/d50Xe5ylqJ+r2TAMZy8jmInJdRDupRNaAjddwVZ1u7zEM5fcADqJZ6NfUMPdcfo2NcZ9tutd3V9ULROQJ15drkNUyAL2b7yEjGLg70GraYdl0A9gUWUGVhQjH1OiRfArAXSLymgneGcISMq/mCADrUKNtAHhMRCbOLVqVnWT78XSZHiHPK6sFNbR1SuFGAZ1ximbYTufpqvo19zxtPeUIsPcE5IdNVX1bVRcvo/UkNCvz1HmNrT+alc3fn3i9UHu5gO93O7C56rSG/zpAtumA2V/58XT3+YsD7puOTvuvwX2Ev+3717r+eQD4e4n77BRoSjXnuRztnqPLeW1t7daddnlLYg7mU9XnA43PtLc3VfVcEkt+mKEZhZ7RNqy1LVX19sBJELZXqCV3+TXixm0ffn86P/9Lf4+uOVhQVSjNV0JGiVJxYCjQWvUdyQHJy2JTZTEwA45fJL5ynQs2bFdOXyxVRwKcaXNVfSGyBgzXeDCnP1JSgyvSipt89jUDjcTaVfycBnREJkivQkaiiACQXcPhO3afLmrecNqY3etS+5y7T8OZLDcB2DbiUFk1oZ1Iztj0+BgnFic5gZqSaYGG291HjaMqIg3+XRGRd1T1JmpjNp8WO7cQsa69qTG+oKp3ALgcwLUi8ibHQgeqwTt2k/UAXAhgQd7TwPzp1K5sTS3JZ50iIr+LxHstHGiSY+d4gN08OzxhT+ZDxUD1VkDoovp9mhAErZhOxpTwPwCfsurSGDyuKW+KVNzGGQXg7AD0h/MovQBgIwATE4GJEtmILQssbr4FkAWYxsbqSX5mpoOEr7+RmIuxbiPZ7/nQxwzraYJqAN7g9VJ9fDUx94uVPBhtAy4F4BJVncbPjKHZM9bNhR1m05z5ppH1/3MAO3Dsam6OGwHcsBJ/Pg3gGVU9CVnwbqO/wbsR7fhnFFQ9FLp/ILQxja9/3jlPqgAOVdXTRWR6oN31OqeJOSrmeG9g1eFUOzqcShJCRgo0hCKtqpU6gCmvmXnYLgVwsIi8NYhFW/MESMUJg2ogyJquv1ogAIHyYRnI8a6OoHcvHNsmPXN5zzfRLeimw6K6HSZlzUIHfF8rvMekAkxzSmQMAWCEE4Z5lbIr7pDYKbE+wkK53xOR+0Ltw+7F6uR7USis7LR2w+8qTtuyZlbIlqp6MIAeVUU/sw2EfVmAY/scsuj/a0TkyOCztwJYF1mGgFJojwXwSrBuQs26OUcLK3PnM/fvGKqaXUgnJpfd2CgJwvdXcHQTEP6SiPS2ISyhTGsmnk8jTgg4zbSrhXEIaW9aPnicGRMDqMtoq5Vgvj0cUDS3A5nvModgJTJONSdYq07QTEEWI3WiiJwTCb/w2l5FRO4iE+6RAD5B54K3LkzjskOpztf2AfCIiPy4v6ELTsBNogAeQxN0UuTjozFzWEts7Cp5jpyuOUxQGU61ObLAvipmpifWyEaViHcmZc5JgdApqsAcEwxVAMeJyA/9c8yKIQu0LPtdA/A8BX03ZsxRG048rV5SwIeFKloV4jX0BcSGQqdaIAzGsv+NYA00Ihuw5p7Jx0AN42bKa2PcmvICZLrTdLwZ2Uz0uYGMdno+apO9wRz9EcCxPIyTXmFjg1DVbhF5A8APVPVEABsD2B7ANhRco4P+VN08fU5VTxGRiQMxB/ncNRF5C8Bb7N/CyGK7VgHwYVo/qyBdxbzUwdE1BwkqyX7pClR950GW/Nnr1OjhXATVnGdrusVaaUED6w/Nip0WR4nIyQ5In1VJpDFBLjzB96Lq3u3MVP+cPcEJmhpLn5Tbn+d6C8A4mhAet+kGsGTAQBvOxYoJE30cN3wFfVHa7wB4CVnogrr7jASwuK/MHbnPChFtDuw3HFYUarQaHFgvA9iaWNdvKVxqToh8CcD6qnq4iDyfSjh2rzXca+8CuBbAtcRBV6GQOIJ/+ywAw9vWAHAriokg8/akCaxNkQXbrksgfQn0JdDDYWlVpDMdKoFwnXMpYjgo0zkokzkA090iN/xjJDLPwlJcaKvwFF6OgGTsFK4UmA5SAsNpRib+CBE5fYjwoXtzbSqr3vT2U1vzGkElWMASLGQJ59F5uXpU9VFkcUuNYE3uQXPIqmdroNl8LDE39/TdSpoOOngSWQwWgsNqdxG5IHYfCrxtg+fU4D4xIR47uKZTkL6gqgciq/S0oLv2SGpGZ6nqdgBqQYUmcfRHG/IZRiNjWXgbwLeQedrqAB4D8JiqnoMs1mpVt87N0bNQbPwcj9f78YGJA9bG91gAPwjmbjyAZwE8iixq/2vInDb1HExUAiH8wSy8y9iWpVR1W1X9pqpezGhmDZJB+xOnpUEMlcU0HcJ7z9KKxzlxVha/M5HR4OLiimb4SZ2iLoK94a5tMUubtIo/8vdBLv6pHlxzv8R3v+Git+tBkvZWwfUtnulAN88++nu6qn4ycZ9vBlkRdq+3VXWNYLztftsHcWN1x9ww0vXnF5H+WOzXl/w1g/uck4hj2oLvD2fM2Cj+f5qLD/OJ1R+J3KMwkjx41j2DROrXVPVg7jV/3WvcHE8grc0MxYdV9Uh+xooo/9Hfa04E2MsCuTNEkPNkeIU/1wH4paouRGm/MzI38GoBrlMNTlNJaCkavNZAFnn9t0H0+LVikkaBZQsL6Ie2Z+afDwHoBnB64Ob3JmKNZsE4apvTXb8uRpbXtoLTrswJ8BdVXZefmUTN+EBkib4eQ2oQf7oDwF3c2KG5dClP+xXQFw8Efu8sVd2In3mbmvl+yArienPX8vGuBfB4AluSyBq0cWtSyxNknrmD0Be6YLGCTQBfJevA2067sutehb4cWN+n76nq7iLSYzidqs6PLKpcAwzwNQBPek3QaW4bIMsxnJdj/g8RuT2Bbe3Na1s+5c9E5G9OEFnC9nKBQ0VyNNJKxFHxgdKsxEcmh1HWqjqPqn5MVf/FfDQNor7L5P6ZVmAaVffs0iIDzaruflRVJ6nq8v6zZfGJIDcwRZdTxNc0n5sTO1U/G0SXaxCZXXMnrgYamI963y3UFgJN4FB+blqg+XgNebL7v+bet/5MVdUNI1qJ3WPHRK7fI0wp8dreD9xzN5zGqqp6ZHBdm4OlVfUt99x+nG5Q1Y+r6iaqui+j4L32ZtH3/wjWijj6nIeDORunqosFn7ffl7sxU1X9VGRcPh1Zf8tENKsj3Nz4/MUKPujNCa9wYa+jqqc6oVVPmIaNwMRSVf2qX4yzWVity4kPE2onqepyAxBWTwTCqhEI7JrjUvKmR52kavNGDpAKuaLUmXP+Wl6A1QLzz57r+JigCuZaHDljLRBYHgKoB1xQ09xmOzo2djnCquYSmUe6TVphAv6z/GxPkG7zpKoukEiWPjYhdNWNk+cFq7k0lgmquloorPh7cQqnWsDBtV7C5D2TfZ3Gez6sqpur6vy81ucJO3iBOUVVV44Iqy+6NLSZhNUHWmIR6G1YNK9tGhF5UES+AGArAOc7c7COmQMtLRG2C1m1md/MohiqsmZgI/BONR3I2d/WDH4aEeBUIia5YEY6ZV/CTZHRnvwJffQpGphy/h4N5yRqAvihiBxrjozYXDsz/UhkUdb+Pg03NnXMSC/dpPOmjoxe+reOVyo17s3geqETR5El4U9Axq1fDcavRsfQ59j39z1lfMZfADiL/epy63AqPblK50mPG/vhAF5Flj3xRMLb2IuZk/Gb5h2OtLOdc6uBLHXqGmSFTe4GcBoyypfX+Qw9/OxaiXXScGuqU5y3JBjv1dhDCRyGVMkeED3dfVdmd/+dGRhr77Jadelk1oAp9IUB0PY+q6qjw3sHf++rqre5EzbVJtMM+UjZZwm0lD1U9cYS93lXVS9S1Q/naaMRgD1sLzjQ27TKiqqOUNW7E995XVWXDOZAnOPmW44aKa9NYML4Cgkz2fozzCVuW/sfNepUcvuXmUAda+NV9TBV3SLQ9s4JLRunWWlMs5KOaCrc9EbatjqAM5AVTu11J2E3wd9P8jSc7bXaHFC6ALJoZSOnq/F0mwrgQhGZ1o9rdxHcXcA5IbyWFWoYGmgnEwFcllM6TFz6ykYAtiAgPj+B8GkEwB9BVsThMbf5miULRlQ4TwYsb8j7rEhQ2WozvsP73CIij9p9coI1bdwXA7C701KqvObrAC4KEpktXWdVZAGUdTdelh50pYi8HoYx2Fojf9dmyApGjEUWAiHUYt7jM9wqIi/mjZXr/+IA9uS13mOfn4sB7O47ywHYhU6qkZynhznX4/jZ3QAswnEZB+AGC23h75WRhW5MRZaa9D8RubsdOYwfJKFlYOiCPMnVaVT30avYAQLbN96t8M1Lf8d9Vt2nrNY6C56hMhjPUKJIR7Ud1kZHs2pBYNHlPAbAf5HlQ70KYAcReXQo1mMLClyGGE5jVmyQ/t47UqC1GVmzOtBsgMQYhelYLWUdJK45E9VNTItPYYR5mkUOnTAwc/hOf/pf+F3X/zA3t+k02GreNYP7tjzunRbHghYgpvIJr3l1Wqd1WqcNRYE13KnWHQ210zqt04akwJKBYg2d1mmd1mmzVGB1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1Wqd1WqcNhTZkAhvzgiytqCP6kht1MPvQruv7Z5rbKC4sKbVsQrTjztehNhatPsuc8lz9HIsZEqI7icQlhVQrn2lnP4ru19/+OPpe+aDMrT1z7PU5fVPHaI3nZJqgod73riEySFWn6VnlC6N4FZZb3xrARwFcLCL3pgpA9lvFzLS3kTwhpycEVFiEMU+YWfUXoxup28mdKgs+By3qbgBHISNn+42ITEgQpIl75sWRFaadIiKvoh8ly9t0IElQRXk+ZMVFpwI4hbUUC6/jaE8WREbY946IvN1GoTFLNTVHArgc53ZJZFVtLm33XptjNSrS5F5HcvzH3c8TfO0RVV1SVX9Ksrsv83td7RSUpNJ9ivfeMtQKVHUlVb2TlK8LxDQs90yjVPVCPsPjpJ29R1V/7WhlZQ6eszGq+irn40PhqeyJ6lR1d1W9lFVtppNe91JV/ejs1DJd/5YmVfVbLFuVOzduDBZS1T9yHKaq6issMrJ0qvbiYFgdbdSARVXHquqDjlb4x4Ey8YEXVvOr6kPk057kBmqqe21pVf0uK24c7sppVSMCw6qGSBm13PXjkgj3sxdWa7I6xyRVXbRAWM3HxavcBK8G5ZgWcX2tuj5XPaND2P+Sn6kGzy+x74eCIu977n37zHwUwpPDKimBIPhewMV9v5vjVxzDajXoVyVy3+SzRp4v/EwXv78kBeWJVo5NVZdg357mWqyEHPyRjT2c11FVfZl/Gwf5VlYvLyLA/XqqBM/1fkFWFj89h7xpFTfflZyxCNeSL3NW8T858MQn+AzXscLTWDcn1dTYBGtj7oU5OBgLqeoiqvohlgGaypN3MVfY4MccyC/kCJxKK7a4WzjLsyjAOJYNekNVFw40r9W40cY5YSM5AvhZUh9vRU1rXWpmqqqfyzuxEhhPv3G0/p70KSocLsgnOU9hSSf7/VFXIODXqrooqwQvx/8PK8JJigoztKqBqOqq7M+l7rVlOecvG0dZCW1sPRZoeNWVlFpZVXcoM/Yl5vJFrseRKXwsmAtpZV1E+mO03fvzuX5UBsea1UJptgNqLIf1loi8gYwm2IoxjBeR10TkZX7UFmgXy0zfyPpvyxJ7qNLm3oK1zG5W1d+p6kquAMFMt+fvXZBVkz0JwGXIqvHuHIxRBVnhhUpChZbItbsA9IrIVBF5AMAVxLuW5We6WVftMpbXPl5Vl3bP8RtV3YljpCzL/WtVXdaZIieq6jcB2Gn6KVU9n8Uuf6SqC7kiA0eo6neoTZyuqr93z3Aw+eVv4fcWMC8sfx9ADeJiALtynvLWz2f5/s0i8jUReV1EaiLyAv8/w7AfFpf9laouo6pfopa7KN/bVlX/qqo3qepfVHVzFvBYjBrIwe75duKYbWLYmqr+n6oex6rOP2S/V1DVX7JajVWKbgDYmmN3PfsRCgmb41HBHENEnhaRqzmWn1bVk62MvTvsTlLVwzmea9KMvFlVz2Lfh6vqTwAsxHXyRysjz7HYip+9VVXPUNW1RaTJ6+3HZ1qJY3mDqn6N7+2mqhdw/NZ13vX3i0ewQtARxFI/pqq/V9VNed/lVfVnqnqlqv6Xa8XWxQhaPd+i5nqWqv50ToU6ynpWhKfvC8QQ1rLSQPzMT11pomdV9W3+f5WrcnsIza3XOaFW/miFBK4iVLtv54nyIZ4uqqrnB5rVWtSUXktpVu7a81DzqHOTWPHIGwx3C0yJ8ar6PP9+mmbv1vz/ZgNyeeIqF4ao6p5Bdd2/8P/H+UzK34bFWLmnB5y6XyHWYt+7jX9f74qRfteZcy+xSGUPzcA1wxOemuSjHNOjnOAYQdNiLIt7Wlmq3/Dad7girAu6Cr11VwV6OjfmSK6DV505eX0wHh9yz7KtKwg6ldjZoezHZK65t6lhWdsvWAO2ZhYkDqn8/XVVXcXN/9F872L32olWBJfm3cscn2tZTPdmauR3u4IkE1T1LH7/QGqqk7iOalw3tr7Oc6XOXnLPcBHX1AT+/wSf+f31z+8f5QrHTuF9dqI2+oJbm1YV+2+c03lo0tdc8dvz5wTv4kDxq8X44NNVdW3neYKqnuAGfz43iD2quiInYFJQ9XYnfucXofngTpaNeY3HnFCZyMld1n1+bfbrNYdZDedkjaajYIQDoJ9wwvQcN+ETqdkczv+voYY0kqeZ8sStsnrxO9wcW7iqt5fwPj/n/x+hmamqepnr83f42kH8/zpukHvpRFiGm1hV9Vz3vW/ztU+wb5P47J/iMx/ohNVaEWG1mNswe7rXf8aN+SKFzOHuIKpzzPfh3K7MsZrIvlZYFr2Ha2QYn980jgV5SNVV1cpmfZrj8zX+b5WSr+ScVag1vM3n24fX/QG/94ecdbNZUOtvIjWbKoXRC5y7pTlmTxHXGq2qO/A7J7v1sjj/tgN7Ak3mLkIkrwVl3DemgDiT/5/JZz+N9ziaz/A218bC3Bvq6ixW3YFdpcBSat3z8LWL+dqPKJyWJ8asqroLr2Og/LWsxrz8YGhVQ03yiXP3x2rQAcAFIvKOiDwJ4HlktdUqANYBMB9NtZ+q6m+Q1T4DgA2Da/hn353XeJAndB3A/XTL7+I+76vl2ncPAPAKgEf5+wfOZLXJ2pr9GAngEgC70XW/Ha95Fs3gaTRDpwLYli7/W+gWXw3Atnze/wBYk4VCN0ZWh+8uANuwfwtxE5+ArO4e0Ff91tpXROQWEXkJWa06BTAvzaUfciwBYGWarPMBeFBE/ikiPSLyD2Q14axKcdimAbDwj+EAzEx+C8CzvN/izpxqcsxOFJH/cm5XRVab8FoRuYWu/PMB3E63+toAbuI4bwhgfQCjAfwGwII8aNbjXN3K+7zO3w0RmUJ3fJPXGAfgUoYu3MjvDQvXDc2iqojcgaxi964AzmVfvwHgMIYwXMy52xDAGhzLy0RkCoDXkNXjO1RVzwCwJYA3eIvJ6Kt+PIWVvT8EYFGO6+dU9UQAh9AE3cT1sQrgP7zHLfbsIvIAKz+/EJizFqxsISYT3X3fQ1bjb31kdRpPpRn/PIB/834buus1AHxdRG4XkecHI+xiqAkrdYtHE8JquHON24lX58K3mKaVAKwOYAkA5wC43F+DG6dBM2RXvrcfgJcAPMlFCAD7uFPVl7Q2QfoagNsA/I+/n3WfbRIP2R1Zkc61RWR3EbmN9zeB9i5Ptm4A73JBjuZnLuT11kNWxPJWAP8AsBT7uAaAOxgXtiA/OwJZ2fE1ef9/IyvjDSdY3nbeJNuQ81IArMt+/ZeCYZjf6KbpclOpF1auYOU7AJ7j+ztSKAiA3/H6p3B8pvCrNf5+2fVrHn7/HSf0QIEHHia3UihuwA3/DIBT+dktucmfA/BQgHuqeQPRV969AmAkx31k3v6w2DERmS4il4nIJ/lsTQAf4TX+xfWyg1tP/+F7DwP4NIDHARxKnPQSFis1HKzCtV51a7vOtb0CBclZXA9+f3TzHjZe3kNXDcbbH8RAX9ylfX4UrzMNQC/HrAvABLfW7N7TAbzjPZvtbl1DUFjVcrQu5amoqhoKsef5mYdFZK8UmG+TQZB2Ey7oiQBucIu2CmBHAJtSy7gPMwaE1nm9Kwiah63hTq9XzEnAzdHFINdHAOwFYD0RucgwFmox9/EZbwXwJoCDACwP4AIKxqkAvkMg9kre50ne81YR+VLO+AJAtwvWfIbfu05Evhsx0dfhnKykqqNFZAq1uqWcBhAegA0AZ3MM91XV20TkDPs849TUbR7TWrtcv17ka+uq6ggRmc6ajWuxPy+LyLuqehOyYOFNkFX4fU5VXwLwRW7sC1yQbzf6aujV/cFlj2sCF33VpFPeyEMB3CgiT/PlVzmO7/Ea9wJ4gHP8FoCnkVV2tmteCOBCzvlZdOhsJCI38PoKYBLX6YscozdE5KDE3L6v+TsAfYZ6garaDPZYTCFQMKVNVV+nYFoJwJoicpPht3zW8YFmZdXLB0UJGopmYBfiOYumiUjktZHISmRfDWBPgn+fUNXfEt/YOgD8bJL24v0uEJFPiMh+IrKPiOwN4CKeKru6e3nzbqb4lYjnyE7rinkrnSbyH2oNx9KrdTSAv7I/p3DRTQBwPc25UcjKpb8B4F5k5c57ANzM611JzeJIegw/qapnE+hfyZ2E4jTMCrXOZwF8hyDwvvToPE7Q+FFqMKsDOEtVP0mtayVukO5Q6+B1/wXgTPb7z8SJjlfV/wL4KseyK5hHda70ewFcR1Pj36r6aV5zFWrLT/C7F1ODXpFmIQDcQU10YQBXue5N5X02Ii73Ic5Ht4MTwL+9dhKGTOwB4HQA1zOk5gQAx/A7l3IcenmQLUoN+HwRmexCH25V1c+jr9w7vBnGg+i7qro95+CfALYkhvRJ9v9hVd3bKR5hkVAJFBKNfCYFxYCm4J84Pmeo6uf4rEdRUJ1PB1g3PigFkx0Auyi9GRNdZLQB7D8hmHqQ88xcxs+uwteWJgBvAZjmbVktjHkhgHgfgdVdXSDfMP69i/PSVFV1FcZfPeu8T3kR7PcxVmadiCfSQNo9Cbxae0dVjw1iX/ajd+ZGajSg96mHC77b3XcDev/qzqN0gaouyfcvIuC6cnCPDZ0nzrxvF7kYt7X5vl33XI7LO4mgUO9p/T/nbFCCvo8SVF/ceRtrrmiseYCXYziFf56zCPrbGK7OA+kltw7259w97u4hnNu/u/ivYwluj6dXb0F+dmf256/BfNlzLUEP6kT3XG/wwIEDrNfjGE1X1Y3dNT7MddR08/5tN49f4tpRzvFwOpXOZr9sHO9W1S35ndP43o7OAVBT1YvcvJxDT+iGgZfTfu/D7/zaAfBddG697Z71foZ9gGD+fXSaLDGYXsChxrpQoT0+nFpCj1NrFyUo+yKASfza4oyPek5Eaj6mhafqmyLyeOJ+w2hadQF4mqZZqLWtwN9Pub4hvF/iWVbgifk0Y600DNcgWDsvT95hAJ4XkZc9+wOF9QoAJovIq3xvBDWbt9xr9vkqwel5AbxOQNTuuQRB6Oe9GeTuswbHc7yIPBu8P4zvN0TkYQrsRQE8E8un87mCfMYV2O93ALxAh4J9dmEAi9GUn+KwL/v+6tQ0Xjezy/VLOI/C52rSK7ssTbJxweerxM26qZ1NJvjd4Lw2eCisSBN8fAosVtWlACzHf58VkfE+j47C/jEADxK38mbaCDpORtGkfTm49srUul7gczfd6wsDeNuvbR5ICwB4UUQmE49diZ+zNbUUscDn/Jp0YzOGYzmBz+LnYCkAyzBO7RGa5bZfVuSzPf+ByCEsE2kbntypeK3IZytD7dlSJ1BeRHJqjPIi+EtGv1dauW4LEeOSyuG0FJgy8Xd5r7US2T+QKP4ya8qFAsxP7elP1ES+FGgwlbw5aGUey67tATCFRBky5soYqn4MTiVnsmZaqDkbvkxeYKUo3SMwASotLI5KmU0e5F5JmU0bG4vE9SplBXfe92LP38oh4L8bxGNJ0fOUmc/EWCfXSiTHsvD7Bf2qBrl4ezmT6T4fhFl23lPvtTK3ZfdLC+uqmnOADLrwkkEUOpIA8I1ArzmHCM9qQO3SEiGZcxk3nNlS8V6aD9hhNAPR3awiVQxNnsG8DzMm9kcWivJvUuh009TUuY2Ica4069qhls7G5xneD9U7POm657QxyGMg6M+1QlNwsASiT5Ex3Mw5FmRWrvvQ+dDmueka7HXknCWz1fSTwXgwByD+CMDSyIDyJn/Phyym54yhTOrlnuMQZDE1Y5HFW/1QRJ4qOqEdgD4KwGEAdkIGIr+FLID09BDEnMsPLkta3hJZAO7qyMD+F5HFj50HoNbOsXCbuAtZLNMuAD4tIhd5jXmQNLj9AXwSGQA/DRnI/mcRuW8w5vyDsI4G7WQhyPiaxts/7WQNeIyqOZhJ1f9EbOlqyq6PRdWmeJu8qaKqn2F/JzjX/r08paUIOFfVpRhyEGv30O0rkeevRrCG2DhJ4pmqCd4ryeHEqgZjZq/vqarfpOu8WnSvPNOPSby9bgya7u9vuLmK9inn3r7P3cwh/LTjrBpO7EhV9UB+dlhwr66cNeL5moowvVEMj4i1XlVd3+M8/Zlz996mqnoMaW7C9yTUivPGNNDUwnstyXzJ7XP2WqlnKNrPs0tYLcDYlRqz5zdlQuo2jFkq5aHK8YJIYrMO2OPj7n2BJQq7/9VRkFRT/eKiNZaFB1V1Dz73R5kh//U8QrSy5qZfoAM1y0Lhwr9v5xyOKQJTU4cMf3+cwqlJ+pT1mbD8BcZSrZ5nGvrNUyAQhQnDDwfvL6Oqm/V3TMp+z/GuvUl2jTVUdSMyS/yX8X2Sx2VWYm9YfJyxbKybWo8lzEjJc1Tx9y68z09D4dyfZ+jvGA9muo1Fy3YhSzN4NNLpZZGlStxI8/BTDpR8NgC3d0KW/CvIIpUvoZm2DLIk3nEicg0HcS0AmyPLwboPwCeQxYdcaDFBqroqsujoewE8mVCjGwTDlyTetDCyBNTxXBixCbFUnj35bG/S9LD8tKf4vKG5uDayhOd5kSUmXywilp6yGrK8vauQRbPvDOBlAH9hykmXiNQZi7YXsjirpwH8V0TeVNXlkUV0X4ssCXgPmqGv8rl2R5bQPA5ZIuwr3BDbIosO7wVwuKreDuBO9nckgI8jS6Yexzl7KQSzkXElDQPwbY7XWUE60JPI8vlsLOoMzvw4TcW3OW+P2HpgHNSeyJJsp3At3MM+fQJZPNdIVf0UspiiO5HFGM1Lnq63VXVbZDFH19BcW5PwxJVBbNmByOKynuX4r4sszugRH+vFMVkWGSdUDcDXROQs95z3hE4bzutuyOLVnuTYv8s1vCLvdQ3HYX9kuainuf6vzXvtrqpjAdxMcH99ZJkJGwLYHsAvkcWT7cZ10ABwpYjcZA4O9mddZClSY5HlU57HGLg9uAbWoWZ6O/pi2jbnPUZzr53v9tia7MvVNId3B3Ay1902NMu7kWVhXMW9NesqQQWApnH+HMUo6c0ZWTsPP3OYM4ledmbBy4z+rZAD6fSISv1HqqxLkGenThqViqOw2IafeYT/f9j18198ba+INmGn+A6MHn+VGkavqh5Rxtulqn/g85xt4LozNyreTcwo73rwfNc4ttKfGLcVaUKsnU9zRvjszwbXuIv3+Cz/v9rR767J6O0L3JgrTfcNaDo95zikVFWvYX88N9c4x8kVRkb7KPPp1FK3ctHk3twwbWG1gAfcKK4P5vsjSbujjFK3/u1Ec6jXmVyqqv/h967l/1vw/xvYn1sD0/Rzzkz8W9AH43L6Y/Ccnsdfuf6GRUxICSAG63/NhTlYFP6RLoL9tWDOuwPeqyZpZYap6vcdldJ0vrckyfrsOdTHf/F+RwTR8UqywM+5+zT4sxu/84OISX+1i2T/vuNUm8K/lyPVUJOvTebrn+6PdjgYwipsazthVecG2ocsh2d4fiVHwHYXTYeNiBupqu7Lz2zL69zo1PDvuT59NuC1WpLpEY87DiqJqL97u42qqvpVt6G+Q+0p6u1xnO7fT/FW8/d2jjRtc177Ir72S7co6lyg61Itn8AFtCoX7/2Od2glVf2iqh7J7x/E79eYN7gfv/MLfucIJ1TGuxSj9SmwXqGQMRJDC3b8DP/fjIvumlgwKSGAJj+zUmzMnPA2QsI/8Dk+ST6tiVzoFW7kPShs9+QGsnvvxDm7m2lCxqp6Hj9nJrzxNP2bgvub7KORHW7tyOo249hcy2uckhBWX+U1riqAF5bn80ziXC5HVlu/7j/Hez3P9b09hdZkjssyzLdskrlzVX7vOM51L6mC9uKYfZppPAuRSHI857bCZ5vMegF7kEvsOB7Wo5zQ+SvfG0FIp8E9vhnX7Tn8nI3Pt11fjicUMIr03u/xWsPZx/lmuYc8EFZ20v+D+UW/Yk6YSd5DPQmZmWeUuM9zUAw32st95pOcpHPc/U52QuVO3t8W0cIur88T4x8f0apsQe3GgX7Abc7bSSxnzJaHR75v/bmcn/lZQnOznEdbpF9x769JQfQUN+APvXDgZ4wJdRXHiHl/Yk4O5vtnutfm52J9lyfdjlx0pjGZm9/yvobz/4WYh/c2D5idicM9yUW5fIhtUej1cF5XiQSXdvP3ctw042nWWF9PYp8Oc6+NpgZ4EEkJH3T9m6yq1wdjcFGAN17BNWS5m4tyLO7i/8aO+i13DcNuTgvWiq2zr/P9myJBoBU3hmZR/M69vygP7Unc0J+O3P9KjrHlzZ7Fz2zoPvMj04oSoRMr8OAxMsDhpNZ+v5pNZP3sF77PvRyu2w/xoHiGz/u1sC/BQXEmKa2rZQTVYGJWFYfpnEKysjDeyAbxPffaO8QhqsQe5uPnXuFnBBnvFIinGCXJRQA+Txv4Wtr+3aoKBuWdC+ALyKhEdqat/3eHr7nuaReA/2MfvkksrIqM8OwyhmPcB+Bv/E4zeO4GMaOdkWXKV4jddCELfmygj5Zkcd7/FTcGbyFjCFgQWc6g9W80r+XrDvYiy9kCyETATdEkftbjPvuUC8KcD318RT/meNT4vbvZ34pbJ/Or6lvI8s9GIMt7/Amfo8HvPpzA8cYRu1scGSXOUzRZGhyLGvs9D/vzOIBJ7jme5u8luaB/znCSabzfCPSR/Y3gZ0dxPN+ngwnm6n1WAj7n6GBcF+Lfr7t5mRa5hm/P8DsfArCyPSeygOAGgB72fwyvMc5dezqynNelMCOp4VRHGVPnmjRw22L/RqlqN/NVrf8P8XvdAGr0thqEUeVcvM2/l+P3nmN/ungv4dwYb9UwF9w6P78zLli3kzl2I9z4vOS403qQMVSMBPAZ/jyrqoeIyC15ISWDGeQlblKHzfDGzEnAC5GFsEZBMC8yuozJyHiCFMBS/IzfnK9zU41Exu9U4wQcwkIRNfeM57I//0dA8E4ReTIoWGng8GgC0XVkDKAQkUOREdmtT6D9RBHp4eBq4FgAMr6iBgHor7LoQ52g5HaWLY8+HqRV3BgsQUEyHjMWZuhiX9W91k2wvQFgVYLUPbxWTzDPVceOaeP7LoBtRGRVEVlTRNYWkU2YyGw8RYosIbaOjN9oMoXPpiKymoh8CBm54AbIkpHBQgZN9ud1AsWCjPZkJRHpJag7kif3PHzeidw8i9tzcPNXeO2dAHwTwPnISAk35HdmmgOOQchk2gzmSR05oD+8x/O19d28LMz3UuR1NyJLXF4IwM9UdYx7zpVVdT+ulUl8ng+5a4/mAfK2Ac1uvzRcH31Zd+OfmuL2VKPva9Igl9dGFPDPICMDXJmOpZFc42/x2uuyP9Nsr7G/dd6nl683uW6E827PsAj37jgKdhNi3Z4eSUQeFZHtkSXG/xlZIvRRs9sbaCfVUaSusNPgKRE51X32AFV9HBkn1bH8zHWc5PPpJTxBVXv53gkcqH/QG/M1et6+gSxL/VwAv6BHqcHT7HZ6OPbkPX8WaEJw6TDv8nRfHsAvycW9IDIuJWt7q+r5ln1uAss2KBfunwEcDuBXqvpRamMr0MM0nmDqf5BVBP66qo6nAP4uBfw/AyK1RuBpVQo183puBOBUVf07N/UKyIj7ugLtr5uZ+ecB+BaAk0iVO4yL5k43Pg0uwq+o6j0icqOqXgjgawB+R3xiAb5/roicHgb7ckyPp9d2LXqtzqEWvT0yksOfiMixxHs+g4w/6VcUVIdRIF3Ov8F5rrG/CzpNxDbxCgRtHxCRhznPRp/shYwEAt0YJK5AFtT8eVWdSM3nq9FTua8K0DusNHQ+vbLL8nlGA9ibmuFr9HxNAnAgzdf7kJEFjgXwRzKADA/6ZxqRp9fu4fv7qOowWi919LHaWluQz/cqBcm+yNhVJ3DOr+D8fE5Vn+U+OQDAoyJyEsdEAGxBcP1OZNxiXwHwVVV9hdbOMbzefxxBZhj0LTRtKwD+gj5esimzM85q3oh3ytqt/Mwh/P8p5xUwr9eizoPyfeepML6l4/nepsS0HnFVXM4LMCWjQjYQ9Q0HvFYSIOh6zotobTIryxge9RfHfyURwNiKGkwKrjOO8UVmq38x4EYyMNOqv3wneJ6KC1LdgK9t5Lyg1m7gs5uD4Tjn6RIC1P+KzM/33Dx+O6hsM5J417nBd+qq+vWCMV2Hc6sRz6d5f5ckNuPby84Dta6r8jOJ+OQ4YmuWFvJf992rA4eH9waqC9JcmWvjdtffzxJ0VmJ01/HvU2OeKzefu7niDD4g9HRXGWlP9xzWznFcaYdFMKFrAgfV3sQCrX/zONzsULdWFnEVjd4ivvgEAfuxzpH1btCf45xDyu+Fb7p1+3bgETzd8a4ZZnWM64uPPzQP+PNuHVfzTLXBElpdNIHmc2qzsXq+ISJ30h39V2ImZyIrrvAatappAU/TGrweAPxPRB7hfVZivMlDIvIMF9p8yDi4J4nIzS4eZjvGfPxLRD6Vso/d5+djrNFiNHvuIDfQPDQH5wFwE6l+JYf3aCV+fgyywgD3iMhrQZzVsny+UYzjudd9fylqJA+y2ARUdSOaG7eijwNqHppFi/Kku4vXXpzXfoRxRzPEspAYbjXiZPeRGtivja2pqj/EsbfYt82p+UxBxmL6Qmoc3HN2UQNc0eFs9zrtxGo8Wp/e4bXfcPFJFp83BRkz57LEUO5247AzNZp7aJqtQ9P+Nl5zM2oy14vIezwYtgUwUURu844I9uMRaoYXAjhJRL4aWz/uGcbwHktyXB8WkceCOKux/MwCtDbuDOZ8I66VV9w8Lco+T+Frm9Ccep5rYUmulXs9vxar4uxIy+QimmhrIGOiNZN9JWpcwrX2uPv+Ehyf6ciKUbzh1u1G1PoedfvS+LPW5rO/5K41gnGQy3EubiVUMKRTc8yl/uscDU2K+H+KItiZKrKui7XZtUiK50TndrWiZeZFibtnzIuEL8sdVSkTnV9yvCqp75ZJM+pP5LKPPSuIX6u0Yd1Jic+MZCzfvtRAV2MBWFXVA/LWT1F0eg5HVEvca63wivVnnRZEt+fRM7WcSTLb+bEieUP2Myx04bocriJ+n2okRif1mt3nxCCobnjJBTtD3lgkn67Sz3HI4wvKy4ULXeF5uWyVWG5gif6l8jK7EnxJ1RbHYqY80BRhYk4OZJgrV0nMf7WAw6oae07+vYYLFp3sTJazKcgqJQ6Coly8dsx5JWSZKJE3GhWYefMZfr/F75TKYS3jsZstQozq4PoEU68XkYvbzcLg7rMfspSBhwD8nmp/J0u90/I0EaGJthvNGasn+E+acJ31M4vb/wO0yuzdFPOBlQAAAABJRU5ErkJggg==" alt="EpoxyGarageFloors.ai" style="height:60px;width:auto">
    <div>
      <h1 style="line-height:1.1">Growth Dashboard</h1>
      <div style="font-size:11px;color:var(--muted);letter-spacing:0.5px;text-transform:uppercase;margin-top:2px">The AI-powered growth system for coating contractors</div>
    </div>
  </div>
  <div class="status-pills">
    <span class="pill" id="pill-bl">BrightLocal</span>
    <span class="pill" id="pill-cc">CompanyCam</span>
    <span class="pill" id="pill-fb">Facebook</span>
    <span class="pill" id="pill-gbp">Google</span>
    <span class="pill" id="pill-ct">Citations</span>
    <span class="pill" id="pill-web">Website</span>
  </div>
</header>

<div class="grid">

  <section class="panel" id="schedule-panel" style="grid-column: 1 / -1">
    <h2><span class="dot" style="background: var(--green)"></span>Upcoming installs — what to order</h2>
    <div id="sched-weeks" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px"></div>
    <div style="font-size:11px;color:var(--muted);margin-top:10px" id="sched-rates"></div>
  </section>

  <section class="panel" id="website-panel">
    <h2><span class="dot" style="background: #38bdf8"></span>Website — last 7 days</h2>
    <div class="stats" id="web-stats"></div>
    <div class="section-label" style="margin-top:0">Where visitors came from</div>
    <div id="web-channels"></div>
  </section>

  <section class="panel" id="brightlocal-panel">
    <h2><span class="dot" style="background: var(--blue)"></span>BrightLocal — local rankings</h2>
    <div class="stats" id="bl-stats"></div>
    <div id="bl-keywords"></div>
    <div id="bl-reviews"></div>
  </section>

  <section class="panel" id="companycam-panel">
    <h2><span class="dot" style="background: var(--green)"></span>CompanyCam — job documentation</h2>
    <div class="alert-banner" id="cc-alert"></div>
    <div class="stats" id="cc-stats"></div>
    <div class="section-label">Latest photos from the field</div>
    <div class="photo-grid" id="cc-photos"></div>
    <div class="section-label">Jobs</div>
    <div id="cc-projects"></div>
  </section>

  <section class="panel" id="facebook-panel">
    <h2><span class="dot" style="background: #818cf8"></span>Facebook — ads and scheduled posts</h2>
    <div class="stats" id="fb-stats"></div>
    <div id="fb-campaigns"></div>
    <div id="fb-scheduled"></div>
  </section>

  <section class="panel" id="gbp-panel">
    <h2><span class="dot" style="background: var(--amber)"></span>Google Business Profile — last 7 days</h2>
    <div class="stats" id="gbp-stats"></div>
    <div id="gbp-extra"></div>
  </section>

  <section class="panel" id="citations-panel" style="grid-column: 1 / -1">
    <h2><span class="dot" style="background: #f472b6"></span>Citations — NAP consistency and coverage</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px" id="ct-cols">
      <div>
        <div class="section-label" style="margin-top:0">Master NAP record</div>
        <div id="ct-nap" style="background:#10151d;border:1px solid var(--tile-edge);border-radius:10px;padding:12px;font-size:13px;line-height:1.7;margin-top:8px"></div>
        <div class="stats" id="ct-stats" style="margin-top:12px;margin-bottom:0"></div>
        <div id="ct-campaign"></div>
      </div>
      <div>
        <div class="section-label" style="margin-top:0">Top live citations</div>
        <div id="ct-active"></div>
      </div>
      <div>
        <div class="section-label" style="margin-top:0">Next opportunities</div>
        <div id="ct-opps"></div>
      </div>
    </div>
  </section>

</div>

<footer>Powered by <strong style="color:var(--text)">EpoxyGarageFloors.ai</strong> · auto-refreshes every 5 minutes · <span id="last-updated"></span></footer>

<script>
const fmtAgo = (unix) => {
  if (!unix) return "";
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
};
const esc = (str) => String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

async function loadBrightLocal() {
  const data = await (await fetch("/api/brightlocal/summary")).json();
  const pill = document.getElementById("pill-bl");
  pill.textContent = "BrightLocal · " + (data.source === "live" ? "live" : "demo data");
  pill.className = "pill " + (data.source === "live" ? "live" : "mock");

  const kws = data.keywords || [];
  const top3 = kws.filter(k => k.rank && k.rank <= 3).length;
  const improved = kws.filter(k => k.change > 0).length;
  const best = kws.length ? Math.min(...kws.map(k => k.rank ?? 999)) : "—";

  document.getElementById("bl-stats").innerHTML = \`
    <div class="stat"><div class="n">\${best}</div><div class="l">Best rank</div></div>
    <div class="stat"><div class="n">\${top3}</div><div class="l">Top 3 spots</div></div>
    <div class="stat"><div class="n">\${improved}</div><div class="l">Moved up</div></div>\`;

  document.getElementById("bl-keywords").innerHTML = kws.map(k => {
    const cls = k.change > 0 ? "up" : k.change < 0 ? "down" : "flat";
    const arrow = k.change > 0 ? "▲" + k.change : k.change < 0 ? "▼" + Math.abs(k.change) : "—";
    return \`<div class="row">
      <span class="label">\${esc(k.keyword)}</span>
      <span style="display:flex;gap:10px;align-items:baseline">
        <span class="rank">#\${k.rank ?? "–"}</span>
        <span class="delta \${cls}">\${arrow}</span>
      </span>
    </div>\`;
  }).join("") || '<div class="row"><span class="label" style="color:var(--muted)">No rank campaigns found on this account</span></div>';

  const r = data.reviews;
  document.getElementById("bl-reviews").innerHTML = !r ? "" : \`
    <div class="row" style="margin-top:6px">
      <span class="label">Reviews: <strong>\${r.averageRating}★</strong> avg · \${r.totalReviews} total</span>
      <span class="badge \${r.awaitingReply?.length ? "warn" : "ok"}">
        \${r.awaitingReply?.length ? r.awaitingReply.length + " awaiting reply" : "All replied"}
      </span>
    </div>
    \${(r.awaitingReply || []).map(rv => \`
      <div class="review-card">
        <span class="who">\${esc(rv.author)}</span> · <span class="stars">\${"★".repeat(rv.rating)}</span>
        · <span style="color:var(--muted)">\${esc(rv.site)}, \${rv.daysOld}d old</span>
        <div class="txt">\${esc(rv.snippet)}</div>
      </div>\`).join("")}\`;
}

async function loadCompanyCam() {
  const data = await (await fetch("/api/companycam/summary")).json();
  const pill = document.getElementById("pill-cc");
  pill.textContent = "CompanyCam · " + (data.source === "live" ? "live" : "demo data");
  pill.className = "pill " + (data.source === "live" ? "live" : "mock");

  const missing = data.projectsMissingPhotos || [];
  const alertEl = document.getElementById("cc-alert");
  if (missing.length) {
    alertEl.textContent = "⚠ No recent photos: " + missing.join(" · ");
    alertEl.classList.add("show");
  } else {
    alertEl.classList.remove("show");
  }

  const projects = data.activeProjects || [];
  const active = projects.filter(p => !p.stale).length;

  document.getElementById("cc-stats").innerHTML = \`
    <div class="stat"><div class="n">\${data.photosToday ?? 0}</div><div class="l">Photos today</div></div>
    <div class="stat"><div class="n">\${active}</div><div class="l">Active jobs</div></div>
    <div class="stat"><div class="n">\${missing.length}</div><div class="l">Need photos</div></div>\`;

  const photos = (data.latestPhotos || []).slice(0, 6);
  document.getElementById("cc-photos").innerHTML = photos.length ? photos.map(p => \`
    <div class="photo-tile">
      <img src="\${esc(p.thumb)}" alt="\${esc(p.projectName)}" loading="lazy">
      <div class="cap">\${esc(p.projectName || "")}
        <span class="meta">\${esc(p.creator)}\${p.creator ? " · " : ""}\${fmtAgo(p.capturedAt)}</span>
      </div>
    </div>\`).join("") :
    '<div style="grid-column:1/-1;color:var(--muted);font-size:13px;padding:8px 0">Photos will appear here as the crew uploads to CompanyCam</div>';

  document.getElementById("cc-projects").innerHTML = projects.slice(0, 5).map(p => \`
    <div class="row">
      <span class="label">\${esc(p.name)}<span class="sub">\${esc(p.address)} · last activity \${fmtAgo(p.lastActivity)}</span></span>
      <span class="badge \${p.stale ? "alert" : p.photosToday > 0 ? "ok" : "warn"}">
        \${p.stale ? "Stale" : p.photosToday > 0 ? p.photosToday + " photos today" : "No photos yet"}
      </span>
    </div>\`).join("");
}

async function loadFacebook() {
  const data = await (await fetch("/api/facebook/summary")).json();
  const pill = document.getElementById("pill-fb");
  pill.textContent = "Facebook · " + (data.source === "live" ? "live" : "demo data");
  pill.className = "pill " + (data.source === "live" ? "live" : "mock");

  const w = data.week || {};
  document.getElementById("fb-stats").innerHTML = \`
    <div class="stat"><div class="n">$\${(w.spend ?? 0).toFixed(2)}</div><div class="l">Spend 7d</div></div>
    <div class="stat"><div class="n">\${w.leads ?? 0}</div><div class="l">Leads 7d</div></div>
    <div class="stat"><div class="n">\${w.costPerLead != null ? "$" + w.costPerLead.toFixed(2) : "—"}</div><div class="l">Cost / lead</div></div>\`;

  document.getElementById("fb-campaigns").innerHTML = (data.campaignsToday || []).map(c => \`
    <div class="row">
      <span class="label">\${esc(c.campaign)}<span class="sub">today</span></span>
      <span style="display:flex;gap:12px;align-items:baseline;font-size:13px">
        <span>$\${c.spend.toFixed(2)}</span>
        <span class="badge \${c.leads > 0 ? "ok" : "warn"}">\${c.leads} lead\${c.leads === 1 ? "" : "s"}</span>
      </span>
    </div>\`).join("") || '<div class="row"><span class="label" style="color:var(--muted)">No active campaigns today</span></div>';

  const posts = data.scheduledPosts || [];
  document.getElementById("fb-scheduled").innerHTML = !posts.length ? "" :
    '<div class="row" style="margin-top:6px"><span class="label" style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Scheduled posts</span></div>' +
    posts.map(p => \`
      <div class="row">
        <span class="label">\${esc(p.message)}</span>
        <span class="badge ok">\${new Date(p.publishAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
      </div>\`).join("");
}

async function loadGbp() {
  const data = await (await fetch("/api/gbp/summary")).json();
  const pill = document.getElementById("pill-gbp");
  pill.textContent = "Google · " + (data.source === "live" ? "live" : "demo data");
  pill.className = "pill " + (data.source === "live" ? "live" : "mock");

  const d = data.last7Days || {};
  document.getElementById("gbp-stats").innerHTML = \`
    <div class="stat"><div class="n">\${d.views ?? 0}</div><div class="l">Profile views</div></div>
    <div class="stat"><div class="n">\${d.calls ?? 0}</div><div class="l">Calls</div></div>
    <div class="stat"><div class="n">\${d.directions ?? 0}</div><div class="l">Directions</div></div>\`;

  document.getElementById("gbp-extra").innerHTML = \`
    <div class="row">
      <span class="label">Website clicks from profile</span>
      <span class="rank">\${d.websiteClicks ?? 0}</span>
    </div>
    \${data.nextQueuedPost ? \`<div class="row">
      <span class="label">Next queued post<span class="sub">\${esc(data.nextQueuedPost)}</span></span>
      <span class="badge warn">Queued</span>
    </div>\` : ""}\`;
}

async function loadCitations() {
  const data = await (await fetch("/api/citations/summary")).json();
  const pill = document.getElementById("pill-ct");
  pill.textContent = "Citations · " + (data.source === "live" ? "live" : "demo data");
  pill.className = "pill " + (data.source === "live" ? "live" : "mock");

  const nap = data.nap || {};
  document.getElementById("ct-nap").innerHTML = \`
    <strong>\${esc(nap.name)}</strong><br>\${esc(nap.address)}<br>\${esc(nap.phone)}<br>
    <span style="color:var(--muted)">\${esc(nap.website)}</span>\`;

  const c = data.counts || {};
  document.getElementById("ct-stats").innerHTML = \`
    <div class="stat"><div class="n">\${c.active ?? 0}</div><div class="l">Live</div></div>
    <div class="stat"><div class="n">\${c.pending ?? 0}</div><div class="l">Pending</div></div>
    <div class="stat"><div class="n">\${c.opportunities ?? 0}</div><div class="l">To build</div></div>\`;

  const camp = data.campaignInProgress;
  document.getElementById("ct-campaign").innerHTML = !camp ? "" : \`
    <div class="row" style="margin-top:8px">
      <span class="label">\${esc(camp.name)}<span class="sub">building now</span></span>
      <span class="badge warn">\${camp.submitted}/\${camp.total} submitted</span>
    </div>\`;

  document.getElementById("ct-active").innerHTML = (data.topCitations || []).map(x => \`
    <div class="row">
      <span class="label">\${esc(x.source)}<span class="sub">\${esc(x.siteType)}</span></span>
      <span class="badge ok">DA \${x.domainAuthority ?? "—"}</span>
    </div>\`).join("");

  document.getElementById("ct-opps").innerHTML = (data.opportunities || []).map(x => \`
    <div class="row">
      <span class="label">\${esc(x.source)}<span class="sub">\${esc(x.siteType)}</span></span>
      <span class="badge warn">DA \${x.domainAuthority ?? "—"}</span>
    </div>\`).join("");
}

async function loadSchedule() {
  const data = await (await fetch("/api/schedule/summary")).json();
  const sysBadge = { flake: "ok", solid: "warn", metallic: "alert" };
  document.getElementById("sched-weeks").innerHTML = (data.weeks || []).map(w => \`
    <div style="background:#10151d;border:1px solid var(--tile-edge);border-radius:10px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <strong style="font-size:14px">\${esc(w.label)}</strong>
        <span style="font-size:12px;color:var(--muted)">\${w.materials.jobs} job\${w.materials.jobs === 1 ? "" : "s"} · \${w.materials.sqft.toLocaleString()} sq ft</span>
      </div>
      <div style="margin-top:8px">
        \${w.jobs.map(j => \`
          <div class="row" style="padding:6px 0">
            <span class="label">\${esc(j.name)}<span class="sub">\${new Date(j.date + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · \${j.sqft.toLocaleString()} sq ft</span></span>
            <span class="badge \${sysBadge[j.system] || "ok"}">\${esc(j.system)}</span>
          </div>\`).join("") || '<div style="color:var(--muted);font-size:13px;padding:6px 0">Nothing scheduled</div>'}
      </div>
      <div style="border-top:1px solid var(--tile-edge);margin-top:8px;padding-top:8px;font-size:13px;line-height:1.8">
        <strong style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Order for this week</strong><br>
        Base coat: <strong>\${w.materials.baseKits} kit\${w.materials.baseKits === 1 ? "" : "s"}</strong> ·
        Flake: <strong>\${w.materials.flakeLbs} lbs</strong> ·
        Topcoat: <strong>\${w.materials.topKits} kit\${w.materials.topKits === 1 ? "" : "s"}</strong>
      </div>
    </div>\`).join("");
  const r = data.rates || {};
  document.getElementById("sched-rates").textContent =
    \`Coverage assumptions: base coat \${r.baseSqftPerKit} sq ft/kit · flake \${r.flakeLbsPerSqft} lb/sq ft (full broadcast) · topcoat \${r.topSqftPerKit} sq ft/kit — adjust in .env to match your supplier, and always verify against spec sheets before ordering.\`;
}

async function loadWebsite() {
  const data = await (await fetch("/api/website/summary")).json();
  const pill = document.getElementById("pill-web");
  pill.textContent = "Website · " + (data.source === "live" ? "live" : "demo data");
  pill.className = "pill " + (data.source === "live" ? "live" : "mock");

  const d = data.last7Days || {};
  const chg = d.sessionsChangePct;
  document.getElementById("web-stats").innerHTML = \`
    <div class="stat"><div class="n">\${d.sessions ?? 0}\${chg != null ? \` <span style="font-size:12px" class="\${chg >= 0 ? "up" : "down"}">\${chg >= 0 ? "▲" : "▼"}\${Math.abs(chg)}%</span>\` : ""}</div><div class="l">Visits</div></div>
    <div class="stat"><div class="n">\${d.users ?? 0}</div><div class="l">People</div></div>
    <div class="stat"><div class="n">\${d.conversions ?? 0}</div><div class="l">Leads / actions</div></div>\`;

  const max = Math.max(...(data.channels || []).map(c => c.sessions), 1);
  document.getElementById("web-channels").innerHTML = (data.channels || []).map(c => \`
    <div class="row" style="padding:7px 0">
      <span class="label" style="min-width:110px">\${esc(c.channel)}</span>
      <span style="flex:1;display:flex;align-items:center;gap:8px">
        <span style="height:8px;border-radius:4px;background:#38bdf8;flex:0 0 \${Math.round((c.sessions / max) * 100)}%"></span>
        <span style="font-size:12px;color:var(--muted)">\${c.sessions}</span>
      </span>
    </div>\`).join("");
}

async function refresh() {
  try { await Promise.all([loadBrightLocal(), loadCompanyCam(), loadFacebook(), loadGbp(), loadCitations(), loadSchedule(), loadWebsite()]); } catch (e) { console.error(e); }
  document.getElementById("last-updated").textContent =
    "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
refresh();
setInterval(refresh, 5 * 60 * 1000);
</script>
</body>
</html>
`;

// ---------------- server ----------------


loadDotEnv();

const PORT = process.env.PORT || 3000;
const CC_TOKEN = process.env.COMPANYCAM_TOKEN || "";
const BL_KEY = process.env.BRIGHTLOCAL_API_KEY || "";
const BL_CAMPAIGN = process.env.BRIGHTLOCAL_CAMPAIGN_ID || null;
const FB_TOKEN = process.env.FB_ACCESS_TOKEN || "";
const FB_AD_ACCOUNT = process.env.FB_AD_ACCOUNT_ID || "";
const FB_PAGE = process.env.FB_PAGE_ID || "";
const GBP_READY = !!(process.env.GBP_CLIENT_ID && process.env.GBP_CLIENT_SECRET && process.env.GBP_REFRESH_TOKEN && process.env.GBP_LOCATION_ID);
const CT_READY = !!(BL_KEY && process.env.BRIGHTLOCAL_CT_REPORT_ID);
const GA_READY = !!(process.env.GA4_PROPERTY_ID && process.env.GBP_REFRESH_TOKEN);
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = {};

async function cached(key, fn) {
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  const data = await fn();
  cache[key] = { at: Date.now(), data };
  return data;
}

function safe(name, mock) {
  return async (fn, configured) => {
    if (!configured) return mock();
    try { return await cached(name, fn); }
    catch (err) { console.error(err.message); return { ...mock(), error: err.message }; }
  };
}

const ccSafe = safe("cc", companycam.getMockSummary);
const blSafe = safe("bl", brightlocal.getMockSummary);
const fbSafe = safe("fb", facebook.getMockSummary);
const gbpSafe = safe("gbp", gbp.getMockSummary);
const ctSafe = safe("ct", () => citations.getMockSummary(process.env));
const webSafe = safe("web", website.getMockSummary);
const schedSafe = safe("sched", () => schedule.getMockSummary(process.env));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/companycam/summary")
      return json(res, await ccSafe(() => companycam.getSummary(CC_TOKEN), !!CC_TOKEN));
    if (url.pathname === "/api/brightlocal/summary")
      return json(res, await blSafe(() => brightlocal.getSummary(BL_KEY, BL_CAMPAIGN), !!BL_KEY));
    if (url.pathname === "/api/facebook/summary")
      return json(res, await fbSafe(() => facebook.getSummary(FB_TOKEN, FB_AD_ACCOUNT, FB_PAGE), !!(FB_TOKEN && FB_AD_ACCOUNT)));
    if (url.pathname === "/api/gbp/summary")
      return json(res, await gbpSafe(() => gbp.getSummary(process.env), GBP_READY));
    if (url.pathname === "/api/citations/summary")
      return json(res, await ctSafe(() => citations.getSummary(process.env), CT_READY));
    if (url.pathname === "/api/website/summary")
      return json(res, await webSafe(() => website.getSummary(process.env), GA_READY));
    if (url.pathname === "/api/schedule/summary") {
      const hasGhl = !!(process.env.GHL_API_KEY && process.env.GHL_LOCATION_ID && process.env.GHL_CALENDAR_ID);
      const hasFile = fs.existsSync(path.join(__dirname, "jobs.json"));
      return json(res, await schedSafe(() => schedule.getSummary(process.env), hasGhl || hasFile));
    }
    if (url.pathname === "/api/status")
      return json(res, {
        companycam: CC_TOKEN ? "configured" : "mock",
        brightlocal: BL_KEY ? "configured" : "mock",
        facebook: FB_TOKEN && FB_AD_ACCOUNT ? "configured" : "mock",
        googleBusinessProfile: GBP_READY ? "configured" : "mock",
        citations: CT_READY ? "configured" : "mock",
        website: GA_READY ? "configured" : "mock",
      });
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(INDEX_HTML);
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

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

server.listen(PORT, () => {
  console.log(`EpoxyGarageFloors.ai dashboard running at http://localhost:${PORT}`);
  console.log(`Schedule: ${(process.env.GHL_API_KEY && process.env.GHL_CALENDAR_ID) ? "GoHighLevel" : fs.existsSync(path.join(__dirname, "jobs.json")) ? "jobs.json" : "demo mode"}`);
  console.log(`Website (GA4): ${GA_READY ? "live" : "demo mode"}`);
  console.log(`CompanyCam: ${CC_TOKEN ? "live" : "demo mode"}`);
  console.log(`BrightLocal rankings: ${BL_KEY ? "live" : "demo mode"}`);
  console.log(`Citations: ${CT_READY ? "live" : "demo mode"}`);
  console.log(`Facebook: ${FB_TOKEN && FB_AD_ACCOUNT ? "live" : "demo mode"}`);
  console.log(`Google Business Profile: ${GBP_READY ? "live" : "demo mode"}`);
});
