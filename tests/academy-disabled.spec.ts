import { test, expect } from "@playwright/test";

// Requires the documented, default-disabled build server at loopback port 3003.
test("academy defaults closed: public pages remain available, API has no storage/auth/provider action", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.ACADEMY_DISABLED_TEST !== "synthetic-only",
    "Run with ACADEMY_DISABLED_TEST=synthetic-only and default-disabled server on port 3003.",
  );
  for (const endpoint of [
    "/api/academy-demo",
    "/api/phase2/me",
    "/api/manual-payments/orders",
  ]) {
    const result = await request.get(`http://127.0.0.1:3003${endpoint}`);
    expect(result.status()).toBe(503);
  }
  await page.goto("http://127.0.0.1:3003/en/workspace");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    "The demo is disabled by default",
  );
  await expect(page.locator("main")).toContainText("npm run dev:academy");
  await expect(page.getByRole("button", { name: /01 Guardian/ })).toHaveCount(
    0,
  );
  await page.goto("http://127.0.0.1:3003/ar");
  await expect(page.locator("h1")).toHaveCount(1);
});

test("academy HTTP validation: bounded body, same-origin header, opaque HttpOnly session and role-independent cookie", async ({
  request,
}) => {
  const headers = { "X-Academy-Demo": "synthetic-only" };
  const result = await request.post("/api/academy-demo", {
    headers,
    data: { action: "enter", role: "guardian" },
  });
  expect(result.status()).toBe(200);
  expect(result.headers()["set-cookie"]).toMatch(
    /academy_demo=[A-Za-z0-9_-]{32}; Path=\/; HttpOnly; SameSite=Strict/,
  );
  expect(result.headers()["cache-control"]).toContain("no-store");
  expect(
    (
      await request.post("/api/academy-demo", {
        headers: { ...headers, "Content-Type": "text/plain" },
        data: '{"action":"logout"}',
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/academy-demo", {
        headers,
        data: {
          action: "enroll",
          packageId: "quran",
          ageBand: "child",
          padding: "x".repeat(17_000),
        },
      })
    ).status(),
  ).toBe(413);
  expect(
    (
      await request.post("/api/academy-demo", {
        headers,
        data: { action: "logout", role: "admin" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/academy-demo", {
        headers: { ...headers, Origin: "https://example.org" },
        data: { action: "enter", role: "admin" },
      })
    ).status(),
  ).toBe(403);
  expect((await request.get("/api/academy-demo?role=admin")).status()).toBe(
    400,
  );
  const logout = await request.post("/api/academy-demo", {
    headers,
    data: { action: "logout" },
  });
  expect((await logout.json()).view.role).toBe(null);
  expect(
    (await (await request.get("/api/academy-demo")).json()).view.role,
  ).toBe(null);
  expect(
    (
      await request.post("/api/academy-demo", {
        headers,
        data: {
          action: "assess",
          studentId: "child-1",
          level: "foundation",
          notes: "Synthetic",
        },
      })
    ).status(),
  ).toBe(401);
});
