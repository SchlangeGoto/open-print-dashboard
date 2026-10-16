const API_ROOT = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("access_token");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.detail)
      ? body.detail[0]?.msg
      : body.detail;
    throw new ApiError(res.status, detail ?? "Request failed");
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface UserPublic {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string | null;
}

export interface SetupStatus {
  user_created: boolean;
  bambu_logged_in: boolean;
  printer_configured: boolean;
  setup_complete: boolean;
}

export interface PrinterConfig {
  ip: string | null;
  serial: string | null;
  access_code: string | null;
}

interface ListResponse<T> {
  data: T[];
  count: number;
}

export const api = {
  // Setup / auth
  getSetupStatus: () => request<SetupStatus>("/setup/status"),

  register: (email: string, password: string, fullName?: string) =>
    request<UserPublic>("/users/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName ?? null }),
    }),

  // JWT login — uses form-encoded body as required by OAuth2PasswordRequestForm
  loginUser: async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch(`${API_ROOT}/login/access-token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.detail ?? "Login failed");
    }
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem("access_token", data.access_token);
    }
    return { ok: true, username: email, token: data.access_token as string };
  },

  getMe: () => request<UserPublic>("/users/me"),

  recoverPassword: (email: string) =>
    request<{ message: string }>(
      `/password-recovery/${encodeURIComponent(email)}`,
      { method: "POST" },
    ),

  resetPassword: (token: string, newPassword: string) =>
    request<{ message: string }>("/reset-password/", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),

  // Bambu Cloud Auth
  bambuLoginStart: (email: string, password: string) =>
    request<{ message?: string; requireCode?: boolean }>("/bambu/login/start", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  bambuLoginVerify: (code: string) =>
    request<{ message?: string; codeExpired?: boolean }>("/bambu/login/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  getBambuProfile: () => request<any>("/bambu/profile"),

  // Settings
  getSettings: () => request<{ key: string; value: string }[]>("/settings/"),
  getPrinterConfig: () => request<PrinterConfig>("/settings/printer"),
  savePrinterConfig: (config: PrinterConfig) =>
    request<PrinterConfig>("/settings/printer", {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  // Printers
  getPrinters: () => request<any[]>("/printers/"),
  getPrinterStatus: () => request<any>("/printers/status"),
  getCloudStatus: () => request<any[]>("/printers/cloud/status"),
  getTasks: (limit = 20) => request<any[]>(`/printers/tasks?limit=${limit}`),
  getPrinterTasks: (serial: string, limit = 20) =>
    request<any[]>(`/printers/${serial}/tasks?limit=${limit}`),
  getFirmware: (serial: string) => request<any>(`/printers/${serial}/firmware`),
  getProjects: () => request<any[]>("/printers/projects"),
  getMessages: () => request<any[]>("/printers/messages"),
  reconnectPrinter: () =>
    request<{ message: string }>("/printers/reconnect", { method: "POST" }),

  // Print Jobs
  getPrintJobs: async () =>
    (await request<ListResponse<any>>("/prints/")).data,
  getActivePrints: async () =>
    (await request<ListResponse<any>>("/prints/active")).data,
  getPrint: (id: string) => request<any>(`/prints/${id}`),
  deletePrint: (id: string) =>
    request<{ message: string }>(`/prints/${id}`, { method: "DELETE" }),

  // Filaments
  getFilaments: async () =>
    (await request<ListResponse<any>>("/filaments/")).data,
  getFilament: (id: string) => request<any>(`/filaments/${id}`),
  createFilament: (data: any) =>
    request<any>("/filaments/", { method: "POST", body: JSON.stringify(data) }),
  updateFilament: (id: string, data: any) =>
    request<any>(`/filaments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFilament: (id: string) =>
    request<{ message: string }>(`/filaments/${id}`, { method: "DELETE" }),
  getFilamentSpools: async (id: string) =>
    (await request<ListResponse<any>>(`/filaments/${id}/spools`)).data,
  getFilamentStats: (id: string) => request<any>(`/filaments/stats/${id}`),

  // Spools
  getSpools: async (filamentId?: string) =>
    (
      await request<ListResponse<any>>(
        `/spools/${filamentId ? `?filament_id=${filamentId}` : ""}`,
      )
    ).data,
  getActiveSpool: () => request<any>("/spools/active").catch(() => null),
  getSpool: (id: string) => request<any>(`/spools/${id}`),
  createSpool: (data: any) =>
    request<any>("/spools/", { method: "POST", body: JSON.stringify(data) }),
  updateSpool: (id: string, data: any) =>
    request<any>(`/spools/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSpool: (id: string) =>
    request<{ message: string }>(`/spools/${id}`, { method: "DELETE" }),
  activateSpool: (id: string) =>
    request<any>(`/spools/${id}/activate`, { method: "PUT" }),
  scanNfc: (uid: string) =>
    request<any>("/spools/scan", { method: "POST", body: JSON.stringify({ uid }) }),
  assignNfc: (uid: string, spoolId: string) =>
    request<any>("/spools/scan/assign", {
      method: "POST",
      body: JSON.stringify({ uid, spool_id: spoolId }),
    }),

  // Health
  health: () => request<boolean>("/utils/health-check/"),
};

export { API_ROOT };
