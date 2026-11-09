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

  test("keeps sidebar navigation working", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Spools" }).click();

    await expect(page).toHaveURL(/\/dashboard\/spools\/?$/);
    await expect(
      page.getByRole("heading", { name: "Spools", level: 1 }),
    ).toBeVisible();
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

// Smoke test for the AI review workflow.
