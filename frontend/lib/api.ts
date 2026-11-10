import { DEMO_AVAILABLE, isDemoActive } from "@/lib/demo";

const API_ROOT = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1`;

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const ACCESS_TOKEN_EXPIRES_AT_KEY = "access_token_expires_at";

export const SESSION_EXPIRED_EVENT = "opd:session-expired";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function hasStoredSession(): boolean {
  return Boolean(getAccessToken() || getRefreshToken());
}

// Incremented whenever the stored session changes. In-flight refreshes from an
// older session are ignored so a late response cannot resurrect a logged-out
// session or overwrite a fresh login.
let tokenEpoch = 0;

function storeTokens(tokens: TokenResponse): void {
  if (typeof window === "undefined") return;
  tokenEpoch += 1;
  if (tokens.access_token) {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  }
  if (tokens.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  }
  if (typeof tokens.expires_in === "number") {
    localStorage.setItem(
      ACCESS_TOKEN_EXPIRES_AT_KEY,
      String(Date.now() + tokens.expires_in * 1000),
    );
  } else {
    localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
  }
  sessionExpiredNotified = false;
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  tokenEpoch += 1;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_KEY);
}

let refreshPromise: Promise<string | null> | null = null;
let sessionExpiredNotified = false;

function accessTokenIsFresh(): boolean {
  if (!getAccessToken()) return false;
  const expiresAt = Number(
    localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_KEY) ?? 0,
  );
  // Refresh slightly early so a request cannot expire in flight.
  return expiresAt > Date.now() + 15_000;
}

function notifySessionExpired(): void {
  if (sessionExpiredNotified || typeof window === "undefined") return;
  sessionExpiredNotified = true;
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

async function withRefreshLock<T>(callback: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("opd-refresh-token", callback);
  }
  return callback();
}

async function refreshAccessToken(force = false): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (refreshPromise) return refreshPromise;

  const epoch = tokenEpoch;
  refreshPromise = withRefreshLock(async () => {
    if (epoch !== tokenEpoch) return null;

    // Another tab may have refreshed while this one waited for the lock.
    if (!force && accessTokenIsFresh()) return getAccessToken();

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      if (hasStoredSession()) {
        clearTokens();
        notifySessionExpired();
      }
      return null;
    }

    let res: Response;
    try {
      res = await fetch(`${API_ROOT}/login/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch {
      // Keep the session on a temporary network failure.
      return null;
    }

    if (epoch !== tokenEpoch) return null;

    if (!res.ok) {
      // 400/401/403 mean the refresh token itself is no longer valid.
      // 5xx/429 are transient and must not destroy a valid session.
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        clearTokens();
        notifySessionExpired();
      }
      return null;
    }

    let tokens: TokenResponse;
    try {
      tokens = (await res.json()) as TokenResponse;
    } catch {
      // A truncated response is a server problem, not a revoked session.
      return null;
    }
    if (epoch !== tokenEpoch) return null;
    storeTokens(tokens);
    return tokens.access_token;
  }).finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function fetchWithAuth(
  url: string,
  options: RequestInit = {},
  retry = true,
): Promise<Response> {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });

  // Only refresh for this app's own token challenge. Other 401s (for example
  // an unlinked Bambu Cloud account) must not sign the user out.
  const isAuthChallenge =
    res.status === 401 &&
    res.headers.get("www-authenticate")?.toLowerCase().includes("bearer");

  if (isAuthChallenge && retry) {
    const newToken = await refreshAccessToken(true);
    if (newToken) {
      const retryHeaders = new Headers(options.headers);
      retryHeaders.set("Authorization", `Bearer ${newToken}`);
      return fetch(url, { ...options, headers: retryHeaders });
    }
  }

  return res;
}

/** Authenticated fetch with transparent token refresh, for non-JSON resources. */
export function authenticatedFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  return fetchWithAuth(url, options);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetchWithAuth(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string>),
    },
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

export type PrinterConnectionMode = "cloud" | "lan";

