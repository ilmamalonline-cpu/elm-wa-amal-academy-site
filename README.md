# أكاديمية علم وعمل — التطبيق التفاعلي ومعاينة المراجعة

## جاهز للمراجعة: معاينة Vercel اصطناعية، لا نشر منفّذ

أُضيف مسار معاينة داخل **نفس المشروع ونفس الواجهات والنموذج التعليمي**، وليس نسخة منفصلة. في بيئة `VERCEL_ENV=preview` تعمل `/ar/workspace` و`/en/workspace` بالكامل بمحوّل داخل المتصفح، دون API أو قاعدة بيانات أو أسرار. الموقع العام كامل ضمن نفس الدفعة. لا تحتاج المعاينة إلى Supabase أو Zoom.

تُحفظ السجلات الاصطناعية والشخصية في `sessionStorage` لهذا الأصل/التبويب، وتبقى عند إعادة التحميل وتبديل اللغة، ولا تتزامن مع مستخدم أو جهاز آخر. يُزال العالم بزر إعادة الضبط؛ إغلاق التبويب ينهي جلسة التخزين عادةً، لكن استعادة جلسة المتصفح قد تستعيدها. النسخ المكررة من التبويب قد تبدأ بلقطة من الحالة ثم تستقل. لا بيانات شخصية أو ملفات حقيقية: كل محتوى المتصفح قابل لفحص صاحبه وتعديله، **وهذه ليست مصادقة أو RLS أو حماية لسجلات حقيقية**. ملاحظات المعلم لا تظهر في واجهة الأسرة فقط؛ جميع السجلات اصطناعية وليست أسرارًا.

**الإنتاج ليس هو المعاينة:** على `VERCEL_ENV=production` تظل مساحة التشغيل معطلة حتى لو وُضع متغير الاختبار المحلي. واجهات `/api/academy-demo` و`/api/phase2/*` و`/api/manual-payments/*` لا تُفعّل على Vercel حتى مع أعلام الاختبار. لم تُخفف حماية loopback أو CSRF أو الصلاحيات في المحوّل المحلي. الدفع وZoom والرفع والبريد والدخول الحقيقي معطلة. جميع الأسعار SAR، والحصص فردية، والطفل ملف تحت ولي الأمر بلا دخول مستقل.

### الدفعة المقترحة قبل أي Git push

- المستودع الموجود: `ilmamalonline-cpu/elm-wa-amal-academy-site`، مشروع واحد؛ لم يتغير remote أو `main`.
- الاقتراح للموافقة فقط: فرع جديد `preview/academy-synthetic` من الحالة الحالية، **وليس push إلى main**. لم يُنشأ الفرع ولم يحدث commit أو push أو نشر أو إعداد حساب.
- النتيجة المقصودة عند موافقة المالك وربط Vercel Git بالشكل المناسب: Preview Deployment للفرع، لا Production Deployment. ربط المستودع وإعداد Vercel لم يُفحصا أو يُغيّرا هنا؛ يجب التحقق منهما عند تنفيذ النشر المأذون. إذا عومل الفرع كإنتاج فلن تُفتح التجربة تلقائيًا.
- جذر المشروع المرشح هو جذر هذا المستودع، إطار Next.js، أمر البناء `npm run build`، والاعتماديات من `package-lock.json`. لا `vercel.json` خاص ولا تغيير مطلوب في أمر التشغيل المحلي؛ بيئة Next المستضافة تدير التشغيل، ولا تعتمد على ملف `/tmp` أو `npm run start:academy`.
- القائمة الدقيقة للملفات الجديدة/المعدلة المرشحة للـcommit موجودة في `docs/changed-files.txt` مع أحجام وبصمات SHA-256؛ `index.html` الأصلي باقٍ دون تعديل. ملفات العمل المحلية والتبعيات و`.env` والأسرار والسجلات ونتائج التشغيل التاريخية تحت `docs/checks/` و`docs/test-results.json` مستبعدة، لا محذوفة. صور المراجعة الموجودة بيانات اصطناعية فقط.
- أُزيل رقم المحفظة من الوثيقة والاختبارات؛ لا وجهة تحصيل في الدفعة. الأمثلة المتبقية عناوين/متغيرات لخدمات loopback أو fixtures اصطناعية لا بيانات اعتماد مستضافة.

### فحص محلي مطابق للمعاينة

