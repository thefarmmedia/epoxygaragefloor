// Geo-grid — the 7x7 colored dot spread of local rank across town.
// This is the sell-the-concept panel: BrightLocal's Local Search Grid product
// (the one that actually measures rank at 49 points around a location) doesn't
// expose a public read API yet — grid results are only viewable in their
// dashboard. When BrightLocal ships an API for it (or you export a grid
// manually), replace getSummary() below with a real fetch that returns the same
// shape as getMockSummary(): { cells: [{ row, col, rank }], averageRank, top3Count }.
// Env (once available): BRIGHTLOCAL_API_KEY (shared), BRIGHTLOCAL_GRID_REPORT_ID.

const GRID_SIZE = 7;

function buildCells(seed, keyword) {
  let s = seed;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const cells = [];
  const mid = (GRID_SIZE - 1) / 2;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const dist = Math.hypot(row - mid, col - mid);
      const base = 2 + dist * 1.9;
      const rank = Math.max(1, Math.min(20, Math.round(base + (rand() - 0.5) * 5)));
      cells.push({ row, col, rank });
    }
  }
  return cells;
}

function summarize(cells, keyword) {
  const averageRank = Math.round((cells.reduce((s, c) => s + c.rank, 0) / cells.length) * 10) / 10;
  const top3Count = cells.filter((c) => c.rank <= 3).length;
  return { gridSize: GRID_SIZE, keyword, cells, averageRank, top3Count };
}

async function getSummary() {
  throw new Error("BrightLocal Local Search Grid API not available on this plan yet — showing demo grid");
}

function getMockSummary(env = {}) {
  const keyword = env.BRIGHTLOCAL_GRID_KEYWORD || "epoxy garage floor";
  return { source: "mock", ...summarize(buildCells(42), keyword) };
}

module.exports = { getSummary, getMockSummary };
