import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiClient, ApiError, normalizeServerUrl, type AuthTokens } from "./api";
import {
  clearStoredSession,
  clearStoredTenantId,
  loadStoredServerUrl,
  loadStoredSession,
  loadStoredTenantId,
  saveStoredServerUrl,
  saveStoredSession,
  saveStoredTenantId,
} from "./storage";
import {
  forgetPushToken,
  registerPushToken,
  unregisterPushToken,
} from "./push";
import type { TenantMembership, UserPublic } from "./types";

export type AuthStatus =
  | "loading"
  | "needs-server"
  | "logged-out"
  | "authenticated"
  | "unreachable";

// The client outlives a single render, so its token and URL accessors use
// module state instead of React refs. The provider is the only writer.
let sessionServerUrl: string | null = null;
let sessionTokens: AuthTokens | null = null;
let sessionTenantId: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;
let tenantInvalidHandler: (() => void) | null = null;

const apiClient = new ApiClient({
  getServerUrl: () => sessionServerUrl,
  getTokens: () => sessionTokens,
  getTenantId: () => sessionTenantId,
  setTokens: async (tokens) => {
    sessionTokens = tokens;
    await saveStoredSession(tokens);
  },
  clearTokens: async () => {
    sessionTokens = null;
    await clearStoredSession();
  },
  onSessionExpired: () => {
    sessionExpiredHandler?.();
  },
  onTenantInvalid: () => {
    tenantInvalidHandler?.();
  },
});

interface AuthContextValue {
  status: AuthStatus;
  user: UserPublic | null;
  serverUrl: string | null;
  tenants: TenantMembership[];
  activeTenantId: string | null;
  needsTenantSelection: boolean;
  api: ApiClient;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  refreshTenants: () => Promise<TenantLoadResult>;
  setServerUrl: (url: string) => Promise<void>;
  retry: () => Promise<void>;
}