```bash
npm ci
npm run test:academy
npm run typecheck
npm run lint
npm run build
npm run test:preview
npm run test:phase2:hardening
# لتجربة واجهة المتصفح يدويًا محليًا دون خادم بيانات:
ACADEMY_PREVIEW=browser-synthetic-only npm run start -- --port 3010
```

`test:preview` يبدأ ويغلق خادمي Next محليين بنفسه على3410 و3411 لمحاكاة Preview وProduction. يتحقق من رحلتي التسجيل/الخطة/الحجز والتقرير/الواجب، وعدم استدعاء API من التجربة، وعزل الزوار، والحفظ وإعادة الضبط والتعافي من تخزين تالف، والعربي/الإنجليزي وإمكانية الوصول والعروض الصغيرة، وبوابات الخدمات المغلقة حتى مع أعلام اختبار زائدة. النتائج الحالية: **12 اختبار نموذج/تخزين ناجحًا، 92 اختبار متصفح ناجحًا (12 للمعاينة و80 للموقع العام)، 40 اختبار تحصين سابقًا ناجحًا**، إضافة إلى build وtypecheck وlint. نتائج102 والـDB الواردة في السجل السابق تاريخية، وليست اختبارات مستضافة جديدة.

يلزم قبل أي إجراء خارجي اعتماد **هذه الدفعة + فرع المعاينة المعزول + كونها تجربة اصطناعية لا إطلاقًا تشغيليًا**. لا يلزم أي سر لإتمام هذا النوع من المعاينة. ربط حسابات حقيقية أو حفظ سحابي أو تشغيل خدمات يتطلب نطاقًا وقرارات مستقلة.

---

## التحديث المعتمد: حلقة تعليمية اصطناعية

الموافقة الجديدة على MASTER PRODUCT & DESIGN PROMPT توسّع النطاق السابق إلى تطبيق تعليمي محلي فعلي. بقي Next.js/React/TypeScript والموقع العربي/الإنجليزي والبنية الأمنية والمالية السابقة محفوظة. الأقسام التاريخية أدناه تصف مراحلها، ولا تعني استمرار حظر التوسعة المحلية التي اعتمدها المالك الآن.

```bash
npm run dev:academy -- --port 3000
# http://127.0.0.1:3000/ar/workspace
# http://127.0.0.1:3000/en/workspace
# أو بعد البناء: npm run start:academy -- --port 3000
```

`npm run dev` و`npm run start` يبقيان API الأكاديمية معطّلًا افتراضيًا. `dev:academy`/`start:academy` يفعّلان `ACADEMY_DEMO=synthetic-only` على loopback فقط. لا مفاتيح أو كلمة مرور إدارية أو حسابات حقيقية. اختيار الشخصية التجريبية ليس مصادقة، وكل شخصيات المراجعة متاحة عمدًا للمختبر المحلي نفسه. لا تستخدم بيانات شخصية فعلية. لا يُنشر هذا الوضع أو تُمرّر منافذه للعامة.

مساحة واحدة بأدوار ولي الأمر والطالب البالغ والمعلم والإدارة، مع التقييم والإسناد والخطة والحجز والنقل والإلغاء وتوثيق الجلسة والتقييم التجريبي والواجب النصي والنشر والتقدم والإشعارات والسجل المحلي. القاصر ملف يديره الولي دون دخول مستقل. الحالات والملخصات مشتقة من سجلات الخادم لا من أرقام تسويقية.

تُحفظ عوالم الاختبار الاصطناعية منفصلة لكل جلسة متصفح على نظام ملفات مؤقت خارج المستودع. هذا محوّل اختبار أحادي العملية، وليس PostgreSQL/RLS أو مصادقة إنتاجية. الحسابات والتكاملات الأصلية لا تُفعّل منه. يمكن إعادة ضبط العالم من «الخدمات والاشتراك». مسح cookie يفقد مرجع العالم ولا يمحو ملفه تلقائيًا؛ تنظيف الملفات المؤقتة وإجراءات الاحتفاظ الحقيقية بوابة تشغيل منفصلة.

