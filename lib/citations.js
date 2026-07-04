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

module.exports = { getSummary, getMockSummary, getCitationResults };
