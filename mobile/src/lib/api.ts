import type {
  BarcodeScanResult,
  Filament,
  FilamentInput,
  ListResponse,
  Printer,
  Spool,
  TokenResponse,
  UserPublic,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ApiClientOptions {
  getServerUrl: () => string | null;
  getTokens: () => AuthTokens | null;
  setTokens: (tokens: AuthTokens) => Promise<void>;
  clearTokens: () => Promise<void>;
  onSessionExpired: () => void;
}

function isPrivateHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host)
  );
}

export function normalizeServerUrl(input: string): string {
  let value = input.trim();
  if (!value) {
    throw new Error("Enter your server URL");
  }

  if (!/^https?:\/\//i.test(value)) {
    const host = value.split("/")[0].split(":")[0];
    value = `${isPrivateHost(host) ? "http" : "https"}://${value}`;
  }

  value = value.replace(/\/+$/, "").replace(/\/api\/v1$/i, "");

  if (!/^https?:\/\/[^\s/]+/i.test(value)) {
    throw new Error("Enter a valid URL, for example https://print.example.com");
  }

  return value;
}

export async function testServerConnection(input: string): Promise<string> {
  const baseUrl = normalizeServerUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${baseUrl}/api/v1/utils/health-check/`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`The server replied with ${res.status}`);
    }
    const data = await res.json().catch(() => null);
    if (data !== true) {
      throw new Error(
        "That address is reachable, but it does not look like an Open Print Dashboard server.",
      );
    }
    return baseUrl;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Connection timed out. Check the address and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class ApiClient {
  private refreshPromise: Promise<string | null> | null = null;
  private epoch = 0;

  constructor(private readonly options: ApiClientOptions) {}

  private get baseUrl(): string {
    const url = this.options.getServerUrl();
    if (!url) {
      throw new Error("Server URL is not configured");
    }
    return `${url}/api/v1`;
  }

  private async parse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        detail?: unknown;
      } | null;
      const detail = Array.isArray(body?.detail)
        ? (body.detail[0] as { msg?: string } | undefined)?.msg
        : body?.detail;
      throw new ApiError(
        res.status,
        typeof detail === "string"
          ? detail
          : `Request failed (${res.status})`,
      );
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await res.json()) as T;
  }

  private async fetchWithAuth(
    path: string,
    init: RequestInit = {},
    retry = true,
  ): Promise<Response> {
    const baseUrl = this.baseUrl;
    const headers = new Headers(init.headers);
    const tokens = this.options.getTokens();
    if (tokens?.accessToken) {
      headers.set("Authorization", `Bearer ${tokens.accessToken}`);
    }
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });

    if (res.status === 401 && retry) {
      const accessToken = await this.refreshAccessToken();
      if (accessToken) {
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set("Authorization", `Bearer ${accessToken}`);
        if (init.body && !retryHeaders.has("Content-Type")) {
          retryHeaders.set("Content-Type", "application/json");
        }
        return fetch(`${baseUrl}${path}`, {
          ...init,
          headers: retryHeaders,
        });
      }
    }

    return res;
  }

  private async expire(epoch: number): Promise<void> {
    if (epoch !== this.epoch) return;
    this.epoch += 1;
    await this.options.clearTokens();
    this.options.onSessionExpired();
  }

  private async runRefresh(epoch: number): Promise<string | null> {
    const tokens = this.options.getTokens();
    if (!tokens?.refreshToken) {
      await this.expire(epoch);
      return null;
    }

    if (tokens.accessToken && tokens.expiresAt > Date.now() + 15_000) {
      return tokens.accessToken;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/login/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refreshToken }),
      });
    } catch {
      // Keep the session while offline so a retry can refresh it later.
      throw new ApiError(
        0,
        "Can't reach the server. Check the URL and your connection.",
      );
    }

    if (epoch !== this.epoch) return null;

    if (!res.ok) {
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        await this.expire(epoch);
        return null;
      }
      throw new ApiError(
        res.status,
        `Could not refresh the session (${res.status})`,
      );
    }

    const data = (await res.json()) as TokenResponse;
    if (epoch !== this.epoch) return null;

    const next: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };

    const writeEpoch = ++this.epoch;
    await this.options.setTokens(next);
    if (writeEpoch !== this.epoch) {
      await this.options.clearTokens();
      return null;
    }
    return next.accessToken;
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    const epoch = this.epoch;
    this.refreshPromise = this.runRefresh(epoch).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async login(email: string, password: string): Promise<UserPublic> {
    const body = new URLSearchParams({
      username: email.trim(),
      password,
    });
    const res = await fetch(`${this.baseUrl}/login/access-token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data = await this.parse<TokenResponse>(res);
    const tokens: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? "",
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };
    this.epoch += 1;
    await this.options.setTokens(tokens);
    return this.getMe();
  }

  async logout(): Promise<void> {
    const tokens = this.options.getTokens();
    this.epoch += 1;
    try {
      if (tokens?.refreshToken) {
        await fetch(`${this.baseUrl}/login/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: tokens.refreshToken }),
        });
      }
    } catch {
      // Local sign-out has to succeed even when the server is unreachable.
    } finally {
      await this.options.clearTokens();
    }
  }

  getMe(): Promise<UserPublic> {
    return this.request<UserPublic>("/users/me");
  }

  async getSpools(): Promise<Spool[]> {
    const data = await this.request<ListResponse<Spool>>("/spools/");
    return data.data;
  }

  async getFilaments(): Promise<Filament[]> {
    const data = await this.request<ListResponse<Filament>>("/filaments/");
    return data.data;
  }

  getPrinters(): Promise<Printer[]> {
    return this.request<Printer[]>("/printers/");
  }

  getSpool(id: string): Promise<Spool> {
    return this.request<Spool>(`/spools/${id}`);
  }

  getFilament(id: string): Promise<Filament> {
    return this.request<Filament>(`/filaments/${id}`);
  }

  scanBarcode(code: string): Promise<BarcodeScanResult> {
    return this.request<BarcodeScanResult>("/spools/scan/barcode", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  }

  confirmBarcode(
    code: string,
    filament: FilamentInput,
    totalWeightG?: number,
    pricePerKg?: number,
  ): Promise<BarcodeScanResult> {
    return this.request<BarcodeScanResult>("/spools/scan/barcode/confirm", {
      method: "POST",
      body: JSON.stringify({
        code,
        filament,
        total_weight_g: totalWeightG,
        price_per_kg: pricePerKg,
      }),
    });
  }

  activateSpool(spoolId: string, printerId: string): Promise<Spool> {
    return this.request<Spool>(`/spools/${spoolId}/activate`, {
      method: "PUT",
      body: JSON.stringify({ printer_id: printerId }),
    });
  }

  private request<T>(path: string, init?: RequestInit): Promise<T> {
    return this.fetchWithAuth(path, init).then((res) => this.parse<T>(res));
  }
}