الصفحات العامة الآن تشمل التعريف والمعلمين والتسجيل التجريبي، مع الخط العربي المستضاف محليًا والهوية الأخضر/الأبيض/الذهبي. أسعار 360/500/650 SAR ومحتواها والمدد محفوظة. لا رقم محفظة عام، ولا تحويل SAR/EGP، ولا تحصيل أو خصم حصص مالي أو نص قرآن أو استيراد منهج. Zoom والدفع والرفع والبريد والربط المستضاف معطلة. لا تغيير schema مستضاف، ولا commit/push أو نشر.

```bash
npm run test:academy
npm run typecheck
npm run lint
npm run build
# مع تشغيل start:academy على3000:
npx playwright test tests/academy-workspace.spec.ts --reporter=list
# للفحص الشامل: شغّل npm run start -- --port 3003 في جلسة أخرى دون ACADEMY_DEMO
# ACADEMY_DISABLED_TEST=synthetic-only npm run test:e2e -- --reporter=list
```

خطة التدقيق: [academy-implementation-plan.md](docs/academy-implementation-plan.md). نتائج التحقق وحدود التكاملات في [تقرير التطبيق المحلي](docs/academy-local-implementation-report.md).

---

## السجل التاريخي: Phase 1 وPhase 2 والدفع المحلي

# Elm Wa Amal — historical Phase 1 + Phase 2 review

A bilingual Arabic/English public site plus a **local, synthetic identity/isolation foundation**. This is not an operational academy platform and is not production-ready. The latest owner instruction authorizes only the local synthetic manual-payment workflow described below; other Phase 3 work and all real operation remain closed.

## What is implemented

The Phase 1 Next.js App Router/React/strict TypeScript/Tailwind site remains available at `/ar` and `/en`: home, programs, packages, learning, FAQ, contact, privacy and terms. RTL/LTR, mobile-first layouts, exact three-package content and existing unavailable-contact state remain unchanged. No real signup/login/recovery form is enabled, and `/ar/login`, `/en/login` and registration pages remain 404. The original `index.html` is preserved.

Phase 2 adds actual PostgreSQL row-level security tests and a default-disabled read-only API at `/api/phase2/*`. It covers four protected roles, live capabilities, guardian-managed minor profiles **without child login**, adult self access, verified synthetic consent/link scoping, active teacher assignments, session/role/link revocation, dispute freeze, safe field projections, audited privileged SQL commands, one-shot closed synthetic admin bootstrap and authenticated private-file delivery.

**Two distinct local test modes:** the original `phase2_test` harness uses fixture auth tables, an ephemeral test issuer and filesystem fixtures. The canonical native-provider path tests actual GoTrue, PostgREST and Supabase Storage in `phase2_provider_test`, including native TOTP and a local recovery-email sink. See [native provider results](docs/phase-2-provider-report.md). This is a loopback-only component integration, not a full Supabase CLI/gateway stack or production acceptance. The incompatible, inactive alternate implementation has been retired by owner decision; see [the retirement inventory](docs/phase-2-provider-collisions.md).

The original payment records, reports and teacher notes remain minimal synthetic isolation fixtures. A separate, default-disabled `/api/manual-payments/*` prototype now implements explicit versioned quotes, requester acceptance, synthetic text references, protected reasoned review and atomic idempotent activation of a local eight-lesson calendar-month period. It does not enable real collection, curriculum, quota consumption, scheduling, publishing UI, recording, external messaging, contact activation or real onboarding. See [the local payment implementation and launch gates](docs/manual-payment-local.md).

## Run the public site locally

Use compatible Node.js/npm; this environment used Node 24.19.0. No environment variables or service accounts are required for the public site.

```bash
npm ci
NEXT_TELEMETRY_DISABLED=1 npm run dev -- --port 3000
# Or build/start a local production-mode application:
NEXT_TELEMETRY_DISABLED=1 npm run build
NEXT_TELEMETRY_DISABLED=1 npm run start -- --port 3000
```

Servers bind `127.0.0.1` by default. No public preview or deployment is created. Identity endpoints return **503 `local_security_disabled`** by default. `.env.example` is documentation only; no real `.env` or credentials are supplied.

## Reproduce the Phase 2 tests

Use an **isolated, disposable, loopback-only PostgreSQL 16 database named `phase2_test`**, with a trusted local test operator. The test schema reset destroys only that database's synthetic schemas and refuses remote hosts, other database names and URL query overrides. Never use personal/child data or a production database. The scripts never provision or connect to a hosted project.