export type TenantLoadResult = "ok" | "expired" | "failed";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserPublic | null>(null);
  const [serverUrl, setServerUrlState] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [needsTenantSelection, setNeedsTenantSelection] = useState(false);
  const restoreEpoch = useRef(0);

  const applyTenants = useCallback(async (list: TenantMembership[]) => {
    setTenants(list);
    const stored = list.find(
      (tenant) => tenant.id === sessionTenantId && tenant.is_active,
    );
    if (stored) {
      setActiveTenantId(stored.id);
      setNeedsTenantSelection(false);
      return;
    }
    const only = list.filter((tenant) => tenant.is_active);
    if (only.length === 1) {
      sessionTenantId = only[0].id;
      setActiveTenantId(only[0].id);
      setNeedsTenantSelection(false);
      await saveStoredTenantId(only[0].id);
      return;
    }
    sessionTenantId = null;
    setActiveTenantId(null);
    // Zero memberships is a real no-access state, not "open the dashboard".
    setNeedsTenantSelection(only.length !== 1);
    await clearStoredTenantId();
  }, []);

  const clearExpiredSession = useCallback(async () => {
    restoreEpoch.current += 1;
    apiClient.invalidateSession();
    forgetPushToken();
    sessionTokens = null;
    sessionTenantId = null;
    setUser(null);
    setTenants([]);
    setActiveTenantId(null);
    setNeedsTenantSelection(false);
    try {
      await clearStoredSession();
      await clearStoredTenantId();
    } catch {
      // Storage cleanup is best effort; the in-memory state is already gone.
    }
    setStatus("logged-out");
  }, []);

  const loadTenants = useCallback(async (): Promise<TenantLoadResult> => {
    const generation = restoreEpoch.current;
    try {
      const list = await apiClient.getMeTenants();
      // A sign-out, sign-in or server change while this request was in flight
      // must not apply its result to the new session.
      if (generation !== restoreEpoch.current) return "failed";
      await applyTenants(list);
      return "ok";
    } catch (error) {
      if (generation !== restoreEpoch.current) return "failed";
      // Only an expired/invalid session ends authentication. A 403 may be a
      // WAF or proxy response and must stay retryable.
      if (error instanceof ApiError && error.status === 401) {
        await clearExpiredSession();
        return "expired";
      }
      // A non-auth failure must not end the session. Single-tenant installs
      // fall back to the only membership server-side.
      setTenants([]);
      setActiveTenantId(sessionTenantId);
      return "failed";
    }
  }, [applyTenants, clearExpiredSession]);

  useEffect(() => {
    sessionExpiredHandler = () => {
      restoreEpoch.current += 1;
      forgetPushToken();
      sessionTokens = null;
      sessionTenantId = null;
      setUser(null);
      setTenants([]);
      setActiveTenantId(null);
      setNeedsTenantSelection(false);
      setStatus("logged-out");
    };
    tenantInvalidHandler = () => {
      // The active membership was removed or the tenant was deactivated.
      // Drop the selection and show the picker with the current memberships.
      const generation = restoreEpoch.current;
      sessionTenantId = null;
      setActiveTenantId(null);
      setNeedsTenantSelection(true);
      void clearStoredTenantId();
      void apiClient
        .getMeTenants()
        .then((list) => {
          if (generation === restoreEpoch.current) return applyTenants(list);
        })
        .catch(() => {
          // A network failure still leaves the picker state in place; retry
          // from the picker or the connection screen.
        });
    };
    return () => {
      sessionExpiredHandler = null;
      tenantInvalidHandler = null;
    };
  }, [applyTenants]);

  useEffect(() => {
    if (status === "authenticated") {
      void registerPushToken(apiClient);
    }
  }, [status]);

  const restore = useCallback(async () => {
    const epoch = ++restoreEpoch.current;
    try {
      const storedUrl = await loadStoredServerUrl();
      if (epoch !== restoreEpoch.current) return;
      if (!storedUrl) {
        sessionServerUrl = null;
        setServerUrlState(null);
        setStatus("needs-server");
        return;
      }

      sessionServerUrl = storedUrl;
      setServerUrlState(storedUrl);

      const storedSession = await loadStoredSession();
      if (epoch !== restoreEpoch.current) return;
      if (!storedSession) {
        forgetPushToken();
        sessionTokens = null;
        setStatus("logged-out");
        return;
      }

      sessionTokens = storedSession;
      sessionTenantId = await loadStoredTenantId();
      try {
        // A routable-but-unreachable server must not hold the loading screen
        // for the full 20 s request timeout.
        const me = await Promise.race([
          apiClient.getMe(),
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error("restore probe timed out")),
              5_000,
            );
          }),
        ]);
        if (epoch !== restoreEpoch.current) return;
        setUser(me);
        const tenantsResult = await loadTenants();
        if (epoch !== restoreEpoch.current) return;
        if (tenantsResult === "expired") return;
        setStatus("authenticated");
      } catch (error) {
        if (epoch !== restoreEpoch.current) return;
        // Only the API's own verdicts end a session: 401 expired, 400
        // deactivated, 404 deleted user. A WAF 403, a 408 or a 429 from the
        // proxy must leave the session intact and stay retryable.
        if (
          error instanceof ApiError &&
          (error.status === 400 ||
            error.status === 401 ||
            error.status === 404)
        ) {
          apiClient.invalidateSession();
          sessionTokens = null;
          try {
            await clearStoredSession();
          } catch {
            // Storage may be unavailable; still drop the in-memory session
            // instead of looping back to the server screen.
          }
          if (epoch !== restoreEpoch.current) return;
          forgetPushToken();
          setUser(null);
          setTenants([]);
          setActiveTenantId(null);
          setStatus("logged-out");
        } else {
          // A network or server problem must not throw away a valid session.
          setStatus("unreachable");
        }
      }
    } catch {
      if (epoch !== restoreEpoch.current) return;
      setStatus("needs-server");
    }
  }, [loadTenants]);

  useEffect(() => {
    // Session restoration is inherently an async external-system read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
  }, [restore]);

  const login = useCallback(
    async (email: string, password: string) => {
      const generation = ++restoreEpoch.current;
      const me = await apiClient.login(email, password);
      if (generation !== restoreEpoch.current) return;
      setUser(me);
      const tenantsResult = await loadTenants();
      if (generation !== restoreEpoch.current) return;
      if (tenantsResult === "expired") return;
      setStatus("authenticated");
    },
    [loadTenants],
  );

  const logout = useCallback(async () => {
    restoreEpoch.current += 1;
    // Do not let an unreachable push endpoint hold the logout button.
    await Promise.race([
      unregisterPushToken(apiClient),
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
    try {
      await apiClient.logout();
    } finally {
      sessionTenantId = null;
      setUser(null);
      setTenants([]);
      setActiveTenantId(null);
      setNeedsTenantSelection(false);
      setStatus("logged-out");
    }
  }, []);

  const switchTenant = useCallback(async (tenantId: string) => {
    sessionTenantId = tenantId;
    setActiveTenantId(tenantId);
    setNeedsTenantSelection(false);
    await saveStoredTenantId(tenantId);
  }, []);

  const setServerUrl = useCallback(async (input: string) => {
    restoreEpoch.current += 1;
    const normalized = normalizeServerUrl(input);
    if (normalized === sessionServerUrl) {
      setServerUrlState(normalized);
      return;
    }

    // The token belongs to the old server; remove it before the URL changes.
    await unregisterPushToken(apiClient);
    apiClient.invalidateSession();
    // Mutate the in-memory session synchronously before the first await, so
    // an in-flight refresh cannot persist the old server's session after the
    // clear.
    sessionTokens = null;
    sessionTenantId = null;
    sessionServerUrl = normalized;
    setServerUrlState(normalized);
    setUser(null);
    setTenants([]);
    setActiveTenantId(null);
    setNeedsTenantSelection(false);
    setStatus("logged-out");
    await clearStoredSession();
    await clearStoredTenantId();
    await saveStoredServerUrl(normalized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      serverUrl,
      tenants,
      activeTenantId,
      needsTenantSelection,
      api: apiClient,
      login,
      logout,
      switchTenant,
      refreshTenants: loadTenants,
      setServerUrl,
      retry: restore,
    }),
    [
      status,
      user,
      serverUrl,
      tenants,
      activeTenantId,
      needsTenantSelection,
      login,
      logout,
      switchTenant,
      loadTenants,
      setServerUrl,
      restore,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
