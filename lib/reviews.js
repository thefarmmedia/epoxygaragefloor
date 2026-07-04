// Review velocity — new Google reviews this month vs. requests sent, with a
// conversion rate ("we sent 14, you got 5").
//
// New reviews come from the Google Business Profile reviews list (reuses the
// GBP_* OAuth vars from the Google Business Profile panel, plus GBP_ACCOUNT_ID).
// "Requests sent" has no public API on any platform we integrate with, so it's
// tracked locally: log a request from the dashboard's "+1 request sent" button,
// or edit data/<client>/review-requests.json directly:
//   { "2026-07": 14 }

const fs = require("fs");
const gbp = require("./googlebusiness");

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function readRequestLog(logPath) {
  if (!logPath || !fs.existsSync(logPath)) return {};
  try { return JSON.parse(fs.readFileSync(logPath, "utf8")); } catch { return {}; }
}

function requestsSentThisMonth(logPath) {
  const log = readRequestLog(logPath);
  return log[monthKey()] || 0;
}

function logRequestSent(logPath, count = 1) {
  const log = readRequestLog(logPath);
  const key = monthKey();
  log[key] = (log[key] || 0) + count;
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  return log[key];
}

async function getSummary(env, logPath) {
  const token = await gbp.getAccessToken(env.GBP_CLIENT_ID, env.GBP_CLIENT_SECRET, env.GBP_REFRESH_TOKEN);
  const allReviews = await gbp.getReviews(token, env.GBP_ACCOUNT_ID, env.GBP_LOCATION_ID);
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const newReviews = allReviews.filter((r) => new Date(r.createTime) >= start);
  const ratingValue = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  const avgNew = newReviews.length
    ? newReviews.reduce((s, r) => s + (ratingValue[r.starRating] || 0), 0) / newReviews.length
    : null;

  const sent = requestsSentThisMonth(logPath);
  return {
    source: "live",
    requestsSent: sent,
    newReviews: newReviews.length,
    conversionRate: sent ? Math.round((newReviews.length / sent) * 100) : null,
    averageRatingNew: avgNew ? Math.round(avgNew * 10) / 10 : null,
    latest: newReviews.slice(0, 5).map((r) => ({
      author: r.reviewer?.displayName || "Customer",
      rating: ratingValue[r.starRating] || 0,
      comment: (r.comment || "").slice(0, 140),
    })),
  };
}

function getMockSummary() {
  return {
    source: "mock",
    requestsSent: 8,
    newReviews: 3,
    conversionRate: 38,
    averageRatingNew: 5.0,
    latest: [],
  };
}

module.exports = { getSummary, getMockSummary, logRequestSent, requestsSentThisMonth };