```bash
export PHASE2_TEST_DATABASE_URL=postgresql://ubuntu@127.0.0.1:55432/phase2_test
PHASE2_ALLOW_RESET=synthetic-only npm run phase2:reset
NEXT_TELEMETRY_DISABLED=1 npm run build
npm run test:phase2
npm run typecheck
npm run lint
npm audit --json
```

The reset command requires a trusted local PostgreSQL operator who can create the disposable roles/schema. `phase2_api` is a synthetic local LOGIN role without superuser/BYPASSRLS/table ownership, and can assume only `phase2_authenticated`. The non-login `phase2_definer` is a deliberately trusted, narrow privileged SQL boundary; it is never granted to the app role. The non-login bootstrap operator cannot be assumed by the app. These test roles are **not real academy accounts** or production provisioning.

The API suite launches an actual Next.js server on loopback port3402, generates an ephemeral signing key, passes only its public key to the application, supplies synthetic JWTs and creates temporary private PDF fixtures outside the project. It removes the fixtures and stops its server afterward. Tests are destructive to synthetic fixtures and must run sequentially, not against another reviewer's database session. No persistent signing key, service key or real account is created.

This execution used a standalone extracted PostgreSQL16.15 runtime at `/workspace/phase2-tools/root/usr/lib/postgresql/16/bin`, with data outside the project at `/workspace/phase2-runtime/pgdata`. It was not installed as a system service. See the Phase 2 report for final process state; do not assume the test database is still running.

## API and storage limits

GET resources: `me`, `students`, `students/:id`, `reports/:id`, `notes/:id`, `payments/:id`, `files/:id`, `guardian-links`, `assignments`, `audit`. HEAD preserves authorization; OPTIONS grants no cross-origin access. All write methods are refused. There is no HTTP bootstrap, role-grant, guardian-verification, assignment or upload operation. Privileged SQL contracts are tested only through the trusted local harness.

JWTs must have the fixed local test issuer, `authenticated` audience, ES256 signature, subject/session IDs, AAL claim and <=15-minute lifetime. Mutable token metadata never grants roles. Every database transaction sets the verified subject, session and AAL and checks the live session/profile. RLS also checks the live role/link/assignment/consent state. Client database credentials and caller-set claims are never a browser interface.

Private downloads require clean+validated metadata and an immutable requester/payment association, then re-check authorization, size, hash, magic bytes and safe object path. Reads are bounded, refuse symlinks and serve attachments with `no-store` and a sandbox policy. There is **no malware scanner or real upload path**: clean state is synthetic fixture data, not a scan result. No public or durable signed file URL is issued. Loss of educational guardianship does not automatically erase a requester's separate financial ownership; suspension or session/role revocation still gates access.

## Verification and evidence

```bash
# With the default-disabled public server running on port3000:
PHASE2_REGRESSION=1 npm run test:e2e -- --grep-invert 'capture visual review evidence'
```

This excludes eight screenshot-only captures so the historical Phase 1 preview files are not overwritten. It still runs public-page, package, RTL/LTR, responsive, keyboard, axe, no-JavaScript, unavailable-contact and real404 checks on desktop/mobile Chromium. Browser tests are restricted to `*.spec.ts`, separate from Node security tests. A passing axe run is not a WCAG certification.

See [Phase 2 scope](docs/phase-2-scope.md), [Phase 2 results](docs/phase-2-report.md), and evidence under `docs/checks/phase2/`. Historical Phase 1 results remain in `docs/phase-1-report.md`; its statements describe that phase, not the new additions.

## Owner decisions and stop gate

D01–D04 and D09 are approved. D07 approves only the guardian-managed/no-minor-login identity model; detailed consent, verification, safeguarding, revocation/dispute and recovery operations still require approval. D05 (channels/wallet/EGP), D06 (real owner/reviewer and MFA/bootstrap operations), D08 (legal/privacy/region/retention/rights), D10 (Quran/curriculum/rubric), and D11 (services, operations, pilot and launch) remain pending.

No real users or children, live migration, external service change, production account, real money, commit, push or deployment is authorized. The new manual-payment authorization is a narrow local synthetic exception, not general Phase 3 or launch approval. The owner has supplied an intended Egyptian wallet destination and identified themselves as the intended admin/financial reviewer; neither is operational identity/ownership verification. Teaching materials opened independently by the teacher in Zoom are outside this payment task; no content import, rights claim, recording or Zoom integration is introduced. Retention, deletion/export, safeguarding and recovery procedures are not silently implemented as final policy. Earlier phase reports below remain historical.

