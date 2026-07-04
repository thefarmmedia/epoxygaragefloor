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

module.exports = { getSummary, getMockSummary, getAdInsights, getScheduledPosts };
