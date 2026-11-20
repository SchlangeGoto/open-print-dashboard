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
  refreshTenants: () => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  retry: () => Promise<void>;
}

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
    setNeedsTenantSelection(only.length > 1);
    await clearStoredTenantId();
  }, []);

  const loadTenants = useCallback(async () => {
    try {
      const list = await apiClient.getMeTenants();
      await applyTenants(list);
    } catch {
      // A tenant lookup must not end the session. Single-tenant installs fall
      // back to the only membership server-side.
      setTenants([]);
      setActiveTenantId(sessionTenantId);
    }
  }, [applyTenants]);

  useEffect(() => {
    sessionExpiredHandler = () => {
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
      sessionTenantId = null;
      setActiveTenantId(null);
      setNeedsTenantSelection(true);
      void clearStoredTenantId();
      void apiClient
        .getMeTenants()
        .then(applyTenants)
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
        await loadTenants();
        if (epoch !== restoreEpoch.current) return;
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
      restoreEpoch.current += 1;
      const me = await apiClient.login(email, password);
      setUser(me);
      await loadTenants();
      setStatus("authenticated");
    },
    [loadTenants],
  );

  const logout = useCallback(async () => {
    restoreEpoch.current += 1;
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
