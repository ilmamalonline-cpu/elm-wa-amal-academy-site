# تدقيق الكود — المرحلة 0 (خط الأساس) والمرحلة 1 (إصلاحات موثّقة)

التاريخ: 2026-10-19 · النطاق: الأرشيف `elm-wa-amal-academy-project.zip` كما هو (122 ملفًا، بلا `.git` ولا `node_modules`).
القاعدة المتّبعة: لا يُعدّ شيء «مُتحقَّقًا» إلا إذا شُغّل أمر فعلي وفُحصت نتيجته. ما لم يُشغَّل مذكور صراحةً تحت «محجوب» أو «لم يُراجَع».

## 1) بيئة التنفيذ (حدودها)

| البند | الحالة |
|---|---|
| Node / npm | 22.22.2 / 10.9.7 |
| `tsx` / `tsc` | 4.21.0 / 6.0.3 عالميان (المشروع يثبّت tsx 4.23.15 وTypeScript 5.9.3) |
| الشبكة | **معطّلة**: `npm ci` فشل بـ `ENOTFOUND registry.npmjs.org` (سجل npm). لم تُثبَّت أي حزمة |
| PostgreSQL / Chromium للمشروع | غير متوفرين |

نتيجة ذلك: `next`, `react`, `pg`, `jose`, `eslint`, `@playwright/test` غير متاحة، فالبناء وlint وtypecheck الكامل واختبارات DB وPlaywright **لم تُشغَّل**.

## 2) الجرد الفعلي

| المكوّن | الملفات الرئيسية | الحجم |
|---|---|---|
| الموقع العام (AR/EN) | `src/app/[locale]/*`, `src/components/{public-content,site-shell}.tsx`, `src/content/site.ts` | ~1,200 سطر (+763 سطر CSS عام) |
| مساحة الأكاديمية الاصطناعية | `src/components/academy/workspace.tsx` (2,458) و`academy.css` (1,516), `src/lib/academy/{model (877), store (142), browser-preview (72), types (198)}`, `src/app/api/academy-demo/route.ts` (196) | ~5,500 سطر |
| API القراءة المحمي (Phase 2) | `src/lib/phase2/security.ts` (201), `src/app/api/phase2/[...segments]/route.ts`, `db/phase2*.sql` | ~520 سطرًا |
| نموذج الدفع اليدوي المحلي | `src/lib/phase2/manual-payment.ts` (122), `db/manual-payment.sql` (252), `src/app/api/manual-payments/*` | ~400 سطر |
| أدوات وفحوصات | `scripts/` (18 ملفًا، 771 سطرًا), `tests/` (25 ملفًا، 3,356 سطرًا) | |
| طرف ثالث / مولَّد | `public/fonts/ibm-plex-sans-arabic/*` (خط), `docs/previews/*.png` (لقطات), `index.html` (الصفحة الأصلية المحفوظة) | غير مُراجَع كشيفرة |

الاعتماديات: 6 تشغيلية (`next 16.4.2`, `react/react-dom 19.3.1`, `pg`, `jose`, `server-only`) و14 للتطوير. التطابق مع `docs/changed-files.txt`: بصمات `model.ts` و`store.ts` الأصلية طابقت السجل قبل أي تعديل.

## 3) نتائج التشغيل الفعلية

| الأمر | قبل التعديل | بعد التعديل |
|---|---|---|
| `tsx --test tests/academy-model.test.ts tests/academy-browser-preview.test.ts` | 12 من 12 ناجح | 12 من 12 ناجح |
| `tsx --test tests/academy-hardening.test.ts` (جديد) | **0 من 3 ناجح** (فشل كما هو متوقع) | **3 من 3 ناجح** |
| الثلاثة معًا | — | **15 من 15 ناجح** |
| `npm run test:academy` (بعد إدخال الملف الجديد في السكربت) | — | **15 من 15 ناجح** |
| `node --test` لخمسة ملفات hardening غير المرتبطة بقاعدة بيانات | 28 اختبارًا: 26 ناجح، 2 فشل | بلا تغيير |
| `tsx --test tests/phase2-provider-offline.test.ts` | فشل: `Cannot find module 'jose'` | بلا تغيير |
| `tsc --noEmit --strict` على الوحدات النقية (model, store, browser-preview, types + اختباري academy) | 0 أخطاء | 0 أخطاء (مع ملف الاختبار الجديد) |

