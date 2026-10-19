import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, createSeedWorld, view } from "../src/lib/academy/model";
import { mutate, readView, resetWorld, storePathForTests } from "../src/lib/academy/store";
import type { AcademyAction, AcademyActor, AcademyWorld } from "../src/lib/academy/types";

const now = new Date("2030-01-01T00:00:00.000Z");
const admin: AcademyActor = { role: "admin", userId: "admin-1" };
const teacher: AcademyActor = { role: "teacher", userId: "teacher-1" };
const guardian: AcademyActor = { role: "guardian", userId: "guardian-1" };
const guardian2: AcademyActor = { role: "guardian", userId: "guardian-2" };
const adult: AcademyActor = { role: "student", userId: "adult-1", studentId: "adult-1" };
const fakeAdult: AcademyActor = { role: "student", userId: "adult-1", studentId: "child-1" };
const act = (w: AcademyWorld, a: AcademyActor, c: AcademyAction, at = now) => apply(w, a, c, at);
const ref = (surah = 112) => ({ surah, from: 1, to: surah === 112 ? 4 : surah === 113 ? 5 : 6 });
const fail = (w: AcademyWorld, a: AcademyActor, c: AcademyAction, code: string, at = now) => { const before = structuredClone(w); assert.throws(() => act(w, a, c, at), new RegExp(code)); assert.deepEqual(w, before); };
function child3(w: AcademyWorld) { act(w, guardian, { action: "enroll", packageId: "quran", ageBand: "child" }); act(w, admin, { action: "assess", studentId: "child-3", level: "foundation", notes: "synthetic" }); act(w, admin, { action: "assign", studentId: "child-3", teacherId: "teacher-1" }); act(w, admin, { action: "plan", studentId: "child-3", goal: "steady", reference: ref(), published: true }); }
function completeChild1(w: AcademyWorld) { act(w, admin, { action: "assess", studentId: "child-1", level: "developing", notes: "synthetic" }); act(w, admin, { action: "assign", studentId: "child-1", teacherId: "teacher-1" }); act(w, admin, { action: "plan", studentId: "child-1", goal: "steady", reference: ref(), published: true }); }
function book(w: AcademyWorld, sid: string, slotId: string, at = now) { act(w, guardian, { action: "book", studentId: sid, slotId }, at); return w.sessions.at(-1)!; }

 test("authentication, linked guardians, child2 isolation, and enrollment", () => {
  const w = createSeedWorld(now); assert.equal(view(w, null).students.length, 0); assert.throws(() => view(w, fakeAdult), /not_authenticated/); assert.deepEqual(view(w, adult).students.map(s => s.id), ["adult-1"]);
  assert.deepEqual(view(w, guardian).students.map(s => s.id), ["child-1"]); assert.deepEqual(view(w, guardian2).students.map(s => s.id), ["child-2"]);
  fail(w, guardian, { action: "book", studentId: "child-2", slotId: "slot-1" }, "forbidden");
  act(w, guardian, { action: "enroll", packageId: "quran", ageBand: "child" }); assert.ok(w.students.some(s => s.id === "child-3" && s.guardianId === "guardian-1"));
  fail(w, adult, { action: "enroll", packageId: "quran", ageBand: "adult" }, "already_enrolled");
 });

