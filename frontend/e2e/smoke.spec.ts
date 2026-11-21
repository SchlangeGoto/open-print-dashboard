import { test, expect } from "@playwright/test";

test.describe("demo dashboard", () => {
  test("loads the dashboard with demo data", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Filaments in Stock")).toBeVisible();
    await expect(page.getByRole("link", { name: "Spools" })).toBeVisible();
  });

  const routes = [
    ["/dashboard/printers", "Printers"],
    ["/dashboard/prints", "Print Jobs"],
    ["/dashboard/filaments", "Filaments"],
    ["/dashboard/spools", "Spools"],
    ["/dashboard/analytics", "Analytics"],
    ["/dashboard/settings", "Settings"],
  ] as const;

  for (const [path, heading] of routes) {
    test(`renders ${heading}`, async ({ page }) => {
      await page.goto(path);

      await expect(
        page.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
    });
  }

  test("fills spool indicators and settles on the real value", async ({
    page,
  }) => {
    await page.goto("/dashboard/spools");

    const fill = page.locator("[data-spool-fill]").first();
    await expect(fill).toBeVisible();
    const pct = Number(await fill.getAttribute("data-fill-pct"));
    expect(pct).toBeGreaterThan(0);

    const circle = fill.locator("[data-spool-fill-circle]");
    const expectedRadius = 18 + 22 * (pct / 100);
    await expect
      .poll(async () => Number(await circle.getAttribute("r")))
      .toBeCloseTo(expectedRadius, 0);
  });

  test("skips the spool fill animation with reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard/spools");

    const fill = page.locator("[data-spool-fill]").first();
    await expect(fill).toBeVisible();
    const pct = Number(await fill.getAttribute("data-fill-pct"));
    const circle = fill.locator("[data-spool-fill-circle]");
    const expectedRadius = 18 + 22 * (pct / 100);
    await expect
      .poll(async () => Number(await circle.getAttribute("r")))
      .toBeCloseTo(expectedRadius, 0);
  });

  test("keeps sidebar navigation working", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Spools" }).click();

    await expect(page).toHaveURL(/\/dashboard\/spools\/?$/);
    await expect(
      page.getByRole("heading", { name: "Spools", level: 1 }),
    ).toBeVisible();
  });
});

test.describe("phone viewport", () => {
  const routes = [
    "/dashboard",
    "/dashboard/printers",
    "/dashboard/prints",
    "/dashboard/filaments",
    "/dashboard/spools",
    "/dashboard/analytics",
    "/dashboard/settings",
  ] as const;

  for (const path of routes) {
    test(`does not scroll sideways on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("keeps the filament dialog inside a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/filaments");
    await page.getByRole("button", { name: "Add Filament" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });

  test("keeps the spool dialog inside a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/dashboard/spools");
    await page.getByRole("button", { name: "Add Spool" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  });
});

test.describe("auth screen", () => {
  test("shows the login form when demo is opted out", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("opd_demo_opt_out", "1");
    });

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });
});
