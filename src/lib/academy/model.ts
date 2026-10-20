import { site } from "../../content/site";
import type {
  AcademyAction,
  AcademyActor,
  AcademyPackage,
  AcademyView,
  AcademyWorld,
  DemoUser,
  Evaluation,
  PlanReference,
  Session,
  Slot,
  Student,
} from "./types";

/** The public catalog is the single source for prices and lesson durations. */
export const PACKAGES: readonly AcademyPackage[] = site.ar.packages.map(
  (p) => ({
    id:
      p.id === "quran-noor"
        ? "noor"
        : p.id === "quran-noor-tajweed"
          ? "complete"
          : "quran",
    title: p.title,
    price: p.price,
    currency: "SAR",
    durationMinutes: p.duration as 60 | 90,
    lessons: 8,
  }),
);
const DAY = 86_400_000;
const uid = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`;
const fail = (code: string): never => {
  throw new Error(code);
};
export const DOMAIN_ERRORS = new Set([
  "invalid_action_shape",
  "invalid_field",
  "invalid_reference",
  "invalid_score",
  "not_authenticated",
  "student_not_found",
  "forbidden",
  "already_enrolled",
  "teacher_not_found",
  "assessment_required",
  "assignment_required",
  "assignment_not_found",
  "journey_incomplete",
  "duration_not_allowed",
  "demo_capacity_reached",
  "slot_conflict",
  "slot_unavailable",
  "session_not_found",
  "session_not_scheduled",
  "cancel_window",
  "session_not_finished",
  "evaluation_exists",
  "evaluation_not_found",
  "tajweed_requires_complete",
  "homework_not_found",
  "homework_not_published",
  "homework_already_submitted",
  "homework_not_submitted",
  "homework_already_reviewed",
  "notification_not_found",
  "route_action_only",
]);
function text(value: unknown, max = 1000, optional = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!optional && !value.trim()) ||
    value.trim() !== value ||
    Array.from(value).some((char) => {
      const code = char.charCodeAt(0);
      return (
        code < 9 ||
        code === 11 ||
        code === 12 ||
        (code > 13 && code < 32) ||
        code === 127
      );
    })
  )
    fail("invalid_field");
  return value as string;
}
function reference(value: unknown): PlanReference {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("invalid_reference");
  const r = value as Record<string, unknown>;
  const count =
    r.surah === 112 ? 4 : r.surah === 113 ? 5 : r.surah === 114 ? 6 : 0;
  if (
    Object.keys(r).sort().join(",") !== "from,surah,to" ||
    !count ||
    !Number.isSafeInteger(r.from) ||
    !Number.isSafeInteger(r.to) ||
    Number(r.from) < 1 ||
    Number(r.to) < Number(r.from) ||
    Number(r.to) > count
  )
    fail("invalid_reference");
  return { surah: Number(r.surah), from: Number(r.from), to: Number(r.to) };
}
function score(value: unknown): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 5
  )
    fail("invalid_score");
  return value as number;
}
function timestamp(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail("invalid_field");
  return value as string;
}
const SHAPES: Record<string, string[]> = {
  enroll: ["packageId", "ageBand"],
  assess: ["studentId", "level", "notes"],
  assign: ["studentId", "teacherId"],
  revoke: ["studentId"],
  plan: ["studentId", "goal", "reference", "published"],
  book: ["studentId", "slotId"],
  reschedule: ["sessionId", "slotId", "reason"],
  cancel: ["sessionId", "reason"],
  evaluate: [
    "sessionId",
    "attendance",
    "memorization",
    "tajweed",
    "makharij",
    "fluency",
    "feedback",
    "privateNote",
    "reference",
    "homeworkTitle",
    "homeworkDue",
    "published",
  ],
  publish: ["sessionId"],
  submit: ["homeworkId", "response"],
  review: ["homeworkId", "feedback"],
  read: ["notificationId"],
};
function strict(command: AcademyAction) {
  if (!command || typeof command !== "object" || Array.isArray(command))
    fail("invalid_action_shape");
  // SHAPES is a plain object: accept only own properties looked up by a string name, so
  // inherited keys ("constructor", "__proto__", ...) and values that merely stringify to an
  // action name (e.g. ["enroll"]) can neither throw a TypeError nor reach perform().
  const name: unknown = command.action;
  if (
    typeof name !== "string" ||
    !Object.prototype.hasOwnProperty.call(SHAPES, name)
  )
    fail("invalid_action_shape");
  const expected = SHAPES[name as string];
  if (
    Object.keys(command).sort().join(",") !==
      ["action", ...expected].sort().join(",")
  )
    fail("invalid_action_shape");
}
export function createSeedWorld(now = new Date()): AcademyWorld {
  const past = new Date(now.getTime() - 3 * DAY).toISOString();
  const users: DemoUser[] = [
    { id: "admin-1", role: "admin", name: "مدير تجريبي" },
    { id: "teacher-1", role: "teacher", name: "معلم تجريبي" },
    { id: "guardian-1", role: "guardian", name: "ولي أمر تجريبي" },
    { id: "guardian-2", role: "guardian", name: "ولي أمر آخر للاختبار" },
    {
      id: "adult-1",
      role: "student",
      name: "طالب بالغ تجريبي",
      studentId: "adult-1",
    },
  ];
  const students: Student[] = [
    {
      id: "child-1",
      name: "الطالب التجريبي 1",
      ageBand: "child",
      guardianId: "guardian-1",
      packageId: "quran",
      enrolledAt: past,
    },
    {
      id: "child-2",
      name: "طالب أسرة أخرى — اصطناعي",
      ageBand: "child",
      guardianId: "guardian-2",
    },
    {
      id: "adult-1",
      name: "الطالب البالغ التجريبي",
      ageBand: "adult",
      packageId: "noor",
      enrolledAt: past,
    },
  ];
  const slots: Slot[] = Array.from({ length: 12 }, (_, i) => {
    const start = new Date(now.getTime() + (i + 2) * DAY);
    start.setUTCMinutes(0, 0, 0);
    return {
      id: `slot-${i + 1}`,
      teacherId: "teacher-1",
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
      durationMinutes: 60,
    };
  });
  const pastSlot: Slot = {
    id: "slot-past",
    teacherId: "teacher-1",
    startsAt: new Date(Date.parse(past) - 3_600_000).toISOString(),
    endsAt: past,
    durationMinutes: 60,
  };
  slots.push(pastSlot);
  return {
    users,
    students,
    slots,
    assessments: ["child-1", "adult-1"].map((studentId, i) => ({
      id: `assessment-${i}`,
      studentId,
      level: "developing",
      notes: "تقييم اصطناعي أولي / Synthetic placement example",
      createdAt: past,
      createdBy: "admin-1",
    })),
    assignments: ["child-1", "adult-1"].map((studentId, i) => ({
      id: `assignment-${i}`,
      studentId,
      teacherId: "teacher-1",
      active: true,
      createdAt: past,
      createdBy: "admin-1",
    })),
    plans: ["child-1", "adult-1"].map((studentId, i) => ({
      id: `plan-${i}`,
      studentId,
      goal: "ثبات الحفظ والمراجعة / Consistent memorization and revision",
      reference: { surah: 112, from: 1, to: 4 },
      published: true,
      createdAt: past,
      createdBy: "teacher-1",
    })),
    sessions: [
      {
        id: "session-past",
        studentId: "child-1",
        teacherId: "teacher-1",
        slotId: pastSlot.id,
        packageId: "quran",
        startsAt: pastSlot.startsAt,
        endsAt: pastSlot.endsAt,
        status: "scheduled",
        createdAt: past,
      },
    ],
    evaluations: [],
    homework: [],
    notifications: [],
    audits: [],
  };
}
function user(world: AcademyWorld, actor: AcademyActor): DemoUser {
  const found = world.users.find(
    (u) => u.id === actor.userId && u.role === actor.role,
  );
  if (
    !found ||
    (found.role === "student" && found.studentId !== actor.studentId)
  )
    fail("not_authenticated");
  return found!;
}
function student(world: AcademyWorld, id: string): Student {
  const found = world.students.find((s) => s.id === id);
  if (!found) fail("student_not_found");
  return found!;
}
function assigned(world: AcademyWorld, studentId: string) {
  return world.assignments.find((a) => a.studentId === studentId && a.active);
}
function canSee(
  world: AcademyWorld,
  actor: AcademyActor,
  studentId: string,
): boolean {
  const viewer = user(world, actor);
  const learner = student(world, studentId);
  if (viewer.role === "admin") return true;
  if (viewer.role === "teacher")
    return assigned(world, studentId)?.teacherId === viewer.id;
  if (viewer.role === "guardian") return learner.guardianId === viewer.id;
  return viewer.studentId === learner.id && learner.ageBand === "adult";
}
function need(world: AcademyWorld, actor: AcademyActor, studentId: string) {
  if (!canSee(world, actor, studentId)) fail("forbidden");
}
function latestPlan(world: AcademyWorld, studentId: string) {
  return world.plans.filter((p) => p.studentId === studentId).at(-1);
}
function overlaps(
  a: Pick<Slot, "startsAt" | "endsAt">,
  b: Pick<Slot, "startsAt" | "endsAt">,
) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}
function owner(world: AcademyWorld, studentId: string) {
  const s = student(world, studentId);
  return s.guardianId ?? s.id;
}
function notify(
  world: AcademyWorld,
  recipientId: string,
  kind: string,
  message: string,
  now: Date,
) {
  world.notifications.push({
    id: uid("notification"),
    recipientId,
    kind,
    message,
    createdAt: now.toISOString(),
  });
}
function homeworkPublished(world: AcademyWorld, sessionId: string) {
  return world.evaluations.some(
    (e) => e.sessionId === sessionId && e.published,
  );
}
export function view(
  world: AcademyWorld,
  actor: AcademyActor | null,
): AcademyView {
  const empty: AcademyView = {
    mode: "synthetic-only",
    role: null,
    viewer: null,
    packages: [...PACKAGES],
    teachers: [],
    students: [],
    assessments: [],
    assignments: [],
    plans: [],
    slots: [],
    sessions: [],
    evaluations: [],
    privateNotes: [],
    audits: [],
    homework: [],
    notifications: [],
  };
  if (!actor) return empty;
  const viewer = user(world, actor);
  const staff = viewer.role === "admin" || viewer.role === "teacher";
  const ids = world.students
    .filter((s) => canSee(world, actor, s.id))
    .map((s) => s.id);
  const sessions = world.sessions.filter(
    (s) =>
      ids.includes(s.studentId) &&
      (viewer.role !== "teacher" || s.teacherId === viewer.id),
  );
  const sessionIds = new Set(sessions.map((s) => s.id));
  const evaluations = world.evaluations.filter(
    (e) => sessionIds.has(e.sessionId) && (staff || e.published),
  );
  const teacherIds = new Set(
    world.assignments
      .filter((a) => ids.includes(a.studentId) && a.active)
      .map((a) => a.teacherId),
  );
  return {
    ...empty,
    role: viewer.role,
    viewer,
    students: world.students.filter((s) => ids.includes(s.id)),
    teachers: world.users
      .filter(
        (u) =>
          u.role === "teacher" &&
          (viewer.role === "admin" || teacherIds.has(u.id)),
      )
      .map((u) => ({ id: u.id, name: u.name })),
    assessments: world.assessments.filter((a) => ids.includes(a.studentId)),
    assignments: world.assignments.filter((a) => ids.includes(a.studentId)),
    plans: staff
      ? world.plans.filter((p) => ids.includes(p.studentId))
      : ids.flatMap((id) => {
          const p = latestPlan(world, id);
          return p?.published ? [p] : [];
        }),
    slots: world.slots.filter(
      (s) =>
        viewer.role === "admin" ||
        (viewer.role === "teacher"
          ? s.teacherId === viewer.id
          : teacherIds.has(s.teacherId)),
    ),
    sessions,
    evaluations: evaluations.map((e) => {
      const safe = { ...e };
      const { privateNote, ...projection } = safe;
      void privateNote;
      return projection;
    }),
    privateNotes: staff
      ? evaluations.map((e) => ({
          sessionId: e.sessionId,
          body: e.privateNote,
        }))
      : [],
    audits: viewer.role === "admin" ? world.audits : [],
    homework: world.homework.filter(
      (h) =>
        sessionIds.has(h.sessionId) &&
        (staff || homeworkPublished(world, h.sessionId)),
    ),
    notifications: world.notifications.filter(
      (n) => n.recipientId === viewer.id,
    ),
  };
}
function slotFor(
  world: AcademyWorld,
  learner: Student,
  slotId: string,
  now: Date,
  excluding?: string,
): Slot {
  const slot = world.slots.find((s) => s.id === slotId);
  if (!slot || Date.parse(slot.startsAt) <= now.getTime())
    fail("slot_unavailable");
  const assignment = assigned(world, learner.id);
  const plan = latestPlan(world, learner.id);
  if (
    !assignment ||
    assignment.teacherId !== slot!.teacherId ||
    !plan?.published ||
    !world.assessments.some((a) => a.studentId === learner.id)
  )
    fail("journey_incomplete");
  const pack = PACKAGES.find((p) => p.id === learner.packageId);
  if (
    !pack ||
    slot!.durationMinutes > pack.durationMinutes ||
    slot!.durationMinutes <= 0 ||
    Date.parse(slot!.endsAt) - Date.parse(slot!.startsAt) !==
      slot!.durationMinutes * 60_000
  )
    fail("duration_not_allowed");
  if (
    world.sessions.some(
      (s) =>
        s.id !== excluding &&
        s.status !== "cancelled" &&
        overlaps(s, slot!) &&
        (s.studentId === learner.id || s.teacherId === slot!.teacherId),
    )
  )
    fail("slot_conflict");
  return slot!;
}
function sessionFor(
  world: AcademyWorld,
  actor: AcademyActor,
  id: string,
): Session {
  const session = world.sessions.find((s) => s.id === id);
  if (!session) fail("session_not_found");
  need(world, actor, session!.studentId);
  if (actor.role === "teacher" && session!.teacherId !== actor.userId)
    fail("forbidden");
  return session!;
}
function staffOnly(actor: AcademyActor) {
  if (actor.role !== "teacher" && actor.role !== "admin") fail("forbidden");
}
function familyOrAdmin(actor: AcademyActor) {
  if (!["guardian", "student", "admin"].includes(actor.role)) fail("forbidden");
}
function perform(
  world: AcademyWorld,
  actor: AcademyActor,
  command: AcademyAction,
  now: Date,
): string | undefined {
  const viewer = user(world, actor);
  const time = now.toISOString();
  switch (command.action) {
    case "enter":
    case "logout":
    case "reset":
      return fail("route_action_only");
    case "enroll": {
      if (viewer.role !== "guardian" && viewer.role !== "student")
        fail("forbidden");
      if (
        !PACKAGES.some((p) => p.id === command.packageId) ||
        !["child", "adult"].includes(command.ageBand)
      )
        fail("invalid_field");
      if (viewer.role === "guardian") {
        if (command.ageBand !== "child") fail("forbidden");
        const number =
          Math.max(
            2,
            ...world.students
              .map((s) => Number(s.id.replace("child-", "")))
              .filter(Number.isFinite),
          ) + 1;
        const id = `child-${number}`;
        world.students.push({
          id,
          name: `الطالب التجريبي ${number}`,
          ageBand: "child",
          guardianId: viewer.id,
          packageId: command.packageId,
          enrolledAt: time,
        });
        notify(world, "admin-1", "enrollment", "طلب تعلم اصطناعي جديد", now);
        return id;
      }
      if (command.ageBand !== "adult") fail("forbidden");
      const learner = student(world, viewer.studentId!);
      if (learner.packageId) fail("already_enrolled");
      learner.packageId = command.packageId;
      learner.enrolledAt = time;
      notify(world, "admin-1", "enrollment", "طلب تعلم اصطناعي جديد", now);
      return learner.id;
    }
    case "assess": {
      if (viewer.role !== "admin") fail("forbidden");
      const s = student(world, command.studentId);
      if (!["foundation", "developing", "confident"].includes(command.level))
        fail("invalid_field");
      world.assessments.push({
        id: uid("assessment"),
        studentId: s.id,
        level: command.level,
        notes: text(command.notes),
        createdAt: time,
        createdBy: viewer.id,
      });
      notify(
        world,
        owner(world, s.id),
        "assessment",
        "تم تسجيل تقييم أولي تجريبي",
        now,
      );
      return s.id;
    }
    case "assign": {
      if (viewer.role !== "admin") fail("forbidden");
      const s = student(world, command.studentId);
      if (!world.assessments.some((a) => a.studentId === s.id))
        fail("assessment_required");
      if (
        !world.users.some(
          (u) => u.id === command.teacherId && u.role === "teacher",
        )
      )
        fail("teacher_not_found");
      world.assignments
        .filter((a) => a.studentId === s.id && a.active)
        .forEach((a) => {
          a.active = false;
        });
      world.assignments.push({
        id: uid("assignment"),
        studentId: s.id,
        teacherId: command.teacherId,
        active: true,
        createdAt: time,
        createdBy: viewer.id,
      });
      notify(
        world,
        command.teacherId,
        "assignment",
        "تم إسناد طالب تجريبي",
        now,
      );
      notify(
        world,
        owner(world, s.id),
        "assignment",
        "تم إسناد المعلم التجريبي",
        now,
      );
      return s.id;
    }
    case "revoke": {
      if (viewer.role !== "admin") fail("forbidden");
      student(world, command.studentId);
      const a = assigned(world, command.studentId);
      if (!a) fail("assignment_not_found");
      a!.active = false;
      return command.studentId;
    }
    case "plan": {
      staffOnly(actor);
      need(world, actor, command.studentId);
      if (!assigned(world, command.studentId)) fail("assignment_required");
      if (typeof command.published !== "boolean") fail("invalid_field");
      const plan = {
        id: uid("plan"),
        studentId: command.studentId,
        goal: text(command.goal),
        reference: reference(command.reference),
        published: command.published,
        createdAt: time,
        createdBy: viewer.id,
      };
      world.plans.push(plan);
      if (plan.published)
        notify(
          world,
          owner(world, plan.studentId),
          "plan_published",
          "تم نشر خطة تعليمية تجريبية",
          now,
        );
      return plan.id;
    }
    case "book": {
      familyOrAdmin(actor);
      need(world, actor, command.studentId);
      const learner = student(world, command.studentId);
      const slot = slotFor(world, learner, command.slotId, now);
      if (
        world.sessions.filter(
          (s) => s.studentId === learner.id && s.status !== "cancelled",
        ).length >= 8
      )
        fail("demo_capacity_reached");
      const id = uid("session");
      world.sessions.push({
        id,
        studentId: learner.id,
        teacherId: slot.teacherId,
        slotId: slot.id,
        packageId: learner.packageId!,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: "scheduled",
        createdAt: time,
      });
      notify(world, slot.teacherId, "booking", "حُجزت حصة فردية تجريبية", now);
      notify(
        world,
        owner(world, learner.id),
        "booking",
        "حُجزت حصة فردية تجريبية",
        now,
      );
      return id;
    }
    case "reschedule": {
      familyOrAdmin(actor);
      const s = sessionFor(world, actor, command.sessionId);
      if (s.status !== "scheduled") fail("session_not_scheduled");
      if (
        viewer.role !== "admin" &&
        Date.parse(s.startsAt) - now.getTime() < DAY
      )
        fail("cancel_window");
      const reason = text(command.reason, 500);
      const slot = slotFor(
        world,
        student(world, s.studentId),
        command.slotId,
        now,
        s.id,
      );
      Object.assign(s, {
        slotId: slot.id,
        teacherId: slot.teacherId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      world.audits.push({
        id: uid("audit"),
        actorId: viewer.id,
        action: `reschedule_reason:${reason}`,
        entityId: s.id,
        createdAt: time,
      });
      notify(
        world,
        owner(world, s.studentId),
        "reschedule",
        "تم نقل موعد الحصة التجريبية",
        now,
      );
      notify(
        world,
        s.teacherId,
        "reschedule",
        "تم نقل موعد الحصة التجريبية",
        now,
      );
      return s.id;
    }
    case "cancel": {
      familyOrAdmin(actor);
      const s = sessionFor(world, actor, command.sessionId);
      if (s.status !== "scheduled") fail("session_not_scheduled");
      if (
        viewer.role !== "admin" &&
        Date.parse(s.startsAt) - now.getTime() < DAY
      )
        fail("cancel_window");
      s.cancelReason = text(command.reason, 500);
      s.cancelledAt = time;
      s.status = "cancelled";
      notify(
        world,
        s.teacherId,
        "booking_cancelled",
        "أُلغيت حصة تجريبية",
        now,
      );
      notify(
        world,
        owner(world, s.studentId),
        "booking_cancelled",
        "أُلغيت حصة تجريبية",
        now,
      );
      return s.id;
    }
    case "evaluate": {
      staffOnly(actor);
      const s = sessionFor(world, actor, command.sessionId);
      if (s.status !== "scheduled") fail("session_not_scheduled");
      if (Date.parse(s.endsAt) > now.getTime()) fail("session_not_finished");
      if (world.evaluations.some((e) => e.sessionId === s.id))
        fail("evaluation_exists");
      if (
        !["present", "absent", "technical"].includes(command.attendance) ||
        typeof command.published !== "boolean"
      )
        fail("invalid_field");
      const tajweed = score(command.tajweed);
      if (tajweed !== null && s.packageId !== "complete")
        fail("tajweed_requires_complete");
      const due = timestamp(command.homeworkDue);
      if (Date.parse(due) < now.getTime()) fail("invalid_field");
      const evaluation: Evaluation = {
        id: uid("evaluation"),
        sessionId: s.id,
        attendance: command.attendance,
        memorization: score(command.memorization),
        tajweed,
        makharij: score(command.makharij),
        fluency: score(command.fluency),
        feedback: text(command.feedback),
        privateNote: text(command.privateNote, 1000, true),
        reference: reference(command.reference),
        homeworkTitle: text(command.homeworkTitle, 500),
        homeworkDue: due,
        published: command.published,
        createdAt: time,
        createdBy: viewer.id,
      };
      world.evaluations.push(evaluation);
      world.homework.push({
        id: uid("homework"),
        sessionId: s.id,
        title: evaluation.homeworkTitle,
        due,
      });
      s.status = "completed";
      if (evaluation.published)
        notify(
          world,
          owner(world, s.studentId),
          "evaluation_published",
          "تم نشر تقرير الجلسة والواجب التجريبي",
          now,
        );
      return s.id;
    }
    case "publish": {
      staffOnly(actor);
      const s = sessionFor(world, actor, command.sessionId);
      const e = world.evaluations.find((e) => e.sessionId === s.id);
      if (!e) fail("evaluation_not_found");
      if (!e!.published) {
        e!.published = true;
        notify(
          world,
          owner(world, s.studentId),
          "evaluation_published",
          "تم نشر تقرير الجلسة والواجب التجريبي",
          now,
        );
      }
      return s.id;
    }
    case "submit": {
      if (viewer.role !== "guardian" && viewer.role !== "student")
        fail("forbidden");
      const h = world.homework.find((h) => h.id === command.homeworkId);
      if (!h) fail("homework_not_found");
      const s = sessionFor(world, actor, h!.sessionId);
      if (!homeworkPublished(world, s.id)) fail("homework_not_published");
      if (h!.submittedAt) fail("homework_already_submitted");
      h!.response = text(command.response, 2000);
      h!.submittedAt = time;
      notify(
        world,
        s.teacherId,
        "homework_submitted",
        "تم تسليم واجب تجريبي",
        now,
      );
      return h!.id;
    }
    case "review": {
      staffOnly(actor);
      const h = world.homework.find((h) => h.id === command.homeworkId);
      if (!h) fail("homework_not_found");
      const s = sessionFor(world, actor, h!.sessionId);
      if (!h!.submittedAt) fail("homework_not_submitted");
      if (h!.reviewedAt) fail("homework_already_reviewed");
      h!.reviewFeedback = text(command.feedback);
      h!.reviewedAt = time;
      notify(
        world,
        owner(world, s.studentId),
        "homework_reviewed",
        "تمت مراجعة الواجب التجريبي",
        now,
      );
      return h!.id;
    }
    case "read": {
      const n = world.notifications.find(
        (n) => n.id === command.notificationId && n.recipientId === viewer.id,
      );
      if (!n) fail("notification_not_found");
      n!.readAt ??= time;
      return n!.id;
    }
  }
}
/** Commit only a completely validated mutation; errors leave the original world unchanged. */
export function apply(
  world: AcademyWorld,
  actor: AcademyActor,
  command: AcademyAction,
  now = new Date(),
): void {
  strict(command);
  const draft = structuredClone(world);
  const entityId = perform(draft, actor, command, now);
  draft.audits.push({
    id: uid("audit"),
    actorId: actor.userId,
    action: command.action,
    entityId,
    createdAt: now.toISOString(),
  });
  Object.assign(world, draft);
}
