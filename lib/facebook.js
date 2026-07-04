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

// Exchanges the user token for a Page access token (needed to post as the Page).
// Requires pages_show_list + pages_manage_posts on the token, and the user
// must be an admin of the page.
async function getPageAccessToken(userToken, pageId) {
  const data = await fbFetch(`/${pageId}`, userToken, { fields: "access_token" });
  if (!data.access_token) throw new Error("Facebook: could not get a Page access token — check pages_show_list/pages_manage_posts permissions");
  return data.access_token;
}

// Publishes a photo + caption to the Page's feed right now.
async function publishPhoto(pageAccessToken, pageId, photoUrl, caption) {
  const qs = new URLSearchParams({ access_token: pageAccessToken, url: photoUrl, caption });
  const res = await fetch(`${GRAPH}/${pageId}/photos?${qs.toString()}`, { method: "POST" });
  const data = await res.json();
  if (data.error) throw new Error(`Facebook publish: ${data.error.message}`);
  return { id: data.id, postId: data.post_id || data.id };
}

// Organic post performance over the last N days. Uses likes/comments/shares
// counts rather than the full Insights API, which needs read_insights (extra
// app review) — this needs only the permissions the dashboard already asks for.
async function getOrganicPerformance(token, pageId, days = 30) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const data = await fbFetch(`/${pageId}/posts`, token, {
    fields: "message,created_time,permalink_url,full_picture,likes.summary(true),comments.summary(true),shares",
    since: String(since),
    limit: "50",
  });
  const posts = (data.data || []).map((p) => {
    const likes = p.likes?.summary?.total_count || 0;
    const comments = p.comments?.summary?.total_count || 0;
    const shares = p.shares?.count || 0;
    return {
      id: p.id,
      message: (p.message || "").slice(0, 140),
      createdAt: p.created_time,
      permalink: p.permalink_url || null,
      photo: p.full_picture || null,
      likes,
      comments,
      shares,
      engagementScore: likes + comments * 2 + shares * 3,
    };
  });
  posts.sort((a, b) => b.engagementScore - a.engagementScore);
  return posts;
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

module.exports = { getSummary, getMockSummary, getAdInsights, getScheduledPosts, getPageAccessToken, publishPhoto, getOrganicPerformance };
