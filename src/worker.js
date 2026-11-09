
const SOURCE = "https://gaswatchph.com/price-history";
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

function pageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&minus;|&#8722;|&#x2212;/gi, "−")
    .replace(/&#8369;|&#x20b1;/gi, "₱")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ");
}

const num = (sign, v) => (/[−\-–]/.test(sign) ? -1 : 1) * parseFloat(v);

// Adjustments take effect on Tuesday; snap the date to the Tuesday on or before it.
function toTuesdayIso(monthIdx, day) {
  const manilaNow = new Date(Date.now() + 8 * 36e5);
  let y = manilaNow.getUTCFullYear();
  let t = Date.UTC(y, monthIdx, day);
  if (t - manilaNow.getTime() > 8 * 864e5) t = Date.UTC(--y, monthIdx, day);
  const d = new Date(t);
  d.setUTCDate(d.setUTCDate() - ((d.getUTCDay() + 5) % 7)); // back to Tuesday
  return d.toISOString().slice(0, 10);
}

function parseWeeks(text) {
  const re = /([A-Za-z]{3,9})\.?\s+(\d{1,2})\s+DOE[- ]confirmed adjustment was\s+diesel\s*([−\-–+])\s*(?:₱|PHP|P)?\s*([\d.]+)\s*,\s*gasoline\s*([−\-–+])\s*(?:₱|PHP|P)?\s*([\d.]+)/gi;
  const out = new Map();
  for (const m of text.matchAll(re)) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi < 0) continue;
    const z = num(m[3], m[4]);
    const g = num(m[5], m[6]);
    if (!isFinite(z) || !isFinite(g) || Math.abs(g) > 12 || Math.abs(z) > 15) continue; // sanity guard
    const week = toTuesdayIso(mi, +m[2]);
    out.set(week, { week, g, gp: g, z, src: "gaswatch" }); // premium assumed = unleaded
  }
  return [...out.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/weeks") return env.ASSETS.fetch(request);

    const headers = { 
      "content-type": "application/json", 
      "cache-control": "public, max-age=900",
      "access-control-allow-origin": "*"
    };
    try {
      const r = await fetch(SOURCE, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; JustGasBot/1.0)" },
        cf: { cacheTtl: 1800, cacheEverything: true },
      });
      if (!r.ok) throw new Error("source status " + r.status);
      const weeks = parseWeeks(pageText(await r.text()));
      if (!weeks.length) throw new Error("no adjustment found on source page (layout may have changed)");
      return new Response(JSON.stringify({ checked: new Date().toISOString(), weeks }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e.message || e) }), {
        status: 502,
        headers: { ...headers, "cache-control": "no-store" },
      });
    }
  },
};
