export type Role = "admin" | "teacher" | "guardian" | "student";
export type PackageId = "quran" | "noor" | "complete";
export type AgeBand = "child" | "adult";
export type Level = "foundation" | "developing" | "confident";
export type Attendance = "present" | "absent" | "technical";
export type EntityId = string;

export interface AcademyPackage {
  id: PackageId;
  title: string;
  price: number;
  currency: "SAR";
  durationMinutes: 60 | 90;
  lessons: 8;
}
export interface DemoUser {
  id: EntityId;
  role: Role;
  name: string;
  studentId?: EntityId;
}
export interface Student {
  id: EntityId;
  name: string;
  ageBand: AgeBand;
  guardianId?: EntityId;
  packageId?: PackageId;
  enrolledAt?: string;
}
export interface Assessment {
  id: EntityId;
  studentId: EntityId;
  level: Level;
  notes: string;
  createdAt: string;
  createdBy: EntityId;
}
export interface Assignment {
  id: EntityId;
  studentId: EntityId;
  teacherId: EntityId;
  active: boolean;
  createdAt: string;
  createdBy: EntityId;
}
export interface PlanReference {
  surah: number;
  from: number;
  to: number;
}
export interface Plan {
  id: EntityId;
  studentId: EntityId;
  goal: string;
  reference: PlanReference;
  published: boolean;
  createdAt: string;
  createdBy: EntityId;
}
export interface Slot {
  id: EntityId;
  teacherId: EntityId;
  startsAt: string;
  endsAt: string;
  durationMinutes: 60 | 90;
}
export type SessionStatus = "scheduled" | "cancelled" | "completed";
export interface Session {
  id: EntityId;
  studentId: EntityId;
  teacherId: EntityId;
  slotId: string;
  packageId: PackageId;
  startsAt: string;
  endsAt: string;
  status: SessionStatus;
  createdAt: string;
  cancelledAt?: string;
  cancelReason?: string;
}
export interface Evaluation {
  id: EntityId;
  sessionId: EntityId;
  attendance: Attendance;
  memorization: number | null;
  tajweed: number | null;
  makharij: number | null;
  fluency: number | null;
  feedback: string;
  privateNote: string;
  reference: PlanReference;
  homeworkTitle: string;
  homeworkDue: string;
  published: boolean;
  createdAt: string;
  createdBy: string;
}
export interface Homework {
  id: EntityId;
  sessionId: EntityId;
  title: string;
  due: string;
  response?: string;
  submittedAt?: string;
  reviewFeedback?: string;
  reviewedAt?: string;
}
export interface Notification {
  id: EntityId;
  recipientId: string;
  kind: string;
  message: string;
  readAt?: string;
  createdAt: string;
}
export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  entityId?: string;
  createdAt: string;
}
export interface AcademyWorld {
  users: DemoUser[];
  students: Student[];
  assessments: Assessment[];
  assignments: Assignment[];
  plans: Plan[];
  slots: Slot[];
  sessions: Session[];
  evaluations: Evaluation[];
  homework: Homework[];
  notifications: Notification[];
  audits: AuditEntry[];
}
export interface AcademyActor {
  role: Role;
  userId: string;
  studentId?: string;
}
export interface AcademyView {
  mode: "synthetic-only";
  role: Role | null;
  viewer: DemoUser | null;
  packages: AcademyPackage[];
  teachers: Pick<DemoUser, "id" | "name">[];
  students: Student[];
  assessments: Assessment[];
  assignments: Assignment[];
  plans: Plan[];
  slots: Slot[];
  sessions: Session[];
  evaluations: Omit<Evaluation, "privateNote">[];
  privateNotes: { sessionId: string; body: string }[];
  audits: AuditEntry[];
  homework: Homework[];
  notifications: Notification[];
}
export type AcademyAction =
  | { action: "enter"; role: Role }
  | { action: "logout" | "reset" }
  | { action: "enroll"; packageId: PackageId; ageBand: AgeBand }
  | { action: "assess"; studentId: string; level: Level; notes: string }
  | { action: "assign"; studentId: string; teacherId: string }
  | { action: "revoke"; studentId: string }
  | {
      action: "plan";
      studentId: string;
      goal: string;
      reference: PlanReference;
      published: boolean;
    }
  | { action: "book"; studentId: string; slotId: string }
  | { action: "reschedule"; sessionId: string; slotId: string; reason: string }
  | { action: "cancel"; sessionId: string; reason: string }
  | {
      action: "evaluate";
      sessionId: string;
      attendance: Attendance;
      memorization: number | null;
      tajweed: number | null;
      makharij: number | null;
      fluency: number | null;
      feedback: string;
      privateNote: string;
      reference: PlanReference;
      homeworkTitle: string;
      homeworkDue: string;
      published: boolean;
    }
  | { action: "publish"; sessionId: string }
  | { action: "submit"; homeworkId: string; response: string }
  | { action: "review"; homeworkId: string; feedback: string }
  | { action: "read"; notificationId: string };
export interface AcademyResult {
  view: AcademyView;
  message?: string;
}
