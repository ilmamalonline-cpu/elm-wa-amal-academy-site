export type TeacherDemoLocale = "ar" | "en";
export type Attendance = "scheduled" | "attended" | "missed";
export type Completion = "not-started" | "in-progress" | "completed";

export type TeacherDemoTeacher = {
  id: string;
  number: number;
  label: string;
  accent: string;
};

export type TeacherDemoSession = {
  id: string;
  teacherId: string;
  studentLabel: string;
  date: string;
  time: string;
  duration: number;
  attendance: Attendance;
  completion: Completion;
  outcome: string;
  followup: string;
};

export type TeacherDemoSeed = {
  teachers: TeacherDemoTeacher[];
  sessions: TeacherDemoSession[];
};

export type TeacherDemoSessionPatch = Partial<Pick<TeacherDemoSession, "attendance" | "completion" | "outcome" | "followup">>;

export const TEACHER_DEMO_SEED: TeacherDemoSeed = {
  teachers: [
    { id: "teacher-01", number: 1, label: "Teacher 01", accent: "Olive" },
    { id: "teacher-02", number: 2, label: "Teacher 02", accent: "Sage" },
  ],
  sessions: [
    { id: "session-101", teacherId: "teacher-01", studentLabel: "Student 01", date: "2026-04-07", time: "16:00", duration: 45, attendance: "scheduled", completion: "not-started", outcome: "", followup: "" },
    { id: "session-102", teacherId: "teacher-01", studentLabel: "Student 02", date: "2026-04-08", time: "17:30", duration: 45, attendance: "attended", completion: "in-progress", outcome: "Reviewed the learner's submitted work.", followup: "Bring one question to the next session." },
    { id: "session-201", teacherId: "teacher-02", studentLabel: "Student 03", date: "2026-04-07", time: "18:00", duration: 30, attendance: "scheduled", completion: "not-started", outcome: "", followup: "" },
    { id: "session-202", teacherId: "teacher-02", studentLabel: "Student 04", date: "2026-04-09", time: "15:00", duration: 45, attendance: "missed", completion: "not-started", outcome: "", followup: "Reschedule requested in this fictional preview." },
  ],
};

export function cloneTeacherDemoSeed(seed: TeacherDemoSeed = TEACHER_DEMO_SEED): TeacherDemoSeed {
  return { teachers: seed.teachers.map((teacher) => ({ ...teacher })), sessions: seed.sessions.map((session) => ({ ...session })) };
}

export function updateTeacherDemoSession(seed: TeacherDemoSeed, sessionId: string, patch: TeacherDemoSessionPatch): TeacherDemoSeed {
  return {
    teachers: seed.teachers.map((teacher) => ({ ...teacher })),
    sessions: seed.sessions.map((session) => session.id === sessionId ? { ...session, ...patch } : { ...session }),
  };
}

export function sessionsForTeacher(seed: TeacherDemoSeed, teacherId: string): TeacherDemoSession[] {
  return seed.sessions.filter((session) => session.teacherId === teacherId).map((session) => ({ ...session }));
}
