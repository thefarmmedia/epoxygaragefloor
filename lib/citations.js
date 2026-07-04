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
      name: "Ozarks Concrete Coatings",
      address: "1788 N Woodview Rd Unit B, Nixa, MO 65714",
      phone: "(417) 402-6821",
      website: "ozarksconcretecoatings.com",
    },
    counts: { active: 12, pending: 4, opportunities: 27 },
    topCitations: [
      { source: "google.com", domainAuthority: 100, siteType: "Search Engine", status: "active" },
      { source: "facebook.com", domainAuthority: 96, siteType: "Social", status: "active" },
      { source: "bbb.org", domainAuthority: 92, siteType: "Business Directory", status: "active" },
      { source: "applemaps.com", domainAuthority: 90, siteType: "Search Engine", status: "active" },
      { source: "mapquest.com", domainAuthority: 82, siteType: "Trade Directory", status: "active" },
      { source: "yellowpages.com", domainAuthority: 80, siteType: "Business Directory", status: "active" },
    ],
    opportunities: [
      { source: "yelp.com", domainAuthority: 93, siteType: "Review Site" },
      { source: "bing.com", domainAuthority: 88, siteType: "Search Engine" },
      { source: "manta.com", domainAuthority: 62, siteType: "Business Directory" },
      { source: "merchantcircle.com", domainAuthority: 58, siteType: "Business Directory" },
      { source: "cortera.com", domainAuthority: 54, siteType: "Business Directory" },
    ],
    campaignInProgress: null,
  };
}

module.exports = { getSummary, getMockSummary, getCitationResults };
