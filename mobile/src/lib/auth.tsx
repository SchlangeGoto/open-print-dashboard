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
  loadStoredServerUrl,
  loadStoredSession,
  saveStoredServerUrl,
  saveStoredSession,
} from "./storage";
import type { UserPublic } from "./types";

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
let sessionExpiredHandler: (() => void) | null = null;

const apiClient = new ApiClient({
  getServerUrl: () => sessionServerUrl,
  getTokens: () => sessionTokens,
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
});

interface AuthContextValue {
  status: AuthStatus;
  user: UserPublic | null;
  serverUrl: string | null;
  api: ApiClient;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setServerUrl: (url: string) => Promise<void>;
  retry: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<UserPublic | null>(null);
  const [serverUrl, setServerUrlState] = useState<string | null>(null);
  const restoreEpoch = useRef(0);

  useEffect(() => {
    sessionExpiredHandler = () => {
      sessionTokens = null;
      setUser(null);
      setStatus("logged-out");
    };
    return () => {
      sessionExpiredHandler = null;
    };
  }, []);

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
  }, []);

  useEffect(() => {
    // Session restoration is inherently an async external-system read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
  }, [restore]);

  const login = useCallback(async (email: string, password: string) => {
    restoreEpoch.current += 1;
    const me = await apiClient.login(email, password);
    setUser(me);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    restoreEpoch.current += 1;
    try {
      await apiClient.logout();
    } finally {
      setUser(null);
      setStatus("logged-out");
    }
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
    sessionServerUrl = normalized;
    setServerUrlState(normalized);
    setUser(null);
    setStatus("logged-out");
    await clearStoredSession();
    await saveStoredServerUrl(normalized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      serverUrl,
      api: apiClient,
      login,
      logout,
      setServerUrl,
      retry: restore,
    }),
    [status, user, serverUrl, login, logout, setServerUrl, restore],
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
