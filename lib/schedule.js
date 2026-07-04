// Install schedule + material ordering
// Groups upcoming jobs into This week / Next week / 2 weeks out, and converts
// square footage into product quantities so the owner knows what to order.
//
// JOB SOURCE, in priority order:
//   1. GoHighLevel calendar (if GHL_API_KEY + GHL_LOCATION_ID + GHL_CALENDAR_ID set)
//      Uses a GHL Private Integration token: Settings -> Private Integrations.
//      Appointment title format for auto-parsing: "Henderson - 780 sqft flake"
//   2. A jobs.json file in the client's data directory:
//      [{ "name": "Henderson", "date": "2026-07-08", "sqft": 780, "system": "flake" }]
//      system: "flake" | "solid" | "metallic"
//   3. Demo data
//
// COVERAGE RATES (override in .env to match the products you buy):
//   BASE_COAT_SQFT_PER_KIT=450     e.g. 3-gal 100% solids epoxy kit
//   FLAKE_LBS_PER_SQFT=0.2         full broadcast
//   TOPCOAT_SQFT_PER_KIT=500       polyaspartic clear kit
// These defaults are typical but CONFIRM against your supplier's spec sheets.

const fs = require("fs");

function rates(env) {
  return {
    baseSqftPerKit: parseFloat(env.BASE_COAT_SQFT_PER_KIT) || 450,
    flakeLbsPerSqft: parseFloat(env.FLAKE_LBS_PER_SQFT) || 0.2,
    topSqftPerKit: parseFloat(env.TOPCOAT_SQFT_PER_KIT) || 500,
  };
}

function weekBuckets() {
  const now = new Date();
  const day = now.getDay(); // 0 Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const w = (n) => new Date(monday.getTime() + n * 7 * 86400000);
  return [
    { label: "This week", start: w(0), end: w(1) },
    { label: "Next week", start: w(1), end: w(2) },
    { label: "2 weeks out", start: w(2), end: w(3) },
  ];
}

function materials(jobs, r) {
  const sqft = jobs.reduce((s, j) => s + (j.sqft || 0), 0);
  const flakeSqft = jobs.filter((j) => j.system === "flake").reduce((s, j) => s + (j.sqft || 0), 0);
  return {
    jobs: jobs.length,
    sqft,
    baseKits: Math.ceil(sqft / r.baseSqftPerKit),
    flakeLbs: Math.ceil(flakeSqft * r.flakeLbsPerSqft),
    topKits: Math.ceil(sqft / r.topSqftPerKit),
  };
}

function bucketize(jobs, env) {
  const r = rates(env);
  return weekBuckets().map((b) => {
    const inWeek = jobs
      .filter((j) => j.date >= b.start && j.date < b.end)
      .sort((a, c) => a.date - c.date)
      .map((j) => ({
        name: j.name,
        date: j.date.toISOString().slice(0, 10),
        sqft: j.sqft,
        system: j.system,
      }));
    return { label: b.label, jobs: inWeek, materials: materials(inWeek.map((j, i) => jobs.find((o) => o.name === j.name && o.sqft === j.sqft) || j), r) };
  });
}

// --- Source 1: GoHighLevel calendar ---
async function fromGhl(env) {
  const buckets = weekBuckets();
  const params = new URLSearchParams({
    locationId: env.GHL_LOCATION_ID,
    calendarId: env.GHL_CALENDAR_ID,
    startTime: String(buckets[0].start.getTime()),
    endTime: String(buckets[2].end.getTime()),
  });
  const res = await fetch(`https://services.leadconnectorhq.com/calendars/events?${params}`, {
    headers: {
      Authorization: `Bearer ${env.GHL_API_KEY}`,
      Version: "2021-04-15",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`GHL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.events || []).map((e) => {
    // parse "Henderson - 780 sqft flake" style titles
    const title = e.title || "";
    const sqft = parseInt((title.match(/(\d[\d,]*)\s*sq/i) || [])[1]?.replace(/,/g, "") || "0", 10);
    const system = /metallic/i.test(title) ? "metallic" : /solid/i.test(title) ? "solid" : "flake";
    return {
      name: title.split(/[-–—]/)[0].trim() || title || "Job",
      date: new Date(e.startTime),
      sqft,
      system,
    };
  }).filter((j) => j.sqft > 0 || j.name);
}

// --- Source 2: jobs.json ---
function fromFile(jobsPath) {
  if (!jobsPath || !fs.existsSync(jobsPath)) return null;
  const raw = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
  return raw.map((j) => ({ name: j.name, date: new Date(j.date + "T12:00:00"), sqft: j.sqft || 0, system: j.system || "flake" }));
}

async function getSummary(env, jobsPath) {
  let jobs = null;
  let source = "live";
  if (env.GHL_API_KEY && env.GHL_LOCATION_ID && env.GHL_CALENDAR_ID) {
    jobs = await fromGhl(env);
    source = "live-ghl";
  } else {
    jobs = fromFile(jobsPath);
    source = "live-file";
  }
  if (!jobs) throw new Error("no schedule source configured");
  return { source, weeks: bucketize(jobs, env), rates: rates(env) };
}

function getMockSummary(env) {
  const d = (offset) => { const x = new Date(); x.setDate(x.getDate() + offset); x.setHours(12,0,0,0); return x; };
  const jobs = [
    { name: "Henderson", date: d(0), sqft: 780, system: "flake" },
    { name: "Ramirez", date: d(1), sqft: 460, system: "solid" },
    { name: "Doyle", date: d(4), sqft: 1120, system: "metallic" },
    { name: "Barker", date: d(7), sqft: 520, system: "flake" },
    { name: "Simmons", date: d(9), sqft: 640, system: "flake" },
    { name: "Prater Auto (shop floor)", date: d(11), sqft: 2400, system: "flake" },
    { name: "Nguyen", date: d(15), sqft: 440, system: "solid" },
    { name: "Callahan", date: d(17), sqft: 880, system: "flake" },
  ];
  return { source: "mock", weeks: bucketize(jobs, env), rates: rates(env) };
}

module.exports = { getSummary, getMockSummary };
