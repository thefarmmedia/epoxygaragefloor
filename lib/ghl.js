// GoHighLevel client — pipeline value ("money in motion")
// Auth: a Private Integration token. In your GHL agency account:
//   Settings -> Private Integrations -> Create Integration
//   Scopes needed: opportunities.readonly
// Env: GHL_API_KEY (the Private Integration token — same var the install-schedule
//      panel uses for calendar access), GHL_LOCATION_ID, GHL_PIPELINE_ID (optional —
//      leave blank to use the first pipeline on the sub-account).
//
// Docs: https://highlevel.stoplight.io/docs/integrations (Opportunities section)

const BASE = "https://services.leadconnectorhq.com";
const API_VERSION = "2021-07-28";

async function ghlFetch(path, token, params = {}) {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${BASE}${path}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Version: API_VERSION, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function getPipelines(token, locationId) {
  const data = await ghlFetch("/opportunities/pipelines", token, { locationId });
  return data.pipelines || [];
}

// Pulls every opportunity in the pipeline, paginating through GHL's cursor.
async function getAllOpportunities(token, locationId, pipelineId) {
  const all = [];
  let startAfter, startAfterId;
  for (let page = 0; page < 20; page++) {
    const params = { location_id: locationId, limit: "100" };
    if (pipelineId) params.pipeline_id = pipelineId;
    if (startAfter) params.startAfter = startAfter;
    if (startAfterId) params.startAfterId = startAfterId;
    const data = await ghlFetch("/opportunities/search", token, params);
    const opps = data.opportunities || [];
    all.push(...opps);
    if (!data.meta?.startAfter || opps.length < 100) break;
    startAfter = data.meta.startAfter;
    startAfterId = data.meta.startAfterId;
  }
  return all;
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function getSummary(env) {
  const token = env.GHL_API_KEY;
  const locationId = env.GHL_LOCATION_ID;
  const pipelines = await getPipelines(token, locationId);
  const pipeline = env.GHL_PIPELINE_ID
    ? pipelines.find((p) => p.id === env.GHL_PIPELINE_ID) || pipelines[0]
    : pipelines[0];

  const stageName = {};
  for (const s of pipeline?.stages || []) stageName[s.id] = s.name;

  const opps = await getAllOpportunities(token, locationId, pipeline?.id);
  const since = monthStart();

  const won = opps.filter((o) => o.status === "won" && new Date(o.updatedAt || o.createdAt) >= since);
  const open = opps.filter((o) => o.status === "open");

  const wonThisMonth = won.reduce((s, o) => s + (o.monetaryValue || 0), 0);
  const openValue = open.reduce((s, o) => s + (o.monetaryValue || 0), 0);

  const biggestDeals = [...open]
    .sort((a, b) => (b.monetaryValue || 0) - (a.monetaryValue || 0))
    .slice(0, 5)
    .map((o) => ({
      name: o.name || o.contact?.name || "Untitled deal",
      value: o.monetaryValue || 0,
      stage: stageName[o.pipelineStageId] || "",
    }));

  return {
    source: "live",
    pipelineName: pipeline?.name || "Pipeline",
    wonThisMonth: Math.round(wonThisMonth * 100) / 100,
    dealsWonCount: won.length,
    openValue: Math.round(openValue * 100) / 100,
    openCount: open.length,
    biggestDeals,
  };
}

function getMockSummary() {
  return {
    source: "mock",
    pipelineName: "Sales Pipeline",
    wonThisMonth: 0,
    dealsWonCount: 0,
    openValue: 164000,
    openCount: 65,
    biggestDeals: [
      { name: "Lead Submitted — New Lead", value: 164000, stage: "" },
      { name: "Attempting Contact", value: 4000, stage: "" },
      { name: "No Answer — Follow Up", value: 4000, stage: "" },
      { name: "Engaged — Conversation Started", value: 4000, stage: "" },
      { name: "On Site Estimate Scheduled", value: 4000, stage: "" },
    ],
  };
}

module.exports = { getSummary, getMockSummary, getPipelines, getAllOpportunities };
