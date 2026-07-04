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

module.exports = { getSummary, getMockSummary, getRankCampaigns, getRankResults };