ملاحظات على الإخفاقات الثلاثة غير المتعلقة بالتعديل: ملف `phase2-provider-fixture-safety` و`phase2-provider-storage-preflight` فشلا بـ `ERR_MODULE_NOT_FOUND: Cannot find package 'pg'`, والملف `phase2-provider-offline` فشل بغياب `jose`. هذه قيود بيئة وليست عيوب كود، ولم تُموَّه بأي بديل وهمي. فحص الأنواع الجزئي **لا** يغطي المشروع كله (الواجهات وملفات الـ routes تحتاج حزم غير متاحة).

## 4) سجل العيوب المؤكَّدة (أُصلحت وتحقّقت)

### F1 — فحص شكل الأوامر يقبل مفاتيح موروثة وقيم غير نصية (P2) · `src/lib/academy/model.ts` دالة `strict()`
- **العيب:** `SHAPES[command.action]` على كائن عادي. القيم `constructor` و`__proto__` و`toString` و`hasOwnProperty` و`valueOf` تُرجع `TypeError: expected is not iterable` بدل `invalid_action_shape`. ومصفوفة مثل `["enroll"]` تُحوَّل إلى النص `enroll` فتمرّ من الفحص، ولا يطابقها أي `case` في `perform()`، ثم **يُثبَّت سجل تدقيق** `action: ["enroll"]` دون تنفيذ أي عملية.
- **الدليل:** سكربت إعادة إنتاج: الطلاب 3 قبل وبعد، والتدقيق 0 ← 1، وآخر سجل `action` من نوع مصفوفة.
- **الأثر:** أي دور يستطيع إضافة سجلات تدقيق تبدو حقيقية للإدارة، والأسماء الموروثة تنتهي (حسب `route.ts`) بخطأ 500 مضلّل `local_storage_unavailable` (استنتاج من قراءة الكود، المسار لم يُشغَّل).
- **الإصلاح:** قبول الخصائص المملوكة فقط وبقيمة نصية (`hasOwnProperty.call` + `typeof === "string"`).
- **التحقق:** اختبار F1 فشل قبل الإصلاح ونجح بعده، ولم يتغيّر العالم بعد أي رفض.

### F2 — لا يمكن استرداد جلسة ملف عالمها تالف (P2) · `src/lib/academy/store.ts`
- **العيب:** `resetWorld` كانت تقرأ الملف القديم أولًا عبر `transaction`، فإذا كان تالفًا (`SyntaxError`) فشلت `readView` و`mutate` و`resetWorld` معًا، فلا مخرج للجلسة. محوّل المتصفح لا يعاني من ذلك (إعادة الضبط عنده لا تقرأ الحالة القديمة).
- **الدليل:** سكربت: الدوال الثلاث ترمي `SyntaxError` على ملف `{ corrupted`.
- **الإصلاح:** `resetWorld` تكتب عالمًا أوليًا جديدًا دون قراءة الملف السابق. القراءة والتعديل على ملف تالف ما زالا يُرفضان (مطابقة لعقد المحوّل المتصفحي).
- **التحقق:** اختبار F2 على أربع حالات تلف (`{ corrupted` و`null` و`[]` و`42`).

### F3 — كل قراءة (GET) تعيد كتابة ملف العالم كاملًا (P3) · `src/lib/academy/store.ts`
- **العيب:** `readView` تمرّ على `transaction` الذي يحفظ دائمًا؛ تغيّر وقت تعديل الملف بين قراءتين متتاليتين.
- **تنبيه تصميمي:** الكتابة عند **أول** قراءة مقصودة فعليًا؛ هي التي تثبّت أوقات خانات العالم الأولي على القرص. لذلك لم تُمنع الكتابة كليًا.
- **الإصلاح:** `transaction(key, fn, persist = "always")` والقراءات تستخدم `"if-new"`: تُحفظ فقط إذا لم يكن للعالم ملف بعد.
- **التحقق:** اختبار F3 (يثبّت mtime قديمًا ثم يقرأ مرتين ويتأكد أنه لم يتغيّر، وأن التعديلات ما زالت تكتب).

### الملفات المتغيّرة في المرحلة 1 (6 ملفات)

| الملف | التغيير |
|---|---|
| `src/lib/academy/model.ts` | `strict()` (F1) |
| `src/lib/academy/store.ts` | `load` و`transaction` و`readView` و`resetWorld` (F2 وF3) |
| `tests/academy-hardening.test.ts` | جديد: اختبارات انحدار لـ F1–F3 |
| `package.json` | سكربت `test:academy` يشمل الملف الجديد (دونه كانت الاختبارات الجديدة خارج الأمر المعتاد) |
| `docs/changed-files.txt` | تحديث البصمات والعدد (123 مدخلًا) |
| `docs/audit/phase-1.md` | هذا السجل |

