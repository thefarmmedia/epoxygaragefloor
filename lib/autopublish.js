// Publishes the latest job photo + caption to Facebook and Google Business
// Profile in one action (triggered by the "Publish now" button — this never
// fires automatically, since posting to a live business page is a visible,
// public action).
//
// Also analyzes the last 30 days of organic Facebook posts to find the best
// performer. Turning that winning post into a PAID ad is intentionally not
// built yet — that means spending real ad budget automatically, and needs an
// explicit decision on approval flow (auto-launch vs. draft-and-approve) and
// stop rules (spend cap / cost-per-lead ceiling) before it's wired up. See
// README for the parameters to fill in once that's decided.

const facebook = require("./facebook");
const gbp = require("./googlebusiness");
const autoposter = require("./autoposter");

async function publishLatestJobPhoto(env, companycamSummary, origin) {
  const photo = (companycamSummary.latestPhotos || [])[0];
  if (!photo) throw new Error("No recent job photo to publish");

  const [draft] = await autoposter.getDrafts({ latestPhotos: [photo] }, env);
  const caption = draft?.caption || `Fresh finish: ${photo.projectName || "another job"} done right.`;
  const photoUrl = photo.full || photo.thumb;
  const absoluteUrl = photoUrl && photoUrl.startsWith("/") ? `${origin}${photoUrl}` : photoUrl;

  const results = {};

  if (env.FB_ACCESS_TOKEN && env.FB_PAGE_ID) {
    try {
      const pageToken = await facebook.getPageAccessToken(env.FB_ACCESS_TOKEN, env.FB_PAGE_ID);
      const posted = await facebook.publishPhoto(pageToken, env.FB_PAGE_ID, absoluteUrl, caption);
      results.facebook = { ok: true, postId: posted.postId };
    } catch (err) {
      results.facebook = { ok: false, error: err.message };
    }
  } else {
    results.facebook = { ok: false, error: "Facebook not connected" };
  }

  const gbpReady = !!(env.GBP_CLIENT_ID && env.GBP_CLIENT_SECRET && env.GBP_REFRESH_TOKEN && env.GBP_LOCATION_ID && env.GBP_ACCOUNT_ID);
  if (gbpReady) {
    try {
      const token = await gbp.getAccessToken(env.GBP_CLIENT_ID, env.GBP_CLIENT_SECRET, env.GBP_REFRESH_TOKEN);
      const posted = await gbp.createPost(token, env.GBP_ACCOUNT_ID, env.GBP_LOCATION_ID, caption, absoluteUrl);
      results.googleBusinessProfile = { ok: true, name: posted.name };
    } catch (err) {
      results.googleBusinessProfile = { ok: false, error: err.message };
    }
  } else {
    results.googleBusinessProfile = { ok: false, error: "Google Business Profile not connected" };
  }

  return { caption, photoUrl: absoluteUrl, results };
}

async function organicPerformance(env, days = 30) {
  const posts = await facebook.getOrganicPerformance(env.FB_ACCESS_TOKEN, env.FB_PAGE_ID, days);
  return { source: "live", days, posts: posts.slice(0, 10), winner: posts[0] || null };
}

function getMockOrganicPerformance(days = 30) {
  const posts = [
    { id: "1", message: "Before/after: 3-car full flake in Nixa — 2 days start to finish", likes: 42, comments: 9, shares: 6, photo: "/assets/photos/job-01.jpg" },
    { id: "2", message: "Team-themed floor for the big game", likes: 30, comments: 5, shares: 4, photo: "/assets/photos/job-11.jpg" },
    { id: "3", message: "Why flake beats paint for garage floors", likes: 21, comments: 3, shares: 2, photo: "/assets/photos/job-03.jpg" },
  ].map((p) => ({ ...p, engagementScore: p.likes + p.comments * 2 + p.shares * 3 }))
   .sort((a, b) => b.engagementScore - a.engagementScore);
  return { source: "mock", days, posts, winner: posts[0] };
}

module.exports = { publishLatestJobPhoto, organicPerformance, getMockOrganicPerformance };
