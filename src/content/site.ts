export type Locale = "ar" | "en";

export const locales = ["ar", "en"] as const;

export const pageKeys = [
  "about",
  "teachers",
  "enrollment",
  "programs",
  "packages",
  "learning",
  "faq",
  "contact",
  "privacy",
  "terms",
] as const;

export type PageKey = (typeof pageKeys)[number];

export type SiteCopy = {
  brand: string;
  brandSubtitle: string;
  skip: string;
  nav: Record<PageKey, string>;
  home: string;
  language: string;
  preview: string;
  hero: {
    eyebrow: string;
    title: string;
    description: string;
    primary: string;
    secondary: string;
  };
  intro: {
    eyebrow: string;
    title: string;
    description: string;
  };
  publicPages: Record<"about" | "teachers" | "enrollment", {
    eyebrow: string;
    title: string;
    description: string;
    points: string[];
  }>;
  demoLink: string;
  demoLabel: string;
  programs: Array<{ title: string; description: string }>;
  packagesIntro: string;
  perMonth: string;
  currency: string;
  lessons: string;
  minutes: string;
  upTo: string;
  packageCta: string;
  packages: Array<{
    id: string;
    title: string;
    price: number;
    duration: number;
    upTo: boolean;
    features: string[];
  }>;
  packageNote: string;
  learningIntro: string;
  steps: Array<{ title: string; description: string }>;
  learningNotice: string;
  faqIntro: string;
  faqs: Array<{ question: string; answer: string }>;
  contact: {
    title: string;
    description: string;
    status: string;
    notice: string;
    phoneLabel: string;
    whatsappLabel: string;
  };
  privacy: {
    intro: string;
    sections: Array<{ title: string; body: string }>;
  };
  terms: {
    intro: string;
    sections: Array<{ title: string; body: string }>;
  };
  footer: string;
  future: string;
  back: string;
  notFound: { title: string; description: string };
  error: { title: string; description: string; retry: string };
  loading: string;
};

