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

const REQUEST_TIMEOUT_MS = 20_000;

function isIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : NaN,
  );
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets;
}

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local")) return true;

  const octets = isIPv4(host);
  if (octets) {
    const [a, b] = octets;
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }

  const lower = host.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fe80:") ||
    /^f[cd][0-9a-f]{2}:/.test(lower)
  );
}

function hostFromUrl(value: string): string {
  const authority = value
    .replace(/^https?:\/\//i, "")
    .split("/")[0];
  if (authority.startsWith("[")) {
    return authority.slice(1, authority.indexOf("]")).toLowerCase();
  }
  return authority.split(":")[0].toLowerCase();
}

export function normalizeServerUrl(input: string): string {
  let value = input.trim();
  if (!value) {
    throw new Error("Enter your server URL");
  }

  const hasProtocol = /^https?:\/\//i.test(value);
  if (!hasProtocol) {
    const host = hostFromUrl(`https://${value}`);
    value = `${isPrivateHost(host) ? "http" : "https"}://${value}`;
  }

  const authority = value.replace(/^https?:\/\//i, "").split("/")[0];
  if (authority.includes("@")) {
    throw new Error("Server URLs cannot include a username or password");
  }

  value = value.replace(/\/+$/, "").replace(/\/api\/v1$/i, "");

  if (!/^https?:\/\/[^\s/]+/i.test(value)) {
    throw new Error("Enter a valid URL, for example https://print.example.com");
  }

  const host = hostFromUrl(value);
  if (value.toLowerCase().startsWith("http://") && !isPrivateHost(host)) {
    throw new Error(
      "Use HTTPS for a public server. Plain HTTP is only allowed for local network addresses.",
    );
  }

  return value;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(0, "The server took too long to respond.");
    }
    throw new ApiError(
      0,
      "Can't reach the server. Check the URL and your connection.",
    );
  } finally {
    clearTimeout(timeout);
  }
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

    const res = await fetchWithTimeout(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    // Only refresh for this app's own bearer challenge. Other 401s (for
    // example an unlinked Bambu Cloud account) must not sign the user out.
    const isAuthChallenge =
      res.status === 401 &&
      res.headers.get("www-authenticate")?.toLowerCase().includes("bearer");

    if (isAuthChallenge && retry) {
      const accessToken = await this.refreshAccessToken(true);
      if (accessToken) {
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set("Authorization", `Bearer ${accessToken}`);
        if (init.body && !retryHeaders.has("Content-Type")) {
          retryHeaders.set("Content-Type", "application/json");
        }
        return fetchWithTimeout(`${baseUrl}${path}`, {
          ...init,
          headers: retryHeaders,
        });
      }
    }

    return res;
  }

  /** Invalidate any in-flight refresh after the server/session changes. */
  invalidateSession(): void {
    this.epoch += 1;
  }

  private async expire(epoch: number): Promise<void> {
    if (epoch !== this.epoch) return;
    this.epoch += 1;
    await this.options.clearTokens();
    this.options.onSessionExpired();
  }

  private async runRefresh(
    epoch: number,
    force: boolean,
  ): Promise<string | null> {
    const tokens = this.options.getTokens();
    if (!tokens?.refreshToken) {
      if (tokens) {
        await this.expire(epoch);
      }
      return null;
    }

    if (!force && tokens.accessToken && tokens.expiresAt > Date.now() + 15_000) {
      return tokens.accessToken;
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/login/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });

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

    let data: TokenResponse;
    try {
      data = (await res.json()) as TokenResponse;
    } catch {
      throw new ApiError(0, "The server returned an invalid session response.");
    }
    if (epoch !== this.epoch) return null;

    const next: AuthTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    };

    this.epoch += 1;
    await this.options.setTokens(next);
    return next.accessToken;
  }

  private async refreshAccessToken(force = false): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;
    const epoch = this.epoch;
    this.refreshPromise = this.runRefresh(epoch, force).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async login(email: string, password: string): Promise<UserPublic> {
    const body = new URLSearchParams({
      username: email.trim(),
      password,
    });
    const res = await fetchWithTimeout(`${this.baseUrl}/login/access-token`, {
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
    try {
      return await this.getMe();
    } catch (error) {
      // Do not leave a usable session behind when the post-login probe fails.
      await this.options.clearTokens();
      throw error;
    }
  }

  async logout(): Promise<void> {
    // Let an in-flight refresh settle first. Bumping the epoch before it
    // finishes would discard the rotated token while it stays valid on the
    // server.
    if (this.refreshPromise) {
      await this.refreshPromise.catch(() => null);
    }
    const tokens = this.options.getTokens();
    this.epoch += 1;
    try {
      if (tokens?.refreshToken) {
        await fetchWithTimeout(
          `${this.baseUrl}/login/logout`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: tokens.refreshToken }),
          },
          10_000,
        );
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

  scanBarcode(
    code: string,
    create = true,
    type?: string,
  ): Promise<BarcodeScanResult> {
    return this.request<BarcodeScanResult>("/spools/scan/barcode", {
      method: "POST",
      body: JSON.stringify({ code, create, ...(type ? { type } : {}) }),
    });
  }

  confirmBarcode(
    code: string,
    filament: FilamentInput,
    totalWeightG?: number,
    pricePerKg?: number,
    type?: string,
  ): Promise<BarcodeScanResult> {
    return this.request<BarcodeScanResult>("/spools/scan/barcode/confirm", {
      method: "POST",
      body: JSON.stringify({
        code,
        filament,
        total_weight_g: totalWeightG,
        price_per_kg: pricePerKg,
        ...(type ? { type } : {}),
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
