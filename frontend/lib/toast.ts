import { toast as toastManager } from "@/components/ui/toast";

type ToastType = "success" | "error" | "info" | "warning";

function show(title: string, type: ToastType) {
  return toastManager.add({ title, type });
}

/**
 * Small compatibility wrapper around the Base UI toast manager so existing
 * call sites can keep using `toast.success(...)` and `toast.error(...)`.
 */
export const toast = {
  success: (title: string) => show(title, "success"),
  error: (title: string) => show(title, "error"),
  info: (title: string) => show(title, "info"),
  warning: (title: string) => show(title, "warning"),
};
