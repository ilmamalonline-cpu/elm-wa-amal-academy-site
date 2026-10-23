import { test } from "node:test";
import assert from "node:assert/strict";
import { TEACHER_DEMO_SEED, cloneTeacherDemoSeed, sessionsForTeacher, updateTeacherDemoSession } from "../src/lib/academy/teacher-demo";

test("seed is numbered, synthetic and all sessions are individual assigned lessons", () => {
  assert.equal(TEACHER_DEMO_SEED.teachers.length, 2);
  assert.equal(TEACHER_DEMO_SEED.sessions.length, 4);
  assert.equal(new Set(TEACHER_DEMO_SEED.sessions.map(s => s.id)).size, 4);
  for (const s of TEACHER_DEMO_SEED.sessions) {
    assert.match(s.studentLabel, /^Student \d{2}$/);
    assert.ok(TEACHER_DEMO_SEED.teachers.some(t => t.id === s.teacherId));
    assert.ok(s.duration > 0);
  }
});
test("new clone is independent and update touches only the target session", () => {
  const baseline = JSON.stringify(TEACHER_DEMO_SEED);
  const data = cloneTeacherDemoSeed();
  const result = updateTeacherDemoSession(data, "session-101", { attendance: "attended", completion: "completed", outcome: "Synthetic outcome", followup: "Synthetic follow-up" });
  assert.equal(result.sessions[0].outcome, "Synthetic outcome");
  assert.deepEqual(result.sessions.slice(1), data.sessions.slice(1));
  assert.equal(JSON.stringify(TEACHER_DEMO_SEED), baseline);
  assert.equal(JSON.stringify(data), baseline);
  result.sessions[1].outcome = "mutation";
  result.teachers[0].label = "mutation";
  assert.equal(JSON.stringify(data), baseline);
  assert.deepEqual(cloneTeacherDemoSeed(), TEACHER_DEMO_SEED);
  assert.deepEqual(updateTeacherDemoSession(data, "unknown-id", { outcome: "must not apply" }), data);
});
test("assigned schedule projection excludes other teachers and returns copies", () => {
  const data = cloneTeacherDemoSeed();
  const a = sessionsForTeacher(data, "teacher-01");
  const b = sessionsForTeacher(data, "teacher-02");
  assert.equal(a.length, 2); assert.equal(b.length, 2);
  assert.ok(a.every(s => s.teacherId === "teacher-01"));
  assert.ok(b.every(s => !a.some(x => x.id === s.id)));
  a[0].outcome = "mutation";
  assert.equal(data.sessions[0].outcome, "");
  assert.deepEqual(sessionsForTeacher(data, "unknown-teacher"), []);
});
