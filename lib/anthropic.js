// Anthropic (Claude) client — drafts real captions from real job photos.
// Get a key: console.anthropic.com -> API Keys.
// Env: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (optional, defaults to claude-sonnet-5)

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

async function draftCaption(apiKey, model, job) {
  const prompt = [
    "Write one short social media caption (Facebook/Instagram) for a finished epoxy or polyaspartic garage floor coating job.",
    "2-3 sentences, upbeat but not cheesy, no more than one hashtag, no emoji spam (0-1 emoji max).",
    `Job/project name: ${job.projectName || "a residential garage"}`,
    job.system ? `Coating system: ${job.system}` : "",
    "Return only the caption text, nothing else.",
  ].filter(Boolean).join("\n");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Anthropic: ${data.error.message}`);
  return (data.content || []).map((c) => c.text || "").join("").trim();
}

module.exports = { draftCaption, DEFAULT_MODEL };