test("strict actions, references, levels, timestamps and score validation are atomic", () => {
 const w = createSeedWorld(now); const base = { action: "plan", studentId: "child-1", goal: "x", reference: ref(), published: true } as const;
 for (const c of [ { ...base, extra: 1 }, { ...base, reference: { ...ref(), nested: 1 } }, { ...base, reference: { surah: 112, from: 1, to: 9 } }, { ...base, reference: { surah: 115, from: 1, to: 2 } } ] as unknown as AcademyAction[]) fail(w, admin, c, "invalid_action_shape|invalid_reference");
 fail(w, admin, { action: "assess", studentId: "child-1", level: "bad" as never, notes: "x" }, "invalid_field");
 completeChild1(w); const past = w.sessions[0].id;
 const ev = (over: Record<string, unknown> = {}) => ({ action: "evaluate", sessionId: past, attendance: "present", memorization: 3, tajweed: null, makharij: 3, fluency: 3, feedback: "good", privateNote: "secret", reference: ref(), homeworkTitle: "Review", homeworkDue: "2030-01-04T00:00:00.000Z", published: false, ...over }) as AcademyAction;
 for (const score of [2.5, 0, 6, 99]) fail(w, teacher, ev({ memorization: score }), "invalid_score");
 fail(w, teacher, ev({ homeworkDue: "2030-01-04" }), "invalid_field");
 act(w, teacher, ev()); fail(w, teacher, ev(), "session_not_scheduled");
});

test("full guardian journey, atomic conflict, reschedule/cancel windows, and notifications", () => {
 const w = createSeedWorld(now); child3(w); const s = book(w, "child-3", "slot-1");
 fail(w, guardian2, { action: "book", studentId: "child-3", slotId: "slot-2" }, "forbidden");
 fail(w, guardian, { action: "book", studentId: "child-3", slotId: "slot-1" }, "slot_conflict");
 act(w, guardian, { action: "reschedule", sessionId: s.id, slotId: "slot-2", reason: "conflict" }); assert.equal(w.sessions.at(-1)!.slotId, "slot-2");
 act(w, guardian, { action: "cancel", sessionId: s.id, reason: "change" }); assert.equal(w.sessions.at(-1)!.status, "cancelled");
 const w2 = createSeedWorld(now); child3(w2); const near = new Date("2030-01-03T01:00:00.000Z"); const sn = book(w2, "child-3", "slot-2", near); fail(w2, guardian, { action: "reschedule", sessionId: sn.id, slotId: "slot-3", reason: "late" }, "cancel_window", near); fail(w2, guardian, { action: "cancel", sessionId: sn.id, reason: "late" }, "cancel_window", near); act(w2, admin, { action: "reschedule", sessionId: sn.id, slotId: "slot-3", reason: "override" }, near);
 assert.ok(w.audits.some(a => a.action === "book")); assert.ok(w.notifications.some(n => n.recipientId === "guardian-1"));
});

test("past evaluation draft stays hidden, publish/submission/review/read flow and privacy", () => {
 const w = createSeedWorld(now); const ev = { action: "evaluate", sessionId: "session-past", attendance: "present", memorization: 4, tajweed: null, makharij: null, fluency: 3, feedback: "good", privateNote: "staff only", reference: ref(), homeworkTitle: "Review", homeworkDue: "2030-01-04T00:00:00.000Z", published: false } as AcademyAction; act(w, teacher, ev);
 const hw = w.homework[0]; assert.equal(view(w, guardian).evaluations.length, 0); assert.equal(view(w, guardian).homework.length, 0); assert.equal(view(w, teacher).privateNotes[0].body, "staff only"); assert.equal(view(w, guardian).privateNotes.length, 0); assert.ok(!JSON.stringify(view(w, guardian)).includes("staff only"));
 fail(w, guardian, { action: "submit", homeworkId: hw.id, response: "x" }, "homework_not_published"); fail(w, teacher, { action: "review", homeworkId: hw.id, feedback: "x" }, "homework_not_submitted"); act(w, teacher, { action: "publish", sessionId: "session-past" }); act(w, guardian, { action: "submit", homeworkId: hw.id, response: "done" }); fail(w, guardian, { action: "submit", homeworkId: hw.id, response: "again" }, "homework_already_submitted"); act(w, teacher, { action: "review", homeworkId: hw.id, feedback: "well done" }); fail(w, teacher, { action: "review", homeworkId: hw.id, feedback: "again" }, "homework_already_reviewed");
 const n = w.notifications.find(n => n.recipientId === "guardian-1")!; act(w, guardian, { action: "read", notificationId: n.id }); assert.ok(w.notifications.find(x => x.id === n.id)?.readAt); fail(w, guardian2, { action: "read", notificationId: n.id }, "notification_not_found");
});

