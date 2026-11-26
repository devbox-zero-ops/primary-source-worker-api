import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest, parseFredCsv } from "../src/worker.mjs";

test("parseFredCsv extracts latest observations and delta", () => {
  const csv = "observation_date,ICSA\n2026-11-14,202000\n2026-11-21,189000\n";
  const res = parseFredCsv(csv, "ICSA", 5);
  assert.equal(res.count, 2);
  assert.equal(res.latest.value, 189000);
  assert.equal(res.delta, -13000);
});

test("health endpoint and RapidAPI secret guard work cleanly", async () => {
  const r1 = await handleRequest(new Request("https://api.example.com/v1/health"));
  assert.equal(r1.status, 200);
  const b1 = await r1.json();
  assert.equal(b1.status, "ok");

  const r2 = await handleRequest(
    new Request("https://api.example.com/v1/health"),
    { RAPIDAPI_PROXY_SECRET: "top-secret" },
  );
  assert.equal(r2.status, 401);

  const r3 = await handleRequest(
    new Request("https://api.example.com/v1/health", {
      headers: { "X-RapidAPI-Proxy-Secret": "top-secret" },
    }),
    { RAPIDAPI_PROXY_SECRET: "top-secret" },
  );
  assert.equal(r3.status, 200);
});

test("agentic-audit scores valid MVP 0.3 site as 100 A+", async () => {
  const mockFetch = async () => new Response("{}", { status: 200 });
  const r = await handleRequest(
    new Request("https://api.example.com/v1/agentic-audit?url=https://devbox-zero-ops.github.io/verimesh-agentic-web/"),
    {},
    mockFetch,
  );
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.score, 100);
  assert.equal(d.grade, "A+");
});
