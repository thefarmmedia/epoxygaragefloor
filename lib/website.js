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

module.exports = { getSummary, getMockSummary };
