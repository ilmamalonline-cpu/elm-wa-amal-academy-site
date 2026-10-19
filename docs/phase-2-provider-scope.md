# Phase 2 — local native-provider continuation

The owner's “Proceed locally with synthetic data only” authorizes completing the remaining **Phase 2 local provider-integration work**, following the initial local foundation report. It does not authorize Phase 3, hosted provisioning, external-service changes or production use.

Run real Supabase Auth/GoTrue, PostgREST and Supabase Storage components as local loopback processes against a **separate disposable database `phase2_provider_test`**, preserving the earlier `phase2_test` harness and Phase 1 public pages. Local account fixtures use reserved `.invalid` email addresses and generated credentials only. Any recovery email is captured by a local SMTP sink with no forwarding/relay; there is no delivery to a real mailbox. Test actual password login, session rotation/logout, TOTP MFA, a synthetic recovery flow, REST/RLS/column boundaries and private-bucket access. Public signup, child login, uploads, operational onboarding and privileged application commands remain disabled.

No Docker daemon or hosted project is required for the native components. This is not a complete Supabase CLI/Docker stack or a production deployment. Services are bound to127.0.0.1, run only during testing, and are stopped afterward. Ephemeral keys and test files stay outside project source with restricted permissions, never in documentation or test logs.

No commit, push, deploy, live migration, real account/data, real money, Quran import, recording or outward notification is authorized. D05, D06, D08, D10, D11 and detailed safeguarding/consent/recovery operations remain pending; native provider tests cannot approve those procedures or establish real-user readiness.