export interface Printer {
  id: string | null;
  name: string;
  serial: string;
  model: string | null;
  ip: string | null;
  access_code: string | null;
  connection_mode: PrinterConnectionMode;
  online: boolean;
  configured: boolean;
  status: any | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface BarcodeScanResult {
  found: boolean;
  code: string;
  filament: any | null;
  spool: any | null;
  suggested_filament: any | null;
}

export interface PrinterInput {
  name: string;
  serial: string;
  connection_mode?: PrinterConnectionMode;
  ip?: string | null;
  access_code?: string | null;
}

export interface PrinterUpdateInput {
  name?: string;
  connection_mode?: PrinterConnectionMode;
  ip?: string | null;
  access_code?: string | null;
}

interface ListResponse<T> {
  data: T[];
  count: number;
}

const apiImpl = {
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
    const data = (await res.json()) as TokenResponse;
    storeTokens(data);
    return {
      ok: true as const,
      username: email,
      token: data.access_token,
      refreshToken: data.refresh_token ?? null,
    };
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await fetch(`${API_ROOT}/login/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
          keepalive: true,
        });
      }
    } catch {
      // Revoking server-side is best-effort; local logout must still happen.
    } finally {
      clearTokens();
    }
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

  // Printers
  getPrinters: () => request<Printer[]>("/printers/"),
  createPrinter: (data: PrinterInput) =>
    request<Printer>("/printers/", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePrinter: (id: string, data: PrinterUpdateInput) =>
    request<Printer>(`/printers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deletePrinter: (id: string) =>
    request<{ message: string }>(`/printers/${id}`, { method: "DELETE" }),
  getPrinterStatus: () => request<any>("/printers/status"),
  getCloudStatus: () => request<any[]>("/printers/cloud/status"),
  getTasks: (limit = 20) => request<any[]>(`/printers/tasks?limit=${limit}`),
  getPrinterTasks: (serial: string, limit = 20) =>
    request<any[]>(`/printers/${serial}/tasks?limit=${limit}`),
  getFirmware: (serial: string) => request<any>(`/printers/${serial}/firmware`),
  getProjects: () => request<any[]>("/printers/projects"),
  getMessages: () => request<any[]>("/printers/messages"),
  reconnectPrinter: (id: string) =>
    request<{ message: string }>(`/printers/${id}/reconnect`, {
      method: "POST",
    }),

  // Print Jobs
  getPrintJobs: async () =>
    (await request<ListResponse<any>>("/prints/")).data,
  getAllPrintJobs: async () => {
    const pageSize = 500;
    const jobs: any[] = [];
    let skip = 0;

    while (true) {
      const page = await request<ListResponse<any>>(
        `/prints/?skip=${skip}&limit=${pageSize}`,
      );
      jobs.push(...page.data);
      if (jobs.length >= page.count || page.data.length === 0) break;
      skip += pageSize;
    }

    return jobs;
  },
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
  activateSpool: (id: string, printerId: string) =>
    request<any>(`/spools/${id}/activate`, {
      method: "PUT",
      body: JSON.stringify({ printer_id: printerId }),
    }),
  scanNfc: (uid: string) =>
    request<any>("/spools/scan", { method: "POST", body: JSON.stringify({ uid }) }),
  assignNfc: (uid: string, spoolId: string) =>
    request<any>("/spools/scan/assign", {
      method: "POST",
      body: JSON.stringify({ uid, spool_id: spoolId }),
    }),
  scanBarcode: (code: string) =>
    request<BarcodeScanResult>("/spools/scan/barcode", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  confirmBarcode: (code: string, filament: any, totalWeightG?: number) =>
    request<BarcodeScanResult>("/spools/scan/barcode/confirm", {
      method: "POST",
      body: JSON.stringify({
        code,
        filament,
        total_weight_g: totalWeightG ?? filament.spool_weight_g ?? 1000,
      }),
    }),

  // Health
  health: () => request<boolean>("/utils/health-check/"),
};

export type ApiShape = typeof apiImpl;

/**
 * In development, route every API call through the mock implementation while
 * demo mode is active. The demo module is imported lazily so it is only loaded
 * when it is actually used.
 */
function createApi(): ApiShape {
  if (!DEMO_AVAILABLE) return apiImpl;

  return new Proxy(apiImpl, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (
        typeof property !== "string" ||
        typeof value !== "function" ||
        !isDemoActive()
      ) {
        return value;
      }

      return (...args: unknown[]) =>
        import("./demo-api").then(({ demoApi }) => {
          const demoMethod = (
            demoApi as unknown as Record<
              string,
              (...demoArgs: unknown[]) => unknown
            >
          )[property];

          if (!demoMethod) {
            return (value as (...realArgs: unknown[]) => unknown)(...args);
          }

          return demoMethod(...args);
        });
    },
  });
}

export const api = createApi();

export { API_ROOT };
