import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { consumeRateLimit } from "./rate-limit.ts";

const API_ROOT = path.join(process.cwd(), "src/app/api");

function routeFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...routeFiles(full));
    } else if (entry === "route.ts") {
      files.push(full);
    }
  }
  return files;
}

test("every database and paid API handler asks for a session first", () => {
  const files = routeFiles(API_ROOT).filter((file) => !file.includes(`${path.sep}auth${path.sep}`));
  assert.ok(files.length >= 20);

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const handlers = text.match(/export async function (GET|POST|PUT|DELETE|PATCH)\(/g) ?? [];
    const gates = text.match(/requireApiUser\(/g) ?? [];
    assert.equal(
      gates.length,
      handlers.length,
      `${path.relative(process.cwd(), file)} has ${handlers.length} handlers and ${gates.length} session checks`
    );

    for (const handler of text.split(/export async function /).slice(1)) {
      const body = handler.slice(handler.indexOf(") {"));
      const gateAt = body.indexOf("requireApiUser(");
      const dbAt = body.indexOf("getDb(");
      const anthropicAt = body.indexOf("messages.create");
      assert.ok(gateAt >= 0, path.relative(process.cwd(), file));
      if (dbAt >= 0) {
        assert.ok(gateAt < dbAt, `${path.relative(process.cwd(), file)} opens the database before auth`);
      }
      if (anthropicAt >= 0) {
        assert.ok(
          gateAt < anthropicAt,
          `${path.relative(process.cwd(), file)} calls Anthropic before auth`
        );
      }
    }
  }
});

test("anthropic routes rate limit before the paid call", () => {
  for (const relative of [
    "src/app/api/coach/route.ts",
    "src/app/api/review/daily/route.ts",
    "src/app/api/review/weekly/route.ts",
  ]) {
    const text = readFileSync(path.join(process.cwd(), relative), "utf8");
    const limitAt = text.indexOf("enforceAnthropicRateLimit(");
    const callAt = text.indexOf("messages.create");
    assert.ok(limitAt >= 0 && callAt >= 0 && limitAt < callAt, relative);
  }
});

test("rate limit blocks after the window fills and allows again once it slides", () => {
  const key = "user:rate-limit-spec";
  assert.equal(consumeRateLimit(key, 2, 1_000, 0).ok, true);
  assert.equal(consumeRateLimit(key, 2, 1_000, 10).ok, true);
  const blocked = consumeRateLimit(key, 2, 1_000, 20);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.retryAfterSeconds, 1);
  }
  assert.equal(consumeRateLimit(key, 2, 1_000, 1_000).ok, true);
});
