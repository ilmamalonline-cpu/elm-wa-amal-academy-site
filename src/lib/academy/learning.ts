// Guardian-authored records only; never teacher assessments or attendance.
export type LearningPlan = { goal: string; weekly_target_minutes: number; updated_at: string };
export type PracticeEntry = { id: string; activity: string; minutes: number; practiced_on: string; note: string; created_at: string };
export type LearningData = {
  plan: LearningPlan | null;
  entries: PracticeEntry[];
  summary: { entry_count: number; total_minutes: number; scope: "latest-100" };
};
export function emptyLearning(): LearningData {
  return { plan: null, entries: [], summary: { entry_count: 0, total_minutes: 0, scope: "latest-100" } };
}
