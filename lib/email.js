// Monthly report emails via Resend — resend.com, free tier is generous enough
// for one email a month per client.
// Env: RESEND_API_KEY (agency-wide, in the root .env), plus per-client
// REPORT_TO_EMAIL and REPORT_FROM_EMAIL (a verified sending domain/address in
// your Resend account — see resend.com/docs/dashboard/domains/introduction).

const ENDPOINT = "https://api.resend.com/emails";

function money(n) {
  return "$" + Math.round(n || 0).toLocaleString();
}

function monthLabel(d = new Date()) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// data: { pipeline, reviews, gbp, brightlocal } — the same summary shapes the
// dashboard panels use.
function renderReportHtml(client, data) {
  const { pipeline = {}, reviews = {}, gbp = {}, brightlocal = {} } = data;
  const kw = (brightlocal.keywords || []);
  const bestRank = kw.length ? Math.min(...kw.map((k) => k.rank ?? 999)) : null;
  const top3 = kw.filter((k) => k.rank && k.rank <= 3).length;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;background:#050507;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#e8ecf2">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    ${client.logo ? `<img src="${client.logo}" alt="${client.name}" style="height:44px;margin-bottom:16px">` : ""}
    <h1 style="font-size:20px;margin:0 0 4px">${client.name} — Monthly Growth Report</h1>
    <div style="font-size:13px;color:#8b96a8;margin-bottom:24px">${monthLabel()}</div>

    <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:20px">
      <tr>
        <td style="background:#101014;border:1px solid #26262e;border-radius:10px;padding:14px;width:50%">
          <div style="font-size:22px;font-weight:700;color:#4ade80">${money(pipeline.wonThisMonth)}</div>
          <div style="font-size:11px;color:#8b96a8;text-transform:uppercase">Won this month (${pipeline.dealsWonCount ?? 0} jobs)</div>
        </td>
        <td style="width:12px"></td>
        <td style="background:#101014;border:1px solid #26262e;border-radius:10px;padding:14px;width:50%">
          <div style="font-size:22px;font-weight:700;color:#60a5fa">${money(pipeline.openValue)}</div>
          <div style="font-size:11px;color:#8b96a8;text-transform:uppercase">Open pipeline (${pipeline.openCount ?? 0} deals)</div>
        </td>
      </tr>
    </table>

    <div style="background:#101014;border:1px solid #26262e;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Reviews</div>
      <div style="font-size:13px;color:#c5cdd8">
        Sent ${reviews.requestsSent ?? 0} requests, got ${reviews.newReviews ?? 0} new reviews
        ${reviews.conversionRate != null ? `(${reviews.conversionRate}% conversion)` : ""}.
      </div>
    </div>

    <div style="background:#101014;border:1px solid #26262e;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Google Business Profile — last 7 days</div>
      <div style="font-size:13px;color:#c5cdd8">
        ${gbp.last7Days?.views ?? 0} profile views · ${gbp.last7Days?.calls ?? 0} calls · ${gbp.last7Days?.directions ?? 0} direction requests
      </div>
    </div>

    <div style="background:#101014;border:1px solid #26262e;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600;margin-bottom:8px">Local rankings</div>
      <div style="font-size:13px;color:#c5cdd8">
        Best rank #${bestRank ?? "—"} · ${top3} keyword${top3 === 1 ? "" : "s"} in the top 3
      </div>
    </div>

    <div style="font-size:11px;color:#8b96a8;margin-top:24px;text-align:center">
      Sent automatically by the ${client.name} growth dashboard.
    </div>
  </div>
</body>
</html>`;
}

async function sendMonthlyReport(env, client, data) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const to = env.REPORT_TO_EMAIL;
  if (!to) throw new Error("REPORT_TO_EMAIL not set for this client");

  const html = renderReportHtml(client, data);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.REPORT_FROM_EMAIL || "onboarding@resend.dev",
      to,
      subject: `${client.name} — Monthly Growth Report (${monthLabel()})`,
      html,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(out).slice(0, 200)}`);
  return out;
}

module.exports = { sendMonthlyReport, renderReportHtml, monthLabel };
