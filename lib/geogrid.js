// Geo-grid — the 7x7 colored dot spread of local rank across town.
// This is the sell-the-concept panel: BrightLocal's Local Search Grid product
// (the one that actually measures rank at 49 points around a location) doesn't
// expose a public read API yet — grid results are only viewable in their
// dashboard. When BrightLocal ships an API for it (or you export a grid
// manually), replace getSummary() below with a real fetch that returns the same
// shape as getMockSummary(): { cells: [{ row, col, rank }], averageRank, top3Count }.
// Env (once available): BRIGHTLOCAL_API_KEY (shared), BRIGHTLOCAL_GRID_REPORT_ID.

const GRID_SIZE = 7;

// Mirrors an actual Local Search Grid result for "Epoxy Flooring Springfield MO"
// — rank #1 at nearly every point across town, one #2. Update this if/when you
// pull a fresh grid from BrightLocal's dashboard.
const RANKS = [
  1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 2, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1,
];

function buildCells() {
  const cells = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      cells.push({ row, col, rank: RANKS[row * GRID_SIZE + col] });
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
  const keyword = env.BRIGHTLOCAL_GRID_KEYWORD || "Epoxy Flooring Springfield MO";
  return { source: "mock", ...summarize(buildCells(), keyword) };
}

module.exports = { getSummary, getMockSummary };
