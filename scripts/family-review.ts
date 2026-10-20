import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { familyAdapter, familyEnabled, FamilyError, FAMILY_PROJECT } from "../src/lib/academy/family-registration";

// Supply the saved publishable/anon key in the process environment, never argv,
// a project .env file, build settings, logs or a synthetic preview deployment.
async function main() {
const mode = process.argv.slice(2);
if (mode.length !== 1 || !["--check", "--serve"].includes(mode[0])) {
  console.error("Usage: tsx scripts/family-review.ts --check|--serve (loopback only, port 3430)");
  process.exitCode = 2;
} else {
  const env = { ...process.env, ACADEMY_FAMILY_REGISTRATION: "local-review", ACADEMY_SUPABASE_URL: process.env.ACADEMY_SUPABASE_URL ?? FAMILY_PROJECT };
  try {
    if (!familyEnabled(env)) throw new FamilyError("registration_disabled", 503);
    const result = await familyAdapter(env).readiness();
    console.log(JSON.stringify(result, null, 2));
    if (mode[0] === "--serve") {
      const root = resolve(dirname(process.argv[1]), "..");
      const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3430"], { cwd: root, env, stdio: "inherit" });
      for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => child.kill(signal));
      child.once("error", () => { console.error("local_server_unavailable"); process.exitCode = 1; });
      child.once("exit", code => { process.exitCode = code ?? 1; });
    }
  } catch (error) {
    // Never serialize provider errors or process.env.
    console.error(error instanceof FamilyError ? error.code : "provider_unavailable");
    process.exitCode = 1;
  }
}
}
void main();
