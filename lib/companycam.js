// CompanyCam client — https://docs.companycam.com
// Auth: Bearer access token. Generate one in CompanyCam:
// Web app -> Company Settings -> Integrations -> Access Tokens (Admin role required).

const BASE = "https://api.companycam.com/v2";

async function ccFetch(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CompanyCam ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Recent projects (CompanyCam returns newest activity first)
async function getProjects(token, perPage = 25) {
  return ccFetch(`/projects?per_page=${perPage}`, token);
}

async function getProjectPhotos(token, projectId, perPage = 5) {
  return ccFetch(`/projects/${projectId}/photos?per_page=${perPage}`, token);
}

// Company-wide photo feed, newest first
async function getRecentPhotos(token, perPage = 50) {
  return ccFetch(`/photos?per_page=${perPage}`, token);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

// Shape everything the dashboard panel needs in one object.
async function getSummary(token) {
  const [projects, photos] = await Promise.all([
    getProjects(token),
    getRecentPhotos(token),
  ]);

  const todayStart = startOfToday();
  const photosToday = photos.filter((p) => (p.created_at || 0) >= todayStart);

  // Photo counts per project for the recent feed
  const countByProject = {};
  for (const p of photosToday) {
    if (p.project_id) countByProject[p.project_id] = (countByProject[p.project_id] || 0) + 1;
  }

  const threeDaysAgo = Math.floor(Date.now() / 1000) - 3 * 86400;
  const activeProjects = projects.slice(0, 12).map((proj) => ({
    id: proj.id,
    name: proj.name,
    address: proj.address ? `${proj.address.street_address_1 || ""}, ${proj.address.city || ""}`.replace(/^, /, "") : "",
    photosToday: countByProject[proj.id] || 0,
    lastActivity: proj.updated_at || proj.created_at,
    stale: (proj.updated_at || 0) < threeDaysAgo,
    url: proj.public_url || null,
  }));

  const nameByProject = {};
  for (const proj of projects) nameByProject[proj.id] = proj.name;

  // Fall back to most recent photos overall if none yet today (early morning)
  const feedSource = photosToday.length ? photosToday : photos;
  const latestPhotos = feedSource.slice(0, 12).map((p) => ({
    id: p.id,
    projectId: p.project_id,
    projectName: nameByProject[p.project_id] || "",
    capturedAt: p.captured_at || p.created_at,
    creator: p.creator_name || "",
    // uris is an array of sized variants; grab a web-friendly one
    thumb: pickUri(p, "web_thumbnail") || pickUri(p, "thumbnail") || pickUri(p, "web"),
    full: pickUri(p, "web") || pickUri(p, "original"),
  }));

  return {
    source: "live",
    photosToday: photosToday.length,
    activeProjects,
    projectsMissingPhotos: activeProjects.filter((p) => p.stale).map((p) => p.name),
    latestPhotos,
  };
}

function pickUri(photo, type) {
  if (!Array.isArray(photo.uris)) return null;
  const hit = photo.uris.find((u) => u.type === type);
  return hit ? hit.uri || hit.url : null;
}

// Demo data so the panel renders before keys are configured.
function getMockSummary() {
  const now = Math.floor(Date.now() / 1000);
  return {
    source: "mock",
    photosToday: 38,
    activeProjects: [
      { id: "1", name: "Henderson — 3-car full flake", address: "1412 Cedar Ridge Dr, Springfield", photosToday: 16, lastActivity: now - 900, stale: false },
      { id: "2", name: "Ramirez — 2-car solid gray", address: "88 Loganberry Ln, Nixa", photosToday: 12, lastActivity: now - 3600, stale: false },
      { id: "3", name: "Whitfield — topcoat", address: "301 E Walnut St, Ozark", photosToday: 10, lastActivity: now - 7200, stale: false },
      { id: "4", name: "Barker — estimate", address: "77 Prairie View Rd, Rogersville", photosToday: 0, lastActivity: now - 4 * 86400, stale: true },
      { id: "5", name: "Doyle — 4-car metallic", address: "560 Timber Creek Ave, Republic", photosToday: 0, lastActivity: now - 5 * 86400, stale: true },
    ],
    projectsMissingPhotos: ["Barker — estimate", "Doyle — 4-car metallic"],
    latestPhotos: mockPhotos(),
  };
}

// Placeholder thumbnails for demo mode: simple epoxy-flake style SVGs
function mockPhotos() {
  const jobs = [
    ["Henderson — grind", "Brad", "#4a5568", "#718096"],
    ["Henderson — patch", "Tyler", "#5a4a3a", "#8a7a6a"],
    ["Ramirez — base coat", "Marcus", "#3a4a5a", "#5a7a9a"],
    ["Ramirez — flake", "Joe", "#4a4a52", "#9a9aa2"],
    ["Whitfield — topcoat", "Brad", "#3d4451", "#6d7481"],
    ["Whitfield — final", "Tyler", "#44505e", "#8494a8"],
  ];
  const now = Math.floor(Date.now() / 1000);
  return jobs.map(([name, who, c1, c2], i) => {
    let flakes = "";
    for (let f = 0; f < 40; f++) {
      const x = (f * 37) % 200, y = (f * 53) % 120;
      flakes += `<rect x="${x}" y="${y}" width="3" height="3" fill="${f % 2 ? c2 : "#cbd5e0"}" transform="rotate(${f * 23} ${x} ${y})"/>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="${c1}"/>${flakes}</svg>`;
    return {
      id: String(i),
      projectName: name,
      creator: who,
      capturedAt: now - (i + 1) * 1800,
      thumb: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
      full: null,
    };
  });
}

module.exports = { getSummary, getMockSummary, getProjects, getProjectPhotos, getRecentPhotos };
