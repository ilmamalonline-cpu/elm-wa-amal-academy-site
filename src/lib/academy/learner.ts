// Synthetic instructional content only. This module never stores educational records.
export type LearnerWorkspaceData = {
  child: { id: string; display_name: string };
  locale: "ar" | "en";
  contentMode: "synthetic-only";
  lessons: { id: string; title: string; description: string }[];
  progress: null;
  reports: [];
  teacher: null;
  nextLesson: null;
  meetingUrl: null;
  payments: [];
};

export function syntheticLearnerWorkspace(child: LearnerWorkspaceData["child"], locale: "ar" | "en"): LearnerWorkspaceData {
  return {
    child: { id: child.id, display_name: child.display_name }, locale, contentMode: "synthetic-only",
    lessons: locale === "ar" ? [
      { id: "sample-letters", title: "تجربة: الحروف العربية", description: "نشاط تجريبي مع ولي الأمر: اختر حرفًا وانطق صوته، ثم ابحث عن كلمة تبدأ به. هذا مثال، وليس درسًا مخصصًا أو تقييمًا." },
      { id: "sample-reading", title: "تجربة: القراءة معًا", description: "نشاط تجريبي مع ولي الأمر: اختارا كلمة قصيرة واقرآها معًا. لا تُحفظ نتائج هذا النشاط ولا يُعد إكمالًا لدرس." },
    ] : [
      { id: "sample-letters", title: "Sample: Arabic letters", description: "A sample guardian-led activity: choose a letter, say its sound, then find a word beginning with it. This is an example, not an assigned lesson or assessment." },
      { id: "sample-reading", title: "Sample: Reading together", description: "A sample guardian-led activity: choose a short word and read it together. No results are saved and this does not count as lesson completion." },
    ],
    progress: null, reports: [], teacher: null, nextLesson: null, meetingUrl: null, payments: [],
  };
}