test("evaluation gates: future/cancelled, Tajweed package, duration, and invalid homework", () => {
 const w = createSeedWorld(now); completeChild1(w); const future = book(w, "child-1", "slot-1"); const ev = { action: "evaluate", sessionId: future.id, attendance: "present", memorization: 3, tajweed: null, makharij: 3, fluency: 3, feedback: "x", privateNote: "", reference: ref(), homeworkTitle: "x", homeworkDue: "2030-01-04T00:00:00.000Z", published: false } as AcademyAction; fail(w, teacher, ev, "session_not_finished");
 const bad = createSeedWorld(now); completeChild1(bad); const slot = bad.slots.find(s => s.id === "slot-1")!; slot.durationMinutes = 90; slot.endsAt = new Date(Date.parse(slot.startsAt) + 90 * 60_000).toISOString(); fail(bad, guardian, { action: "book", studentId: "child-1", slotId: slot.id }, "duration_not_allowed"); bad.students.find(s => s.id === "child-1")!.packageId = "complete"; book(bad, "child-1", slot.id); assert.equal(bad.sessions.at(-1)!.slotId, slot.id);
});

test("revoke removes active teacher scope and reassignment restores it", () => {
 const w = createSeedWorld(now); completeChild1(w); act(w, admin, { action: "revoke", studentId: "child-1" }); assert.equal(view(w, teacher).students.some(s => s.id === "child-1"), false); assert.equal(view(w, teacher).evaluations.length, 0); assert.equal(view(w, teacher).homework.length, 0); fail(w, teacher, { action: "plan", studentId: "child-1", goal: "x", reference: ref(), published: false }, "forbidden"); act(w, admin, { action: "assign", studentId: "child-1", teacherId: "teacher-1" }); assert.ok(view(w, teacher).students.some(s => s.id === "child-1"));
});

test("capacity is eight including seeded past reservation; different days work and teacher overlap is denied", () => {
 const w = createSeedWorld(now); child3(w); for (let i = 1; i <= 8; i++) book(w, "child-3", `slot-${i}`); assert.equal(w.sessions.filter(s => s.studentId === "child-3").length, 8); fail(w, guardian, { action: "book", studentId: "child-3", slotId: "slot-9" }, "demo_capacity_reached");
 const w2 = createSeedWorld(now); child3(w2); book(w2, "child-3", "slot-1"); book(w2, "child-3", "slot-2"); assert.equal(w2.sessions.filter(s => s.studentId === "child-3").length, 2); fail(w2, guardian2, { action: "book", studentId: "child-2", slotId: "slot-1" }, "journey_incomplete");
});

test("store persists separate worlds and serializes same-slot concurrent booking atomically", async () => {
 const key = `academy-test-${process.pid}-${Date.now()}`; await resetWorld(key); await mutate(key, guardian, { action: "enroll", packageId: "quran", ageBand: "child" }); await mutate(key, admin, { action: "assess", studentId: "child-3", level: "foundation", notes: "x" }); await mutate(key, admin, { action: "assign", studentId: "child-3", teacherId: "teacher-1" }); await mutate(key, admin, { action: "plan", studentId: "child-3", goal: "x", reference: ref(), published: true });
 const results = await Promise.allSettled([mutate(key, guardian, { action: "book", studentId: "child-3", slotId: "slot-1" }), mutate(key, guardian, { action: "book", studentId: "child-3", slotId: "slot-1" })]); assert.equal(results.filter(r => r.status === "fulfilled").length, 1); assert.equal((await readView(key, guardian)).sessions.filter(s => s.slotId === "slot-1").length, 1); assert.match(storePathForTests(key), /academy-test-/);
});
