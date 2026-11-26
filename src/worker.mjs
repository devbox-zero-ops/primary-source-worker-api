const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-RapidAPI-Key, X-RapidAPI-Host, X-RapidAPI-Proxy-Secret",
  "Content-Type": "application/json; charset=utf-8",
};

const UA = "DevBoxZeroOps-MicroAPI/1.0 (+https://github.com/devbox-zero-ops)";

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers: CORS_HEADERS });
}

export function parseFredCsv(csvText, series, limit = 10) {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((ln) => ln && !ln.startsWith("observation_date"));
  const rows = [];
  for (const ln of lines.slice(-limit)) {
    const [date, rawVal] = ln.split(",");
    if (!date || !rawVal || rawVal === ".") continue;
    const value = Number(rawVal);
    if (Number.isFinite(value)) rows.push({ date, value });
  }
  const latest = rows[rows.length - 1] || null;
  const prev = rows.length >= 2 ? rows[rows.length - 2] : null;
  const delta = latest && prev ? Number((latest.value - prev.value).toFixed(4)) : null;
  return { series, count: rows.length, latest, delta, rows };
}

export async function handleRequest(request, env = {}, fetchImpl = fetch) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResp({ error: "method_not_allowed" }, 405);
  }

  // Optional RapidAPI proxy secret enforcement when configured in Worker secrets
  if (env.RAPIDAPI_PROXY_SECRET) {
    const provided = request.headers.get("X-RapidAPI-Proxy-Secret");
    if (provided !== env.RAPIDAPI_PROXY_SECRET) {
      return jsonResp({ error: "unauthorized", message: "Invalid X-RapidAPI-Proxy-Secret" }, 401);
    }
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const now = new Date().toISOString();

  if (path === "/" || path === "/v1/health") {
    return jsonResp({
      service: env.SERVICE_NAME || "Primary-Source & Agentic Web Micro-API",
      version: env.SERVICE_VERSION || "1.0.0",
      status: "ok",
      timestamp: now,
      endpoints: [
        "/v1/health",
        "/v1/fred?series=ICSA&limit=10",
        "/v1/defillama?protocol=aave",
        "/v1/github/releases?repo=oven-sh/bun&limit=5",
        "/v1/agentic-audit?url=https://devbox-zero-ops.github.io/verimesh-agentic-web/",
      ],
    });
  }

  if (path === "/v1/fred") {
    const series = (url.searchParams.get("series") || "ICSA").trim().toUpperCase();
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 10)));
    if (!/^[A-Z0-9_]+$/.test(series)) {
      return jsonResp({ error: "invalid_series" }, 400);
    }
    const sourceUrl = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(series)}&cosd=2024-01-01`;
    const r = await fetchImpl(sourceUrl, { headers: { "User-Agent": UA } });
    if (!r.ok) return jsonResp({ error: "upstream_error", status: r.status, sourceUrl }, 502);
    const parsed = parseFredCsv(await r.text(), series, limit);
    return jsonResp({ ...parsed, sourceUrl, fetchedAt: now });
  }

  if (path === "/v1/defillama") {
    const protocol = (url.searchParams.get("protocol") || "aave").trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(protocol)) {
      return jsonResp({ error: "invalid_protocol" }, 400);
    }
    const sourceUrl = `https://api.llama.fi/protocol/${encodeURIComponent(protocol)}`;
    const r = await fetchImpl(sourceUrl, { headers: { "User-Agent": UA } });
    if (!r.ok) return jsonResp({ error: "upstream_error", status: r.status, sourceUrl }, 502);
    const d = await r.json();
    const tvlArr = Array.isArray(d.tvl) ? d.tvl : [];
    const latestTvlUsd = tvlArr.length ? Number(tvlArr[tvlArr.length - 1].totalLiquidityUSD) : null;
    return jsonResp({
      protocol: d.name || protocol,
      symbol: d.symbol || null,
      category: d.category || null,
      latestTvlUsd: latestTvlUsd !== null ? Math.round(latestTvlUsd * 100) / 100 : null,
      chains: Array.isArray(d.chains) ? d.chains.slice(0, 12) : [],
      sourceUrl,
      fetchedAt: now,
    });
  }

  if (path === "/v1/github/releases") {
    const repo = (url.searchParams.get("repo") || "oven-sh/bun").trim();
    const limit = Math.max(1, Math.min(30, Number(url.searchParams.get("limit") || 5)));
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      return jsonResp({ error: "invalid_repo" }, 400);
    }
    const sourceUrl = `https://api.github.com/repos/${repo}/releases?per_page=${limit}`;
    const r = await fetchImpl(sourceUrl, { headers: { "User-Agent": UA, Accept: "application/vnd.github+json" } });
    if (!r.ok) return jsonResp({ error: "upstream_error", status: r.status, sourceUrl }, 502);
    const rels = await r.json();
    return jsonResp({
      repo,
      count: rels.length,
      releases: rels.slice(0, limit).map((x) => ({
        tag: x.tag_name,
        name: x.name,
        prerelease: Boolean(x.prerelease),
        publishedAt: x.published_at,
        htmlUrl: x.html_url,
      })),
      sourceUrl,
      fetchedAt: now,
    });
  }

  if (path === "/v1/agentic-audit") {
    const targetRaw = (url.searchParams.get("url") || "").trim();
    if (!targetRaw || !/^https:\/\//i.test(targetRaw)) {
      return jsonResp({ error: "invalid_url", message: "Provide an https:// target url" }, 400);
    }
    const base = targetRaw.endsWith("/") ? targetRaw : `${targetRaw}/`;
    const checks = [
      { id: "agent_manifest", url: `${base}agent-manifest.json`, weight: 40 },
      { id: "nsdeploy", url: `${base}.well-known/nsdeploy.json`, weight: 30 },
      { id: "homepage", url: base, weight: 30 },
    ];
    let score = 0;
    const results = [];
    for (const c of checks) {
      try {
        const resp = await fetchImpl(c.url, { headers: { "User-Agent": UA } });
        const ok = resp.ok;
        if (ok) score += c.weight;
        results.push({ id: c.id, url: c.url, status: resp.status, ok });
      } catch (err) {
        results.push({ id: c.id, url: c.url, status: 0, ok: false, error: String(err.message || err) });
      }
    }
    const grade = score >= 95 ? "A+" : score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "F";
    return jsonResp({ target: base, score, grade, checks: results, auditedAt: now });
  }

  return jsonResp({ error: "not_found", path }, 404);
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
