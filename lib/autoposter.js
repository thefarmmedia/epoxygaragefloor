// Auto-poster — drafts a caption for each of the latest job photos.
// Without ANTHROPIC_API_KEY: rotates through a few templates so the panel still
// works out of the box. With it: each caption is genuinely written by Claude,
// per job, from the actual project name and coating system.
// One-click publishing to Google/Facebook is the natural next build once GBP
// access is approved — createPost() in lib/googlebusiness.js is ready for it.

const anthropic = require("./anthropic");

const TEMPLATES = [
  (p) => `Fresh finish at ${p.projectName || "the job site"} — another floor done right.`,
  (p) => `${p.projectName || "This garage"} just got the full coating treatment. Ready to work, ready to shine.`,
  (p) => `Before/after glow-up: ${p.projectName || "another local garage"}, transformed in days, not weeks.`,
  (p) => `Crew wrapped up ${p.projectName || "a job"} today. Floors like this are why we do this.`,
];

async function getDrafts(companycamSummary, env) {
  const photos = (companycamSummary.latestPhotos || []).slice(0, 4);
  const apiKey = env.ANTHROPIC_API_KEY;
  const model = env.ANTHROPIC_MODEL;

  const drafts = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    let caption, mode;
    if (apiKey) {
      try {
        caption = await anthropic.draftCaption(apiKey, model, p);
        mode = "ai";
      } catch (err) {
        caption = TEMPLATES[i % TEMPLATES.length](p);
        mode = "template";
      }
    } else {
      caption = TEMPLATES[i % TEMPLATES.length](p);
      mode = "template";
    }
    drafts.push({
      photoId: p.id,
      projectName: p.projectName || "",
      thumb: p.thumb || null,
      capturedAt: p.capturedAt || null,
      caption,
      mode,
    });
  }
  return drafts;
}

module.exports = { getDrafts };
