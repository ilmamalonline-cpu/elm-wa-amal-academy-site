/** Presentation gate only; the teacher demo has no identity, service, or data access. */
export function teacherDemoEnabled(env: Record<string, string | undefined> = process.env, host?: string | null): boolean {
  if (env.VERCEL === "1") {
    return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "preview/academy-synthetic";
  }
  // Explicit development-only review on a loopback listener. Never non-Vercel production.
  return !env.VERCEL && env.NODE_ENV === "development" && env.ACADEMY_PREVIEW === "browser-synthetic-only" &&
    !!host && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host);
}
