import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { apply, createSeedWorld } from "../src/lib/academy/model";
import { mutate, readView, resetWorld, setSessionRole, storePathForTests } from "../src/lib/academy/store";
import type { AcademyAction, AcademyActor } from "../src/lib/academy/types";

// Regression tests for audit phase 1 (findings F1-F3). Pure Node: no database, no network.
const now = new Date("2030-01-01T00:00:00.000Z");
const guardian: AcademyActor = { role: "guardian", userId: "guardian-1" };
const newKey = () => randomBytes(24).toString("base64url"); // 32 chars, same shape as the route's cookie
const rolePath = (key: string) => join(dirname(storePathForTests(key)), `.${key}.role`);
const cleanup = (key: string) => { rmSync(storePathForTests(key), { force: true }); rmSync(rolePath(key), { force: true }); };

test("F1: inherited-property and non-string action values are rejected as invalid_action_shape and never commit", () => {
  const w = createSeedWorld(now);
  const before = structuredClone(w);
  const bad: unknown[] = [
    { action: "constructor" }, { action: "__proto__" }, { action: "toString" },
    { action: "hasOwnProperty" }, { action: "valueOf" },
    // An array stringifies to a real action name; before the fix it passed the shape check
    // and committed an audit record without performing any action.
    { action: ["enroll"], packageId: "quran", ageBand: "child" },
    { action: 5 }, { action: null }, { action: {} }, { action: true },
  ];
  for (const command of bad) {
    assert.throws(
      () => apply(w, guardian, command as AcademyAction, now),
      (error: unknown) => error instanceof Error && error.message === "invalid_action_shape",
      JSON.stringify(command),
    );
    assert.deepEqual(w, before, `world must be untouched after ${JSON.stringify(command)}`);
  }
});

test("F2: an explicit reset recovers a session whose stored world is unreadable", async () => {
  const key = newKey();
  try {
    await setSessionRole(key, "guardian");
    await mutate(key, guardian, { action: "enroll", packageId: "quran", ageBand: "child" });
    for (const corrupt of ["{ corrupted", "null", "[]", "42"]) {
      writeFileSync(storePathForTests(key), corrupt);
      // Malformed state is rejected (same contract as the browser adapter) ...
      await assert.rejects(() => readView(key, guardian), `precondition: ${corrupt} must be unreadable`);
      // ... but reset must not depend on reading it.
      const projected = await resetWorld(key);
      assert.equal(projected.role, null);
      const restored = await readView(key, guardian);
      assert.deepEqual(restored.students.map((s) => s.id), ["child-1"], "seed world restored after reset");
    }
  } finally { cleanup(key); }
});

test("F3: a read creates (pins) the seed world once but never rewrites an existing world file", async () => {
  const key = newKey();
  try {
    await setSessionRole(key, "guardian");
    assert.equal(existsSync(storePathForTests(key)), false, "no world file before the first read");
    await readView(key, guardian);
    assert.equal(existsSync(storePathForTests(key)), true, "first read pins the seed (slot times) on disk");
    const old = new Date("2020-01-01T00:00:00.000Z");
    utimesSync(storePathForTests(key), old, old);
    await readView(key, guardian);
    await readView(key, guardian);
    assert.equal(statSync(storePathForTests(key)).mtimeMs, old.getTime(), "later reads must not rewrite the file");
    // Mutations still persist.
    await mutate(key, guardian, { action: "enroll", packageId: "quran", ageBand: "child" });
    assert.ok(statSync(storePathForTests(key)).mtimeMs > old.getTime(), "mutations still write");
    assert.deepEqual((await readView(key, guardian)).students.map((s) => s.id), ["child-1", "child-3"]);
  } finally { cleanup(key); }
});
