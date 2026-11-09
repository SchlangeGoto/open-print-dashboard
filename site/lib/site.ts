export const SITE_NAME = "OpenPrintDash";
export const SITE_FULL_NAME = "OpenPrintDashboard";
export const SITE_URL = "https://openprintdash.app";
export const GITHUB_URL = "https://github.com/SchlangeGoto/open-print-dashboard";
export const DOCS_URL = `${GITHUB_URL}/tree/main/docs`;
export const ISSUES_URL = `${GITHUB_URL}/issues`;
export const DEMO_URL =
  process.env.NEXT_PUBLIC_DEMO_URL ?? "https://demo.openprintdash.app";

export const PRINTERS = ["X1", "P1", "A1"] as const;