## Canonical native-provider integration

The subsequent authorization permits **local-only Supabase Auth/Storage integration with synthetic data**, not hosted provisioning, real credentials/data, Phase 3 or launch. This supplements the earlier authorization wording; it does not close any owner/launch gate.

The app imports `src/lib/phase2/security.ts`. The canonical integration is `db/phase2-provider.sql`, `db/phase2-provider-storage.sql`, `scripts/provider-init.mjs`, `scripts/provider/` and `tests/phase2-provider-{auth,data}.test.mjs` with `tests/provider-helpers.mjs`. Its disposable database is `phase2_provider_test`; the original `phase2_test` harness remains separate.

Follow [native component prerequisites and launchers](scripts/provider/README-native.md) before running `PHASE2_PROVIDER_TEST=synthetic-only npm run test:phase2:native`. `phase2:native:init` now defaults to offline planning, as does `phase2:native:plan`. Explicit `phase2:native:apply` is the guarded fresh-database action, **not** a reset and must not be run on the prepared application database. No credentials should be added to source or `.env.example`.

The owner chose retirement, not reconciliation or a separate experiment. The nine inactive implementation/test files, four alternate npm commands and obsolete environment examples have been removed. Historical checks remain evidence only, not runnable setup instructions or acceptance of the retired stack. `npm run test:phase2:retirement` checks this boundary offline without starting providers or touching a database. Phase 3 remains prohibited.


### Canonical local hardening follow-up

[Fresh hardening results](docs/phase-2-provider-hardening.md) record source-fingerprinted offline planning, atomic advisory-locked initialization, unsafe-role/membership checks, guarded startup and synthetic negative tests. `npm run test:phase2:hardening` is offline; `PHASE2_PROVIDER_INIT_TEST=synthetic-only npm run test:phase2:init-postgres` creates and removes a new disposable PostgreSQL cluster, refusing an occupied port. Native Auth/Storage provisioning is separate from ordinary startup. Storage has no supported migration-disabled mode; read-only readiness/hash/policy guards plus explicit prepared-synthetic startup opt-in mitigate but do not eliminate its automatic upstream migration runner. The prior native/browser acceptance counts remain historical, not a new cold-start or production claim.

### Run only the new manual-payment checks

`MANUAL_PAYMENT_TEST=synthetic-only npm run test:manual-payment` creates and removes its own fresh PostgreSQL16 clusters on unused loopback ports. It never accepts an existing database URL, starts native Auth/Storage, changes the canonical SQL fingerprints, or installs this extension into the prepared provider database. The tests use the existing extracted PostgreSQL16 runtime path described above. `db/manual-payment.sql` is an additive synthetic-only contract, **not a prepared-database upgrade or production migration**. Application writes require the separate `PHASE2_MANUAL_PAYMENT=synthetic-only` opt-in as well as the existing local security configuration, verified bearer and live database permissions. There is no real family/admin payment UI or wallet delivery in this iteration.

After `NEXT_TELEMETRY_DISABLED=1 npm run build`, `MANUAL_PAYMENT_TEST=synthetic-only npm run test:manual-payment:http` also checks the actual built Next routing and complete protected flow on owned temporary loopback servers, then stops them. Fresh results and owner decisions are recorded in [the local payment notes](docs/manual-payment-local.md).

### Review the synthetic-only payment screens

After building, run `MANUAL_PAYMENT_DEMO=synthetic-only npm run demo:manual-payment`. Without that exact opt-in, the standalone launcher refuses to start. It prints two **separate loopback origins** for a fixed synthetic guardian and reviewer; it does not add routes or links to the public site. It creates its own disposable fixture database, keeps signing keys and bearer tokens server-side, and forwards allowed commands through the existing protected API. Both interfaces are available to the trusted local tester, not authenticated real users. Stop with Ctrl+C; the runner also closes after 45 minutes. Do not forward ports or use real information. See [Arabic review instructions and operational limits](docs/manual-payment-demo.md).

`npm run test:manual-payment:demo` explicitly launches and removes its own fixture runtime and runs Chromium UI/API integration checks. It requires the same extracted PostgreSQL16 runtime, a completed Next build and `/usr/bin/chromium`; no new dependency or hosted service is used.
