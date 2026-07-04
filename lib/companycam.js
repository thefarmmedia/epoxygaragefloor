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
    photosToday: 12,
    activeProjects: [
      { id: "1", name: "3-car garage — full flake", address: "Nixa, MO", photosToday: 5, lastActivity: now - 900, stale: false },
      { id: "2", name: "2-car garage — full flake", address: "Springfield, MO", photosToday: 4, lastActivity: now - 3600, stale: false },
      { id: "3", name: "Shop floor — full flake", address: "Ozark, MO", photosToday: 3, lastActivity: now - 7200, stale: false },
      { id: "4", name: "Flex space — full flake", address: "Republic, MO", photosToday: 0, lastActivity: now - 4 * 86400, stale: true },
    ],
    projectsMissingPhotos: ["Flex space — full flake"],
    latestPhotos: mockPhotos(),
  };
}

// Real finished-floor photos from Ozarks Concrete Coatings, used as demo
// thumbnails until CompanyCam is connected.
function mockPhotos() {
  const jobs = [
    ["job-01.jpg", "3-car garage — full flake, close-up"],
    ["job-02.jpg", "2-car garage — full flake"],
    ["job-08.jpg", "2-car garage — full flake"],
    ["job-05.jpg", "Full flake — close-up finish"],
    ["job-11.jpg", "Custom colors — team-themed floor"],
    ["job-06.jpg", "Custom flake blend — red accent"],
    ["job-03.jpg", "Large shop floor — full flake"],
    ["job-04.jpg", "Full flake — glossy topcoat"],
    ["job-10.jpg", "Flex space — full flake"],
    ["job-13.jpg", "Finished living space — full flake"],
    ["job-07.jpg", "Garage entry — full flake"],
    ["job-12.jpg", "Garage door transition — full flake"],
    ["job-09.jpg", "Full flake — in progress"],
  ];
  const now = Math.floor(Date.now() / 1000);
  return jobs.map(([file, name], i) => ({
    id: String(i),
    projectName: name,
    creator: "",
    capturedAt: now - (i + 1) * 1800,
    thumb: `/assets/photos/${file}`,
    full: `/assets/photos/${file}`,
  }));
}

module.exports = { getSummary, getMockSummary, getProjects, getProjectPhotos, getRecentPhotos };
