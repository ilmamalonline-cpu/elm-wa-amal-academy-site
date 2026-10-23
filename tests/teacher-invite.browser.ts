import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { GET } from "../src/app/auth/teacher/invite/route";
import { TEACHER_INVITE_HOST, TEACHER_INVITE_PATH } from "../src/lib/academy/teacher-invite";
import { PREVIEW_PROJECT } from "../src/lib/academy/family-registration";

const share = "synthetic-share";
const savedEnv = { ...process.env };
let server: Server;
let baseUrl = "";

function setPreviewEnv() {
  Object.assign(process.env, {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic",
    ACADEMY_FAMILY_REGISTRATION: "owner-preview",
    ACADEMY_SUPABASE_URL: PREVIEW_PROJECT,
    ACADEMY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mock_public_test_key_only",
    ACADEMY_FAMILY_CALLBACK_URL: `https://${TEACHER_INVITE_HOST}/auth/family/callback?_vercel_share=${share}`,
    TEACHER_INVITE_TEST_MODE: "true",
  });
}
function restoreEnv() {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
}

const previewOrigin = "https://dyyvpcntbbwbuzskiidb.supabase.co";
const validAccessToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1In0.test-signature";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "ilmamalonline@gmail.com", email_confirmed_at: "2026-01-01T00:00:00Z" };

async function mockAuth(page: import("@playwright/test").Page, options: { update?: "success" | "uncertain"; email?: string } = {}) {
  let gets = 0;
  let updates = 0;
  const payloads: unknown[] = [];
  await page.route(`${previewOrigin}/auth/v1/user`, async route => {
    const request = route.request();
    const origin = request.headers().origin ?? "null";
    const cors = {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,PUT,OPTIONS",
      "access-control-allow-headers": "apikey,authorization,content-type",
      "access-control-max-age": "0",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    if (request.method() === "GET") {
      gets++;
      await route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ ...user, email: options.email ?? user.email }) });
      return;
    }
    if (request.method() === "PUT") {
      updates++;
      payloads.push(request.postDataJSON());
      if (options.update === "uncertain") { await route.abort("failed"); return; }
      await route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ ...user, email: options.email ?? user.email }) });
      return;
    }
    await route.fulfill({ status: 405, headers: cors, body: "" });
  });
  return { counts: () => ({ gets, updates }), payloads };
}

test.beforeAll(async () => {
  setPreviewEnv();
  server = createServer(async (incoming, outgoing) => {
    const host = incoming.headers.host ?? "127.0.0.1";
    const headers = new Headers({ host });
    const acceptLanguage = incoming.headers["accept-language"];
    if (typeof acceptLanguage === "string") headers.set("accept-language", acceptLanguage);
    const request = new Request(`http://${host}${incoming.url ?? TEACHER_INVITE_PATH}`, { method: "GET", headers });
    const response = await GET(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(await response.text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local invitation test server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  restoreEnv();
});

test("valid invite token is scrubbed and only the invitee-chosen password is sent to Auth", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "accept-language": "en" });
  const mock = await mockAuth(page);
  await page.goto(`${baseUrl}${TEACHER_INVITE_PATH}#access_token=${encodeURIComponent(validAccessToken)}&type=invite&refresh_token=must-not-be-used`);
  await expect(page).toHaveURL(`${baseUrl}${TEACHER_INVITE_PATH}`);
  await expect(page.getByText("Invitation for: ilmamalonline@gmail.com", { exact: true })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("invitee-chosen-password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("invitee-chosen-password");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.locator("#invite-status")).toContainText("Your password is set");
  expect(mock.counts()).toEqual({ gets: 1, updates: 1 });
  expect(mock.payloads).toEqual([{ password: "invitee-chosen-password" }]);
  await expect(page.locator("#invite-status")).toContainText("does not create a teacher profile or grant access");
});

test("review-only page shows the form but makes no Auth request and cannot submit", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "accept-language": "en" });
  const mock = await mockAuth(page);
  await page.goto(`${baseUrl}${TEACHER_INVITE_PATH}?review=1`);
  await expect(page.getByText(/READ-ONLY REVIEW/)).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Set password" })).toBeDisabled();
  expect(mock.counts()).toEqual({ gets: 0, updates: 0 });
});

test("a signup or recovery link never opens the password setup form", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "accept-language": "en" });
  const mock = await mockAuth(page);
  await page.goto(`${baseUrl}${TEACHER_INVITE_PATH}#access_token=${encodeURIComponent(validAccessToken)}&type=recovery`);
  await expect(page.getByText(/invalid or expired/)).toBeVisible();
  await expect(page.locator("#invite-form")).toBeHidden();
  expect(mock.counts()).toEqual({ gets: 0, updates: 0 });
});

test("a valid invite for a different person is rejected without a password update", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "accept-language": "en" });
  const mock = await mockAuth(page, { email: "other@example.test" });
  await page.goto(`${baseUrl}${TEACHER_INVITE_PATH}#access_token=${encodeURIComponent(validAccessToken)}&type=invite`);
  await expect(page.getByText(/invalid or expired/)).toBeVisible();
  await expect(page.locator("#invite-form")).toBeHidden();
  expect(mock.counts()).toEqual({ gets: 1, updates: 0 });
});

test("uncertain password update is not replayed", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "accept-language": "en" });
  const mock = await mockAuth(page, { update: "uncertain" });
  await page.goto(`${baseUrl}${TEACHER_INVITE_PATH}#access_token=${encodeURIComponent(validAccessToken)}&type=invite`);
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("invitee-chosen-password");
  await page.getByLabel("Confirm new password", { exact: true }).fill("invitee-chosen-password");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByText(/could not confirm whether the password was saved/)).toBeVisible();
  await page.getByRole("button", { name: "Set password" }).click({ force: true });
  expect(mock.counts()).toEqual({ gets: 1, updates: 1 });
});
