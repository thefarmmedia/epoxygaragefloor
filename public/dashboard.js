const API = `/c/${window.CLIENT_SLUG}/api`;

const fmtAgo = (unix) => {
  if (!unix) return "";
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
};
const esc = (str) => String(str ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = (n) => "$" + Math.round(n || 0).toLocaleString();

function setPill(id, label, source) {
  const pill = document.getElementById(id);
  const live = source === "live" || source === "live-ghl" || source === "live-file";
  pill.textContent = label + " · " + (live ? "live" : "demo data");
  pill.className = "pill " + (live ? "live" : "mock");
}

async function loadBrightLocal() {
  const data = await (await fetch(`${API}/brightlocal/summary`)).json();
  setPill("pill-bl", "Rankings", data.source);

  const kws = data.keywords || [];
  const top3 = kws.filter(k => k.rank && k.rank <= 3).length;
  const improved = kws.filter(k => k.change > 0).length;
  const best = kws.length ? Math.min(...kws.map(k => k.rank ?? 999)) : "—";

  document.getElementById("bl-stats").innerHTML = `
    <div class="stat"><div class="n">${best}</div><div class="l">Best rank</div></div>
    <div class="stat"><div class="n">${top3}</div><div class="l">Top 3 spots</div></div>
    <div class="stat"><div class="n">${improved}</div><div class="l">Moved up</div></div>`;

  document.getElementById("bl-keywords").innerHTML = kws.map(k => {
    const cls = k.change > 0 ? "up" : k.change < 0 ? "down" : "flat";
    const arrow = k.change > 0 ? "▲" + k.change : k.change < 0 ? "▼" + Math.abs(k.change) : "—";
    return `<div class="row">
      <span class="label">${esc(k.keyword)}</span>
      <span style="display:flex;gap:10px;align-items:baseline">
        <span class="rank">#${k.rank ?? "–"}</span>
        <span class="delta ${cls}">${arrow}</span>
      </span>
    </div>`;
  }).join("") || '<div class="row"><span class="label" style="color:var(--muted)">No rank campaigns found on this account</span></div>';

  const r = data.reviews;
  document.getElementById("bl-reviews").innerHTML = !r ? "" : `
    <div class="row" style="margin-top:6px">
      <span class="label">Reviews: <strong>${r.averageRating}★</strong> avg · ${r.totalReviews} total</span>
      <span class="badge ${r.awaitingReply?.length ? "warn" : "ok"}">
        ${r.awaitingReply?.length ? r.awaitingReply.length + " awaiting reply" : "All replied"}
      </span>
    </div>
    ${(r.awaitingReply || []).map(rv => `
      <div class="review-card">
        <span class="who">${esc(rv.author)}</span> · <span class="stars">${"★".repeat(rv.rating)}</span>
        · <span style="color:var(--muted)">${esc(rv.site)}, ${rv.daysOld}d old</span>
        <div class="txt">${esc(rv.snippet)}</div>
      </div>`).join("")}`;
}

async function loadCompanyCam() {
  const data = await (await fetch(`${API}/companycam/summary`)).json();
  setPill("pill-cc", "CompanyCam", data.source);

  const missing = data.projectsMissingPhotos || [];
  const alertEl = document.getElementById("cc-alert");
  if (missing.length) {
    alertEl.textContent = "⚠ No recent photos: " + missing.join(" · ");
    alertEl.classList.add("show");
  } else {
    alertEl.classList.remove("show");
  }

  const projects = data.activeProjects || [];
  const active = projects.filter(p => !p.stale).length;

  document.getElementById("cc-stats").innerHTML = `
    <div class="stat"><div class="n">${data.photosToday ?? 0}</div><div class="l">Photos today</div></div>
    <div class="stat"><div class="n">${active}</div><div class="l">Active jobs</div></div>
    <div class="stat"><div class="n">${missing.length}</div><div class="l">Need photos</div></div>`;

  const photos = (data.latestPhotos || []).slice(0, 6);
  document.getElementById("cc-photos").innerHTML = photos.length ? photos.map(p => `
    <div class="photo-tile">
      <img src="${esc(p.thumb)}" alt="${esc(p.projectName)}" loading="lazy">
      <div class="cap">${esc(p.projectName || "")}
        <span class="meta">${esc(p.creator)}${p.creator ? " · " : ""}${fmtAgo(p.capturedAt)}</span>
      </div>
    </div>`).join("") :
    '<div style="grid-column:1/-1;color:var(--muted);font-size:13px;padding:8px 0">Photos will appear here as the crew uploads to CompanyCam</div>';

  document.getElementById("cc-projects").innerHTML = projects.slice(0, 5).map(p => `
    <div class="row">
      <span class="label">${esc(p.name)}<span class="sub">${esc(p.address)} · last activity ${fmtAgo(p.lastActivity)}</span></span>
      <span class="badge ${p.stale ? "alert" : p.photosToday > 0 ? "ok" : "warn"}">
        ${p.stale ? "Stale" : p.photosToday > 0 ? p.photosToday + " photos today" : "No photos yet"}
      </span>
    </div>`).join("");
}

async function loadFacebook() {
  const data = await (await fetch(`${API}/facebook/summary`)).json();
  setPill("pill-fb", "Facebook", data.source);

  const w = data.week || {};
  document.getElementById("fb-stats").innerHTML = `
    <div class="stat"><div class="n">$${(w.spend ?? 0).toFixed(2)}</div><div class="l">Spend 7d</div></div>
    <div class="stat"><div class="n">${w.leads ?? 0}</div><div class="l">Leads 7d</div></div>
    <div class="stat"><div class="n">${w.costPerLead != null ? "$" + w.costPerLead.toFixed(2) : "—"}</div><div class="l">Cost / lead</div></div>`;

  document.getElementById("fb-campaigns").innerHTML = (data.campaignsToday || []).map(c => `
    <div class="row">
      <span class="label">${esc(c.campaign)}<span class="sub">today</span></span>
      <span style="display:flex;gap:12px;align-items:baseline;font-size:13px">
        <span>$${c.spend.toFixed(2)}</span>
        <span class="badge ${c.leads > 0 ? "ok" : "warn"}">${c.leads} lead${c.leads === 1 ? "" : "s"}</span>
      </span>
    </div>`).join("") || '<div class="row"><span class="label" style="color:var(--muted)">No active campaigns today</span></div>';

  const posts = data.scheduledPosts || [];
  document.getElementById("fb-scheduled").innerHTML = !posts.length ? "" :
    '<div class="row" style="margin-top:6px"><span class="label" style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Scheduled posts</span></div>' +
    posts.map(p => `
      <div class="row">
        <span class="label">${esc(p.message)}</span>
        <span class="badge ok">${new Date(p.publishAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
      </div>`).join("");
}

async function loadGbp() {
  const data = await (await fetch(`${API}/gbp/summary`)).json();
  setPill("pill-gbp", "Google", data.source);

  const d = data.last7Days || {};
  document.getElementById("gbp-stats").innerHTML = `
    <div class="stat"><div class="n">${d.views ?? 0}</div><div class="l">Profile views</div></div>
    <div class="stat"><div class="n">${d.calls ?? 0}</div><div class="l">Calls</div></div>
    <div class="stat"><div class="n">${d.directions ?? 0}</div><div class="l">Directions</div></div>`;

  document.getElementById("gbp-extra").innerHTML = `
    <div class="row">
      <span class="label">Website clicks from profile</span>
      <span class="rank">${d.websiteClicks ?? 0}</span>
    </div>
    ${data.nextQueuedPost ? `<div class="row">
      <span class="label">Next queued post<span class="sub">${esc(data.nextQueuedPost)}</span></span>
      <span class="badge warn">Queued</span>
    </div>` : ""}`;
}

async function loadCitations() {
  const data = await (await fetch(`${API}/citations/summary`)).json();
  setPill("pill-ct", "Citations", data.source);

  const nap = data.nap || {};
  document.getElementById("ct-nap").innerHTML = `
    <strong>${esc(nap.name)}</strong><br>${esc(nap.address)}<br>${esc(nap.phone)}<br>
    <span style="color:var(--muted)">${esc(nap.website)}</span>`;

  const c = data.counts || {};
  document.getElementById("ct-stats").innerHTML = `
    <div class="stat"><div class="n">${c.active ?? 0}</div><div class="l">Live</div></div>
    <div class="stat"><div class="n">${c.pending ?? 0}</div><div class="l">Pending</div></div>
    <div class="stat"><div class="n">${c.opportunities ?? 0}</div><div class="l">To build</div></div>`;

  const camp = data.campaignInProgress;
  document.getElementById("ct-campaign").innerHTML = !camp ? "" : `
    <div class="row" style="margin-top:8px">
      <span class="label">${esc(camp.name)}<span class="sub">building now</span></span>
      <span class="badge warn">${camp.submitted}/${camp.total} submitted</span>
    </div>`;

  document.getElementById("ct-active").innerHTML = (data.topCitations || []).map(x => `
    <div class="row">
      <span class="label">${esc(x.source)}<span class="sub">${esc(x.siteType)}</span></span>
      <span class="badge ok">DA ${x.domainAuthority ?? "—"}</span>
    </div>`).join("");

  document.getElementById("ct-opps").innerHTML = (data.opportunities || []).map(x => `
    <div class="row">
      <span class="label">${esc(x.source)}<span class="sub">${esc(x.siteType)}</span></span>
      <span class="badge warn">DA ${x.domainAuthority ?? "—"}</span>
    </div>`).join("");
}

async function loadSchedule() {
  const data = await (await fetch(`${API}/schedule/summary`)).json();
  setPill("pill-sched", "Schedule", data.source);
  const sysBadge = { flake: "ok", solid: "warn", metallic: "alert" };
  document.getElementById("sched-weeks").innerHTML = (data.weeks || []).map(w => `
    <div style="background:#10151d;border:1px solid var(--tile-edge);border-radius:10px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:baseline">
        <strong style="font-size:14px">${esc(w.label)}</strong>
        <span style="font-size:12px;color:var(--muted)">${w.materials.jobs} job${w.materials.jobs === 1 ? "" : "s"} · ${w.materials.sqft.toLocaleString()} sq ft</span>
      </div>
      <div style="margin-top:8px">
        ${w.jobs.map(j => `
          <div class="row" style="padding:6px 0">
            <span class="label">${esc(j.name)}<span class="sub">${new Date(j.date + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} · ${j.sqft.toLocaleString()} sq ft</span></span>
            <span class="badge ${sysBadge[j.system] || "ok"}">${esc(j.system)}</span>
          </div>`).join("") || '<div style="color:var(--muted);font-size:13px;padding:6px 0">Nothing scheduled</div>'}
      </div>
      <div style="border-top:1px solid var(--tile-edge);margin-top:8px;padding-top:8px;font-size:13px;line-height:1.8">
        <strong style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px">Order for this week</strong><br>
        Base coat: <strong>${w.materials.baseKits} kit${w.materials.baseKits === 1 ? "" : "s"}</strong> ·
        Flake: <strong>${w.materials.flakeLbs} lbs</strong> ·
        Topcoat: <strong>${w.materials.topKits} kit${w.materials.topKits === 1 ? "" : "s"}</strong>
      </div>
    </div>`).join("");
  const r = data.rates || {};
  document.getElementById("sched-rates").textContent =
    `Coverage assumptions: base coat ${r.baseSqftPerKit} sq ft/kit · flake ${r.flakeLbsPerSqft} lb/sq ft (full broadcast) · topcoat ${r.topSqftPerKit} sq ft/kit — adjust in .env to match your supplier, and always verify against spec sheets before ordering.`;
}

async function loadWebsite() {
  const data = await (await fetch(`${API}/website/summary`)).json();
  setPill("pill-web", "Website", data.source);

  const d = data.last7Days || {};
  const chg = d.sessionsChangePct;
  document.getElementById("web-stats").innerHTML = `
    <div class="stat"><div class="n">${d.sessions ?? 0}${chg != null ? ` <span style="font-size:12px" class="${chg >= 0 ? "up" : "down"}">${chg >= 0 ? "▲" : "▼"}${Math.abs(chg)}%</span>` : ""}</div><div class="l">Visits</div></div>
    <div class="stat"><div class="n">${d.users ?? 0}</div><div class="l">People</div></div>
    <div class="stat"><div class="n">${d.conversions ?? 0}</div><div class="l">Leads / actions</div></div>`;

  const max = Math.max(...(data.channels || []).map(c => c.sessions), 1);
  document.getElementById("web-channels").innerHTML = (data.channels || []).map(c => `
    <div class="row" style="padding:7px 0">
      <span class="label" style="min-width:110px">${esc(c.channel)}</span>
      <span style="flex:1;display:flex;align-items:center;gap:8px">
        <span style="height:8px;border-radius:4px;background:#38bdf8;flex:0 0 ${Math.round((c.sessions / max) * 100)}%"></span>
        <span style="font-size:12px;color:var(--muted)">${c.sessions}</span>
      </span>
    </div>`).join("");
}

async function loadPipeline() {
  const data = await (await fetch(`${API}/pipeline/summary`)).json();
  setPill("pill-pipeline", "Pipeline", data.source);

  document.getElementById("pipeline-stats").innerHTML = `
    <div class="stat"><div class="n" style="color:var(--green)">${money(data.wonThisMonth)}</div><div class="l">Won this month</div></div>
    <div class="stat"><div class="n">${money(data.openValue)}</div><div class="l">Open estimate value</div></div>
    <div class="stat"><div class="n">${data.openCount ?? 0}</div><div class="l">Leads / estimates</div></div>
    <div class="stat"><div class="n">${data.dealsWonCount ?? 0}</div><div class="l">Jobs won</div></div>`;

  document.getElementById("pipeline-deals").innerHTML = (data.biggestDeals || []).map(d => `
    <div class="row">
      <span class="label">${esc(d.name)}<span class="sub">${esc(d.stage)}</span></span>
      <span class="rank">${money(d.value)}</span>
    </div>`).join("") || '<div class="row"><span class="label" style="color:var(--muted)">No open deals</span></div>';
}

async function loadReviewsVelocity() {
  const data = await (await fetch(`${API}/reviews/summary`)).json();
  setPill("pill-reviews", "Reviews", data.source);

  document.getElementById("reviews-stats").innerHTML = `
    <div class="stat"><div class="n">${data.requestsSent ?? 0}</div><div class="l">Requests sent</div></div>
    <div class="stat"><div class="n">${data.newReviews ?? 0}</div><div class="l">New reviews</div></div>
    <div class="stat"><div class="n">${data.conversionRate != null ? data.conversionRate + "%" : "—"}</div><div class="l">Conversion</div></div>`;

  document.getElementById("reviews-latest").innerHTML = (data.latest || []).map(r => `
    <div class="review-card">
      <span class="who">${esc(r.author)}</span> · <span class="stars">${"★".repeat(r.rating)}</span>
      <div class="txt">${esc(r.comment)}</div>
    </div>`).join("");
}

async function loadAutoposter() {
  const data = await (await fetch(`${API}/autoposter/drafts`)).json();
  document.getElementById("pill-autoposter").textContent = "Auto-poster · " + (data.aiEnabled ? "AI captions" : "templated");
  document.getElementById("pill-autoposter").className = "pill " + (data.aiEnabled ? "live" : "mock");
  document.getElementById("autoposter-mode").textContent = data.aiEnabled
    ? "Captions written per job by Claude, from the actual project name and coating system."
    : "Rotating templates — add ANTHROPIC_API_KEY in .env for real, per-job AI captions.";

  document.getElementById("autoposter-drafts").innerHTML = (data.drafts || []).map(d => `
    <div class="draft-card">
      ${d.thumb ? `<img src="${esc(d.thumb)}" alt="${esc(d.projectName)}">` : ""}
      <div class="body">
        <div class="cap-text">${esc(d.caption)}</div>
        <div class="cap-meta">
          <span>${esc(d.projectName)}</span>
          <button class="btn small copy-btn" data-caption="${esc(d.caption)}">Copy</button>
        </div>
      </div>
    </div>`).join("") || '<div class="row"><span class="label" style="color:var(--muted)">Photos will appear here as the crew uploads to CompanyCam</span></div>';

  document.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(btn.dataset.caption);
      const orig = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
}

function rankColor(rank) {
  if (rank <= 3) return "var(--green)";
  if (rank <= 10) return "var(--amber)";
  return "var(--red)";
}

async function loadGeogrid() {
  const data = await (await fetch(`${API}/geogrid/summary`)).json();
  document.getElementById("pill-geogrid").textContent = "Geo-grid · demo";
  document.getElementById("pill-geogrid").className = "pill mock";

  document.getElementById("geogrid-cells").innerHTML = (data.cells || []).map(c => `
    <div class="cell" style="background:${rankColor(c.rank)}" title="Row ${c.row + 1}, Col ${c.col + 1}: rank #${c.rank}">${c.rank}</div>`).join("");

  document.getElementById("geogrid-stats").innerHTML = `
    <div class="stat"><div class="n">${data.averageRank ?? "—"}</div><div class="l">Average rank</div></div>
    <div class="stat"><div class="n">${data.top3Count ?? 0}</div><div class="l">Top 3 spots (of ${(data.gridSize ?? 7) ** 2})</div></div>`;

  document.getElementById("geogrid-note").textContent =
    `Demo grid for "${data.keyword || "your keyword"}" — live grid data plugs in once BrightLocal's Local Search Grid product is enabled on your account.`;
}

async function sendMonthlyReport() {
  const btn = document.getElementById("email-report-btn");
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = "Sending…";
  try {
    const res = await (await fetch(`${API}/email/send-report`, { method: "POST" })).json();
    btn.textContent = res.ok ? "Sent!" : "Failed";
  } catch {
    btn.textContent = "Failed";
  }
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
}

async function logRequestSent() {
  const btn = document.getElementById("log-request-btn");
  await fetch(`${API}/reviews/log-request`, { method: "POST" });
  loadReviewsVelocity();
  btn.textContent = "Logged!";
  setTimeout(() => { btn.textContent = "+1 request sent"; }, 1200);
}

document.getElementById("email-report-btn").addEventListener("click", sendMonthlyReport);
document.getElementById("log-request-btn").addEventListener("click", logRequestSent);

async function refresh() {
  try {
    await Promise.all([
      loadSchedule(), loadPipeline(), loadReviewsVelocity(), loadAutoposter(), loadGeogrid(),
      loadWebsite(), loadBrightLocal(), loadCompanyCam(), loadFacebook(), loadGbp(), loadCitations(),
    ]);
  } catch (e) { console.error(e); }
  document.getElementById("last-updated").textContent =
    "Updated " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
refresh();
setInterval(refresh, 5 * 60 * 1000);
