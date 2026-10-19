import test from "node:test";
import assert from "node:assert/strict";
import { browserPreviewRequest, PREVIEW_KEY } from "../src/lib/academy/browser-preview";

function storage() {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); } };
}
test("browser preview: personas are synthetic, guardian-scoped and isolated", async () => {
  const one = storage(), two = storage();
  assert.equal((await browserPreviewRequest(one).json()).view.role, null);
  const first = await browserPreviewRequest(one, { action: "enter", role: "guardian" }).json();
  assert.equal(first.view.role, "guardian");
  assert.deepEqual(first.view.students.map((s: { id: string }) => s.id), ["child-1"]);
  browserPreviewRequest(one, { action: "enroll", packageId: "quran", ageBand: "child" });
  assert.equal((await browserPreviewRequest(one).json()).view.students.length, 2);
  browserPreviewRequest(two, { action: "enter", role: "guardian" });
  assert.equal((await browserPreviewRequest(two).json()).view.students.length, 1);
  assert.equal((await browserPreviewRequest(one, { action: "enter", role: "student" }).json()).view.viewer.studentId, "adult-1");
});
test("browser preview: forbidden writes and quota failure leave persisted state unchanged", async () => {
  const s = storage();
  browserPreviewRequest(s, { action: "enter", role: "guardian" });
  const before = s.getItem(PREVIEW_KEY);
  const denied = browserPreviewRequest(s, { action: "assess", studentId: "child-1", level: "developing", notes: "Synthetic" });
  assert.equal((await denied.json()).error, "forbidden");
  assert.equal(s.getItem(PREVIEW_KEY), before);
  const failing = { ...s, setItem() { throw new DOMException("Quota exceeded", "QuotaExceededError"); } };
  const result = browserPreviewRequest(failing, { action: "enroll", packageId: "quran", ageBand: "child" });
  assert.equal((await result.json()).error, "local_storage_unavailable");
  assert.equal(s.getItem(PREVIEW_KEY), before);
});
test("browser preview: malformed storage is rejected, explicit reset recovers without a persona", async () => {
  const s = storage();
  s.setItem(PREVIEW_KEY, '{"version":1,"world":{}}');
  assert.equal(browserPreviewRequest(s).status, 400);
  assert.equal(browserPreviewRequest(s, { action: "reset" }).status, 200);
  assert.equal(s.getItem(PREVIEW_KEY), null);
  assert.equal((await browserPreviewRequest(s).json()).view.role, null);
});
test("browser preview: logout preserves only synthetic world; reset erases it", async () => {
  const s = storage();
  browserPreviewRequest(s, { action: "enter", role: "guardian" });
  browserPreviewRequest(s, { action: "enroll", packageId: "quran", ageBand: "child" });
  browserPreviewRequest(s, { action: "logout" });
  assert.equal((await browserPreviewRequest(s).json()).view.role, null);
  assert.equal((await browserPreviewRequest(s, { action: "enter", role: "guardian" }).json()).view.students.length, 2);
  browserPreviewRequest(s, { action: "reset" });
  assert.equal((await browserPreviewRequest(s, { action: "enter", role: "guardian" }).json()).view.students.length, 1);
});
