import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
    try {
      const storedUrl = await loadStoredServerUrl();
      if (!storedUrl) {
        sessionServerUrl = null;
        setServerUrlState(null);
        setStatus("needs-server");
        return;
      }

      sessionServerUrl = storedUrl;
      setServerUrlState(storedUrl);

      const storedSession = await loadStoredSession();
      if (!storedSession) {
        sessionTokens = null;
        setStatus("logged-out");
        return;
      }

      sessionTokens = storedSession;
      try {
        const me = await apiClient.getMe();
        setUser(me);
        setStatus("authenticated");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          sessionTokens = null;
          await clearStoredSession();
          setUser(null);
          setStatus("logged-out");
        } else {
          // A network or server problem must not throw away a valid session.
          setStatus("unreachable");
        }
      }
    } catch {
      setStatus("needs-server");
    }
  }, []);

  useEffect(() => {
    // Session restoration is inherently an async external-system read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void restore();
  }, [restore]);

  const login = useCallback(async (email: string, password: string) => {
    const me = await apiClient.login(email, password);
    setUser(me);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } finally {
      setUser(null);
      setStatus("logged-out");
    }
  }, []);

  const setServerUrl = useCallback(async (input: string) => {
    const normalized = normalizeServerUrl(input);
    if (normalized === sessionServerUrl) {
      setServerUrlState(normalized);
      return;
    }

    await clearStoredSession();
    sessionTokens = null;
    sessionServerUrl = normalized;
    setServerUrlState(normalized);
    await saveStoredServerUrl(normalized);
    setUser(null);
    setStatus("logged-out");
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
