import { redirect } from "next/navigation";

/**
 * The web scanner is temporarily unavailable. The Expo app is the supported
 * way to scan filament barcodes; keep the old implementation parked in
 * `app/dashboard/_disabled-scan` until it is either removed or brought back.
 */
export default function DisabledScanPage() {
  redirect("/dashboard/spools");
}