## 5) ملاحظات رُصدت ولم تُصلَح (تحتاج قرارًا أو بيئة)

| # | الملاحظة | الدرجة | الدليل | سبب عدم الإصلاح |
|---|---|---|---|---|
| O1 | لا سقف لعدد الأطفال/الإشعارات/سجلات التدقيق في عالم واحد | P3 | 1500 تسجيل ← 713 KB JSON، متوسط `apply` ≈ 3.3 ms، `view` ≈ 25 ms | يحتاج قرار سقف للمنتج |
| O2 | `route.ts` يحوّل أي خطأ غير معروف إلى 500 `local_storage_unavailable` دون أي تسجيل | P3 | قراءة `route.ts:129-141` | لا يمكن تشغيل المسار هنا |
| O3 | تاريخ ثابت `"2026-10-18T00:00:00Z"` كبديل لساعة الواجهة إذا غاب ترويس `Date` | P3 | `workspace.tsx` الأسطر 203 و223 و259 | الواجهة غير قابلة للتشغيل هنا؛ المسار شبه غير قابل للوصول فعليًا |
| O4 | `security.ts`: `client.release()` بلا وسيط بعد فشل `ROLLBACK` قد يعيد اتصالًا معطوبًا للـ pool | P3 (فرضية) | قراءة `security.ts:81-84` | لم يُعاد إنتاجها (يحتاج PostgreSQL) |
| O5 | قوائم `students` و`guardian-links` و`assignments` و`audit` محدودة بـ 100 بلا ترقيم | P3 | `security.ts:183-191` | قيد تصميم لواجهة القراءة الاصطناعية |

## 6) تصحيح لنتيجة آلية خاطئة

فحص آلي أوّلي لـ SQL أظهر `enable_rls=0` لمعظم الجداول. **كان خطأً في الفحص نفسه**: التفعيل يتم عبر حلقتي `DO $$ … FOREACH` في `db/phase2.sql:181-185` (13 جدولًا في `public`، ENABLE وFORCE) و`db/manual-payment.sql:63-67` (7 جداول). التغطية ثابتة الاكتمال بالقراءة؛ سلوك السياسات على قاعدة حقيقية لم يُشغَّل.

## 7) فحص نظافة ثابت لـ `src/**/*.ts(x)`

بلا `dangerouslySetInnerHTML` ولا `innerHTML` ولا `eval` ولا `new Function`؛ بلا `@ts-ignore` ولا `@ts-expect-error` ولا `eslint-disable`؛ صفر `: any` و`as any`؛ استخدام واحد لـ `as unknown as` (`route.ts:190`) والمحمول يتحقق منه `strict()`؛ بلا `console.*` ولا TODO؛ بلا مفاتيح React من الفهرس.

## 8) التغطية

| المنطقة | الحالة |
|---|---|
| `model.ts`, `store.ts`, `browser-preview.ts` | مُراجَعة كاملة؛ F1–F3 أُصلحت وتحقّقت |
| `academy-demo/route.ts`, `proxy.ts`, `phase2` و`manual-payments` routes | مُراجَعة (قراءة)، بلا تشغيل |
| `security.ts` | مُراجَعة (قراءة)، بلا عيوب مؤكدة؛ لا تشغيل (يحتاج `pg`/`jose`/PostgreSQL) |
| `db/*.sql` | تغطية RLS فقط (قراءة)؛ أجسام الدوال والسياسات لم تُراجَع سطرًا بسطر |
| `workspace.tsx` | جزئيًا (الأسطر 170–290 وأنماط الحمولة)؛ بقية الملف لم يُراجَع |
| `manual-payment.ts`, `scripts/`, `site.ts`, `public-content.tsx`, `site-shell.tsx`, CSS | لم يُراجَع |
| بناء، lint، typecheck كامل، Playwright، اختبارات DB، `npm audit`، إمكانية الوصول وRTL والعرض المتجاوب | **محجوب بيئيًا** |

## 9) المقترح للمراحل التالية

1. بيئة بشبكة: `npm ci` ثم `typecheck` و`lint` و`build` و`test:preview` و`test:phase2:hardening` كاملة، وإصلاح ما يفشل على دفعات صغيرة.
2. مراجعة `workspace.tsx` بقية الملف (حالات التحميل والخطأ، النماذج، إمكانية الوصول، RTL).
3. مراجعة أجسام SQL وتشغيل اختبارات DB على PostgreSQL 16 محلي.
4. قرار المنتج بخصوص O1 (أسقف النمو).
