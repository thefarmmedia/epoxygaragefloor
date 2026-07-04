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

// Reviews list (used by the review-velocity panel to count new reviews this period)
async function getReviews(accessToken, accountId, locationId) {
  const data = await gFetch(
    `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`,
    accessToken
  );
  return data.reviews || [];
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

module.exports = { getSummary, getMockSummary, getAccessToken, getPerformance, createPost, getReviews };