export const site = {
  ar: {
    brand: "أكاديمية علم وعمل",
    brandSubtitle: "لتحفيظ القرآن الكريم وتدريس العلوم الشرعية",
    skip: "تخطّي إلى المحتوى",
    nav: {
      about: "عن الأكاديمية",
      teachers: "المعلمون",
      enrollment: "التسجيل التجريبي",
      programs: "البرامج",
      packages: "الباقات",
      learning: "طريقة التعلم",
      faq: "الأسئلة الشائعة",
      contact: "تواصل معنا",
      privacy: "الخصوصية",
      terms: "الشروط",
    },
    home: "الرئيسية",
    language: "English",
    preview: "تجربة محلية اصطناعية — لا تسجيل حقيقي أو تحصيل",
    hero: {
      eyebrow: "تعلم فردي بخطة واضحة",
      title: "رحلة ثابتة في حفظ القرآن وفهم طريق التعلم",
      description:
        "مسار فردي واضح يبدأ بفهم مستوى الطالب، ثم يربط الخطة بالحصص والتقييم والواجب والمتابعة. تتاح هنا معاينة محلية اصطناعية فقط؛ الخدمات الخارجية غير مفعلة.",
      primary: "استكشف الباقات",
      secondary: "تعرّف على طريقة التعلم",
    },
    intro: {
      eyebrow: "علم وعمل",
      title: "تعليم يربط الحفظ بالمراجعة والمتابعة",
      description:
        "نعمل على تقديم تجربة تعليمية هادئة ومنظمة، مع معلم وخطة وأهداف قابلة للمراجعة، دون وعود تتجاوز الباقة أو ما تم اعتماده.",
    },
    publicPages: {
      about: { eyebrow: "عن الأكاديمية", title: "تعلم هادئ بخطوات مفهومة", description: "علم وعمل مشروع تعليمي عربيّ الأول يوضح المسار قبل أي التزام، ويحافظ على التعلم الفردي والمتابعة الصادقة.", points: ["تعلم فردي لا يعتمد على أرقام أو شهادات تسويقية غير موثقة.", "خطة قابلة للمراجعة تربط الحفظ بالمراجعة والهدف التالي.", "المعاينة المحلية تشرح الإمكانات دون تشغيل تسجيل أو دفع حقيقي."] },
      teachers: { eyebrow: "المعلمون", title: "معلمون مؤهلون، وتعيين بحسب الملاءمة والتوفر", description: "بحسب المعلومات المقدمة من المالك، يحمل المعلمون إجازات، وتتنوع خبراتهم؛ بعضهم يتجاوز 3 سنوات، وبعضهم 4 أو 5 سنوات. لا ننشر أسماء أو تفاصيل اعتماد فردية غير موثقة.", points: ["تُراجع الملاءمة التعليمية قبل الإسناد.", "المواد يفتحها المعلم ويقدمها داخل Zoom عند توفر التشغيل؛ تكامل Zoom غير مفعل هنا.", "لا نعد بمعلم محدد أو نتيجة محددة قبل التقييم والتوفر."] },
      enrollment: { eyebrow: "التسجيل التجريبي", title: "ابدأ من معاينة محلية بلا بيانات شخصية", description: "اختر ولي أمر أو طالبًا بالغًا داخل المعاينة الاصطناعية لفهم المسار. هذا ليس تسجيلًا حقيقيًا ولا يجمع بيانات أو ينشئ حساب طفل مستقلًا.", points: ["ولي الأمر يدير ملف الطفل؛ لا يوجد دخول مستقل للقاصر.", "الطالب البالغ يراجع مساحة فردية تجريبية تخصه.", "لا دفع أو رسائل أو جدولة خارجية؛ الخدمات الخارجية غير مفعلة."] },
    },
    demoLink: "التجربة التفاعلية",
    demoLabel: "فتح المعاينة المحلية",
    programs: [
      {
        title: "تحفيظ القرآن الكريم",
        description:
          "حفظ ومراجعة في مسار فردي يناسب مستوى الطالب وأهدافه التعليمية.",
      },
      {
        title: "نور البيان",
        description:
          "مسار داعم للقراءة والتأسيس، ويظهر ضمن الباقات التي تتضمنه.",
      },
      {
        title: "التجويد",
        description:
          "تدريب على مبادئ التجويد ضمن الخطة والباقة المعتمدة، دون ادعاء تصحيح آلي.",
      },
    ],
    packagesIntro:
      "كل باقة شهرية تشمل ثماني حصص فردية. راجع تفاصيل المحتوى قبل اختيار المسار.",
    perMonth: "شهريًا",
    currency: "ريال سعودي",
    lessons: "حصص",
    minutes: "دقيقة للحصة",
    upTo: "حتى",
    packageCta: "حالة التواصل",
    packages: [
      {
        id: "quran",
        title: "تحفيظ القرآن",
        price: 360,
        duration: 60,
        upTo: false,
        features: ["8 حصص", "تحفيظ القرآن", "الفهم العام لمعاني الآيات"],
      },
      {
        id: "quran-noor",
        title: "تحفيظ + نور البيان",
        price: 500,
        duration: 60,
        upTo: false,
        features: [
          "8 حصص",
          "تحفيظ القرآن",
          "نور البيان",
          "الفهم العام لمعاني الآيات",
        ],
      },
      {
        id: "quran-noor-tajweed",
        title: "تحفيظ + نور البيان + تجويد",
        price: 650,
        duration: 90,
        upTo: true,
        features: ["8 حصص", "تحفيظ القرآن", "نور البيان", "التجويد"],
      },
    ],
    packageNote:
      "مدة باقة 650 تصل إلى 90 دقيقة بحسب الموعد الفعلي، ولا تتضمن وعدًا إضافيًا بمعاني الآيات. الأسعار المعلنة بالريال السعودي وليست تعليمات تحويل أو مبلغًا محليًا تلقائيًا.",
    learningIntro:
      "من التقييم إلى المعلم والخطة والحصة والتقييم والواجب والتقدم: هذا هو سير العمل التعليمي المقترح. المعاينة المحلية اصطناعية فقط، ولا تجمع بيانات حقيقية أو تفعّل خدمات خارجية.",
    steps: [
      {
        title: "فهم البداية",
        description:
          "نبدأ بتقييم أولي وأهداف صغيرة مناسبة لمستوى الطالب والمسار المختار.",
      },
      {
        title: "خطة ومعلم",
        description:
          "تُبنى خطة فردية ويُعيّن معلم وفق التوفر، دون ضمان اسم معلم بعينه.",
      },
      {
        title: "حصص ومتابعة",
        description:
          "تتضمن الحصة حضورًا ونطاقًا تعليميًا وواجبًا أو ملاحظة مناسبة عند الحاجة.",
      },
      {
        title: "خطوة تالية",
        description:
          "يُراجع التقدم المنشور لتحديد الهدف التالي بدل الاعتماد على إنجازات غير موثقة.",
      },
    ],
    learningNotice:
      "هذه الصفحة تشرح التصور العام للمرحلة الأولى فقط. إجراءات تشغيل الطفل والقرارات المتبقية تحتاج اعتمادًا تشغيليًا وقانونيًا قبل أن تصبح شروطًا ملزمة؛ أما القرارات المعتمدة حاليًا فتظل معروضة كمراجعة وليست تنفيذًا.",
    faqIntro:
      "إجابات مختصرة على الأسئلة الأساسية، مع توضيح ما يزال قيد التحقق.",
    faqs: [
      {
        question: "كم عدد الحصص في الباقة؟",
        answer:
          "كل الباقات المعروضة تشمل 8 حصص شهرية فردية. مدة الحصة 60 دقيقة في أول باقتين، وحتى 90 دقيقة في الباقة الثالثة.",
      },
      {
        question: "هل تشمل باقة 650 فهم معاني الآيات؟",
        answer:
          "لا نضيف هذا الوعد إلى باقة 650. تشمل تحفيظ القرآن ونور البيان والتجويد، وتحدد مدة الموعد الفعلية حتى 90 دقيقة.",
      },
      {
        question: "هل الأسعار المعروضة هي مبلغ التحويل؟",
        answer:
          "الأسعار المعلنة بالريال السعودي. لا نعرض مبلغًا محليًا أو محفظة أو تعليمات تحويل قبل التحقق واعتماد الطريقة المناسبة.",
      },
      {
        question: "هل يمكن للطفل الدخول بحساب مستقل؟",
        answer:
          "النموذج المعتمد مبدئيًا هو ملف طفل يديره ولي أمر مرتبط، دون دخول مستقل للقاصر في المرحلة الأولى. إجراءات تشغيل الطفل والتحقق والموافقة التفصيلية ما زالت قيد الاعتماد.",
      },
      {
        question: "هل تضمنون معلمًا محددًا أو نتيجة معينة؟",
        answer:
          "لا يوجد ضمان لمعلم بعينه أو لنتيجة محددة. تُبنى الخطة وتُراجع بناءً على السجل التعليمي الفعلي.",
      },
      {
        question: "هل يوجد تجديد تلقائي؟",
        answer:
          "لا. الملخص المقترح يذكر شهرًا ميلاديًا من تحقق مالي مخول دون تجديد تلقائي، وهو قرار للمراجعة قبل الإطلاق وليس تنفيذًا أو شرطًا نهائيًا.",
      },
    ],
    contact: {
      title: "تواصل معنا",
      description:
        "قناة خارجية غير متاحة للتحقق في هذه المعاينة. راجع الأسئلة الشائعة والباقات أو افتح المعاينة المحلية بدل إرسال بيانات شخصية.",
      status: "قناة خارجية غير متاحة للتحقق",
      notice:
        "قنوات التواصل الخارجية لم تُتحقق بعد، لذلك لا ننشر رقم محفظة أو وجهة دفع أو تعليمات تحويل.",
      phoneLabel: "لا ننشر رقمًا عامًا في هذه المعاينة",
      whatsappLabel: "لا يوجد رابط تواصل موثق",
    },
    privacy: {
      intro:
        "ملخص مسودة للمراجعة، غير نهائي ولا يمثل إعلان امتثال أو جدول احتفاظ معتمدًا.",
      sections: [
        {
          title: "ما نعتزم تقليله",
          body: "نقترح جمع الحد الأدنى اللازم لتقديم الحساب والتعلم والمتابعة، مع عدم طلب صور هوية أو تاريخ ميلاد كامل دون حاجة معتمدة. لا تشمل المرحلة الأولى تسجيلات صوتية أو مرئية للدروس.",
        },
        {
          title: "الوصول والحماية",
          body: "يُفترض أن يكون الوصول بحسب الدور والارتباط الفعلي، مع فصل الملاحظات الداخلية عن النتائج المنشورة وحماية بيانات الأسرة والطفل. التفاصيل التقنية وإجراءات الدعم لا تُعد منفذة بمجرد عرض هذا النص.",
        },
        {
          title: "الحقوق والمراجعة",
          body: "تحتاج طلبات الوصول أو التصحيح أو الحذف وإجراءات دعم ولي الأمر والطفل إلى سياسة تشغيلية ومراجعة قانونية وتحديد نطاق التطبيق. لا نعلن مدد احتفاظ أو التزامات امتثال غير معتمدة.",
        },
        {
          title: "حدود هذه الصفحة",
          body: "الموقع العام بلا أدوات تتبع أو نماذج تسجيل حقيقي. مساحة الأكاديمية المحلية تحفظ المدخلات الاصطناعية وسجلات التعلم على الخادم المؤقت، وتستخدم cookie للجلسة التجريبية. لا تدخل بيانات شخصية؛ الربط المستضاف وسياسة الاحتفاظ والحقوق الفعلية لم تُعتمد.",
        },
      ],
    },
    terms: {
      intro:
        "ملخص مسودة للمراجعة، غير نهائي. لا يصبح شروطًا ملزمة قبل اعتماد المالك والمراجعة القانونية ونشر نسخة معتمدة.",
      sections: [
        {
          title: "الباقات والاستحقاق",
          body: "ملخص قرارات المالك المعتمدة للمراجعة قبل الإطلاق، لا عقد نهائي ولا نظام منفذ: تشمل الباقة 8 حصص بالمحتوى والمدة المبينين. تبدأ الدورة عند تأكيد وصول المال من المسؤول المخول، وتنتهي في اليوم والوقت المحلي نفسيهما من الشهر الميلادي التالي؛ وإن غاب اليوم يُستخدم آخر يوم في الشهر. لحظة النهاية ليست ضمن الدورة. لا تجديد تلقائي ولا ضمان لمعلم بعينه.",
        },
        {
          title: "الإلغاء والحضور",
          body: "الإلغاء قبل الموعد بـ24 ساعة أو أكثر لا يستهلك حصة، وتُعاد الجدولة بحسب التوفر داخل الفترة. الإلغاء بأقل من24 ساعة أو عدم حضور الطالب يستهلك حصة بعد مراجعة الإدارة للواقعة؛ ينتظر المعلم15 دقيقة قبل تسجيل عدم الحضور. وصول الطالب متأخرًا لا يغيّر نهاية الموعد المحجوز. المعلم يثبت الحضور، والمسؤول المخول وحده يعتمد الخصم مرة واحدة؛ الحجز أو نشر التقرير ليس خصمًا.",
        },
        {
          title: "العطل والتعويض",
          body: "غياب المعلم أو إلغاء الأكاديمية أو عطلتها لا يستهلك حصة. العطل التقني الذي يمنع أداءً مفيدًا مع تقديم أقل من75% من المدة المجدولة يجعل الحصة غير مكتملة ولا تخصم، والإدارة تراجع النزاع. تعويض إخفاق الأكاديمية يستهلك الاستحقاق الأصلي عند إكماله مرة واحدة، ويمكن توفيره حتى14 يومًا بعد نهاية الدورة؛ لا حصة تاسعة ولا خصم مكرر. إن تعذر التعويض تُراجع التسوية النسبية. الحصص العادية غير المستخدمة تنتهي بنهاية الدورة دون ترحيل تلقائي.",
        },
        {
          title: "التجميد والاسترداد والنزاع",
          body: "تجميد واحد لكل دورة حتى14 يومًا بموافقة الإدارة، مع طلب قبل بدايته بـ24 ساعة وتمديد مقابل للمدة المعتمدة؛ لا تجميد بأثر رجعي. قيمة الاسترداد المؤهل = المبلغ الفعلي المدفوع بعملته الفعلية × الحصص غير المستهلكة المؤهلة ÷8، بعد التقريب وتسوية الاستردادات السابقة، وبمراجعة بشرية لا رد آلي أو رسوم مخترعة. سياسة النزاع المعتمدة تستهدف إقرار الاستلام خلال يومي عمل وقرارًا أوليًا خلال7 أيام عمل؛ لا يُستقبل نزاع أو طلب مالي في هذه المعاينة.",
        },
        {
          title: "التوقيت والمعلم البديل",
          body: "المنطقة الزمنية المرجعية Africa/Cairo، وليست اختيارًا لمكان تخزين البيانات. تتطلب أوقات تغيير التوقيت الصيفي غير الموجودة أو الملتبسة تصحيحًا أو تأكيدًا صريحًا، لا تغييرًا صامتًا. يجوز للإدارة تعيين بديل مؤهل مع إخطار الأسرة قبل الحصة؛ ويجوز للأسرة رفضه وإعادة الجدولة أو التسوية دون احتساب غياب طالب.",
        },
        {
          title: "التواصل والدفع",
          body: "الأسعار بالريال السعودي. لا نعرض طريقة دفع أو مبلغًا محليًا أو تعليمات تحويل قبل التحقق من الملكية والطريقة والعملة والجهة المخولة بالمراجعة. لا يعني إيصال أو نموذج دفع تفعيلًا تلقائيًا.",
        },
        {
          title: "الأطفال والمحتوى",
          body: "النموذج المعتمد مبدئيًا ولي أمر يدير ملف طفل دون دخول مستقل للقاصر. إجراءات تشغيل الطفل والتحقق والموافقة والسحب والنزاع وإجراءات الحماية تحتاج اعتمادًا وتدريبًا قبل استقبال أطفال حقيقيين. لا ندعي تصحيح التلاوة آليًا.",
        },
        {
          title: "حدود المسودة",
          body: "عرض هذه الشروط لا يعني تنفيذ برمجيات الحسابات أو الدفع أو الجدولة، ولا يثبت جاهزية تشغيلية أو قانونية أو امتثالًا. تبقى القرارات والإجراءات غير المعتمدة معلقة.",
        },
      ],
    },
    footer: "أكاديمية علم وعمل — معاينة عامة للمرحلة الأولى",
    future:
      "معلومات مستقبلية أو قيد التحقق؛ المعاينة التفاعلية المحلية اصطناعية فقط؛ لا دخول مستقل للقاصر، ولا جمع بيانات حقيقية، ولا دفع أو Zoom أو رفع أو بريد موصول.",
    back: "العودة",
    notFound: {
      title: "الصفحة غير موجودة",
      description:
        "تعذر العثور على الصفحة المطلوبة. يمكنك العودة إلى الرئيسية.",
    },
    error: {
      title: "حدث خطأ",
      description: "تعذر تحميل هذا المحتوى الآن. حاول مرة أخرى لاحقًا.",
      retry: "حاول مرة أخرى",
    },
    loading: "جارٍ التحميل…",
  },
  en: {
    brand: "Elm wa Amal Academy",
    brandSubtitle: "Quran memorization and Islamic studies",
    skip: "Skip to content",
    nav: {
      about: "About",
      teachers: "Teachers",
      enrollment: "Enrollment demo",
      programs: "Programs",
      packages: "Packages",
      learning: "How learning works",
      faq: "FAQ",
      contact: "Contact",
      privacy: "Privacy",
      terms: "Terms",
    },
    home: "Home",
    language: "العربية",
    preview: "Local synthetic preview — no real onboarding or payment collection",
    hero: {
      eyebrow: "Focused one-to-one learning",
      title: "A steady path for Quran memorization and learning",
      description:
        "A focused path starts by understanding the learner, then connects a plan, lesson, evaluation, homework, and follow-up. This site includes a local synthetic preview only; external services are inactive.",
      primary: "Explore packages",
      secondary: "See how learning works",
    },
    intro: {
      eyebrow: "Elm wa Amal",
      title: "Learning that connects memorization with review and follow-up",
      description:
        "We aim to provide a calm, organized learning experience with a teacher, a plan, and reviewable goals, without promises beyond an approved package or plan.",
    },
    publicPages: {
      about: { eyebrow: "About the academy", title: "A calm learning path with clear next steps", description: "Elm wa Amal is Arabic-first education that explains the path before any commitment, with individual learning and honest follow-up.", points: ["One-to-one learning without unverified marketing metrics or endorsements.", "A reviewable plan connecting memorization, revision, and the next goal.", "The local preview demonstrates capability without real signup or payment."] },
      teachers: { eyebrow: "Teachers", title: "Qualified teachers, matched by fit and availability", description: "The academy’s teacher pool holds ijazah, with varied experience; some have 3 years, 4–5 years, or more. We do not publish names or individual credential specifics without verification.", points: ["Educational fit is reviewed before assignment.", "Teachers provide materials in Zoom when operating; Zoom integration is not enabled here.", "No named-teacher or outcome guarantee is made before assessment and availability."] },
      enrollment: { eyebrow: "Enrollment demo", title: "Start with a local preview—without personal data", description: "Choose a guardian or adult learner inside the synthetic preview. This is not real enrollment, does not collect data, and never creates an independent child login.", points: ["A guardian manages a child profile; minors do not log in independently.", "An adult learner can review an individual synthetic workspace.", "No payment, messaging, or external scheduling; integrations are inactive."] },
    },
    demoLink: "Interactive demo",
    demoLabel: "Open local preview",
    programs: [
      {
        title: "Quran memorization",
        description:
          "Memorization and review in an individual path suited to the learner’s level and goals.",
      },
      {
        title: "Noor Al-Bayan",
        description:
          "A reading and foundation path, included only in packages that specifically list it.",
      },
      {
        title: "Tajweed",
        description:
          "Tajweed fundamentals within an approved plan and package, with no claim of automated recitation correction.",
      },
    ],
    packagesIntro:
      "Every monthly package includes eight individual lessons. Review the content before choosing a path.",
    perMonth: "per month",
    currency: "SAR",
    lessons: "lessons",
    minutes: "minutes per lesson",
    upTo: "up to",
    packageCta: "Contact availability",
    packages: [
      {
        id: "quran",
        title: "Quran memorization",
        price: 360,
        duration: 60,
        upTo: false,
        features: [
          "8 lessons",
          "Quran memorization",
          "General understanding of verse meanings",
        ],
      },
      {
        id: "quran-noor",
        title: "Memorization + Noor Al-Bayan",
        price: 500,
        duration: 60,
        upTo: false,
        features: [
          "8 lessons",
          "Quran memorization",
          "Noor Al-Bayan",
          "General understanding of verse meanings",
        ],
      },
      {
        id: "quran-noor-tajweed",
        title: "Memorization + Noor Al-Bayan + Tajweed",
        price: 650,
        duration: 90,
        upTo: true,
        features: [
          "8 lessons",
          "Quran memorization",
          "Noor Al-Bayan",
          "Tajweed",
        ],
      },
    ],
    packageNote:
      "The 650 SAR package is scheduled for up to 90 minutes according to the actual appointment and does not promise additional verse-meaning instruction. Listed prices are in SAR, not automatic local transfer amounts or payment instructions.",
    learningIntro:
      "Assessment → teacher → individual plan → lesson → evaluation → homework → progress. The local preview is synthetic only; it does not collect real data or activate external services.",
    steps: [
      {
        title: "Understand the starting point",
        description:
          "Begin with an initial assessment and small goals suited to the learner and chosen path.",
      },
      {
        title: "Plan and teacher",
        description:
          "Build an individual plan and assign a teacher subject to availability, with no named-teacher guarantee.",
      },
      {
        title: "Lessons and follow-up",
        description:
          "A lesson may include attendance, a learning range, and an appropriate assignment or note.",
      },
      {
        title: "Choose the next step",
        description:
          "Use published progress to guide the next goal rather than unverified completion claims.",
      },
    ],
    learningNotice:
      "This page explains the educational approach and its local synthetic demonstration. Child operating procedures and remaining decisions require operational and legal approval before becoming binding terms; currently approved decisions remain review material, not implementation.",
    faqIntro:
      "Short answers to common questions, including what is still awaiting verification.",
    faqs: [
      {
        question: "How many lessons are in a package?",
        answer:
          "Every listed package includes 8 individual monthly lessons. The first two are 60 minutes per lesson; the third is up to 90 minutes.",
      },
      {
        question: "Does the 650 SAR package include verse-meaning instruction?",
        answer:
          "We do not add that promise to the 650 SAR package. It includes Quran memorization, Noor Al-Bayan, and Tajweed, with an appointment scheduled for up to 90 minutes.",
      },
      {
        question: "Are the listed prices transfer amounts?",
        answer:
          "The listed prices are in SAR. We do not publish a local amount, wallet, or transfer instructions before the method is verified and approved.",
      },
      {
        question: "Can a child use an independent account?",
        answer:
          "The initially approved model is a guardian-managed child profile without an independent minor login in Phase 1. Child operating, verification, and consent procedures are still pending.",
      },
      {
        question: "Do you guarantee a specific teacher or result?",
        answer:
          "We do not guarantee a named teacher or a particular result. Plans are created and reviewed from the learner’s actual educational record.",
      },
      {
        question: "Is there automatic renewal?",
        answer:
          "No. The review summary describes one calendar month after authorized financial verification with no automatic renewal; it is not final terms or an implemented flow.",
      },
    ],
    contact: {
      title: "Contact us",
      description:
        "An external contact channel is unavailable for verification in this preview. Review the FAQ and packages, or open the local demo instead of sending personal details.",
      status: "External channel unavailable for verification",
      notice:
        "These details are for contact only. They are not an approved wallet number, a verified payment destination, or transfer instructions.",
      phoneLabel: "No public number is published in this preview",
      whatsappLabel: "No verified contact link is available",
    },
    privacy: {
      intro:
        "A review draft only. It is not final and does not announce a retention schedule or compliance position.",
      sections: [
        {
          title: "What we intend to minimize",
          body: "We propose collecting only what is needed for accounts, learning, and follow-up, without requesting identity images or a full date of birth without an approved need. Phase 1 does not include lesson audio or video recordings.",
        },
        {
          title: "Access and protection",
          body: "Access is intended to follow actual roles and relationships, with internal notes separated from published results and family and child data protected. Technical details and support procedures are not implemented merely by displaying this text.",
        },
        {
          title: "Rights and review",
          body: "Requests for access, correction, or deletion, along with guardian and child support procedures, require an operating policy, legal review, and a defined scope. We do not state invented retention periods or unapproved compliance obligations.",
        },
        {
          title: "Limits of this page",
          body: "The public site has no trackers or real signup forms. The local academy workspace stores synthetic inputs and learning records on the temporary server and uses a demo-session cookie. Do not enter personal data. Hosted integration, retention and real data-rights procedures remain unapproved.",
        },
      ],
    },
    terms: {
      intro:
        "A review draft only. It is not final terms; it becomes binding only after owner approval, legal review, and publication of an approved version.",
      sections: [
        {
          title: "Packages and entitlement",
          body: "Approved owner decisions summarized for pre-launch review, not a final contract or implemented system: each package includes 8 lessons with its listed content and duration. The cycle begins when an authorized reviewer confirms receipt of funds. It ends on the same local day and time in the next calendar month, using that month’s last day if needed. The ending instant is excluded. There is no automatic renewal or named-teacher guarantee.",
        },
        {
          title: "Cancellation and attendance",
          body: "Cancellation at least 24 hours before the lesson does not consume a lesson; rescheduling within the period is subject to availability. Student cancellation under 24 hours or a no-show consumes one lesson after administrative review; the teacher waits 15 minutes before recording a no-show. Late student arrival does not extend the booked end time. Teachers record attendance; only an authorized administrator finalizes one deduction. Booking or publishing a report does not deduct a lesson.",
        },
        {
          title: "Disruption and make-ups",
          body: "Teacher absence, academy cancellation, or an academy holiday does not consume a lesson. A technical failure preventing useful delivery, with less than 75% of the scheduled duration delivered, makes the lesson incomplete with no deduction, subject to administrative dispute review. An academy-caused make-up uses the original entitlement once when completed and may take place up to 14 days after the cycle ends; it is not a ninth lesson or an extra deduction. If a make-up cannot be provided, a proportional settlement is reviewed. Ordinary unused lessons expire without automatic rollover.",
        },
        {
          title: "Pause, refund, and disputes",
          body: "One pause of up to 14 days per cycle requires administrative approval and a request at least 24 hours before it starts, with an extension matching the approved pause; pauses are not retrospective. Eligible refund = actual amount paid in the actual currency × eligible unused lessons ÷ 8, with rounding and prior-refund adjustments, subject to human review rather than automatic refunds or invented fees. The approved dispute policy targets acknowledgment within 2 business days and an initial decision within 7 business days; this preview does not accept disputes or financial requests.",
        },
        {
          title: "Timezone and replacement teachers",
          body: "Africa/Cairo is the reference timezone, not a data-hosting location. Nonexistent or ambiguous daylight-saving times require correction or explicit confirmation rather than silent adjustment. Administration may appoint a qualified substitute with notice before the lesson; the family may decline and reschedule or settle without a student no-show charge.",
        },
        {
          title: "Contact and payment",
          body: "Prices are in SAR. We do not publish a payment method, local amount, or transfer instructions before ownership, method, currency, and authorized review are verified. A receipt or payment form would not activate a subscription automatically.",
        },
        {
          title: "Children and content",
          body: "The initially approved model is a guardian-managed child profile without an independent minor login. Child operating, verification, consent, withdrawal, dispute, and safeguarding procedures require approval and staff training before real children are onboarded. We do not claim automated recitation correction.",
        },
        {
          title: "Limits of this draft",
          body: "Displaying these terms does not mean account, payment, or scheduling software is running, nor does it establish operational or legal readiness or compliance. Unapproved decisions and procedures remain pending.",
        },
      ],
    },
    footer: "Elm wa Amal Academy — local synthetic preview",
    future:
      "Future or pending information; The local interactive preview is synthetic only: no independent minor login, real data collection, payment, Zoom, upload, or email service is connected.",
    back: "Back",
    notFound: {
      title: "Page not found",
      description:
        "The requested page could not be found. You can return to the home page.",
    },
    error: {
      title: "Something went wrong",
      description:
        "This content could not be loaded right now. Please try again later.",
      retry: "Try again",
    },
    loading: "Loading…",
  },
} satisfies Record<Locale, SiteCopy>;
