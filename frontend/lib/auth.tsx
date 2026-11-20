"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  api,
  ApiError,
  clearTokens,
  getActiveTenantId,
  hasStoredSession,
  SESSION_EXPIRED_EVENT,
  setActiveTenantId,
  type TenantMembership,
} from "@/lib/api";
import {
  DEMO_AVAILABLE,
  DEMO_USER,
  disableDemo,
  enableDemo,
  isDemoActive,
} from "@/lib/demo";
import { toast } from "@/lib/toast";

interface AuthContextType {
  username: string | null;
  isLoading: boolean;
  demo: boolean;
  demoAvailable: boolean;
  tenants: TenantMembership[];
  activeTenantId: string | null;
  tenantReady: boolean;
  login: (username: string) => void;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string) => void;
  enterDemo: () => void;
  exitDemo: () => void;
}

const AuthContext = createContext<AuthContextType>({
  username: null,
  isLoading: true,
  demo: false,
  demoAvailable: DEMO_AVAILABLE,
  tenants: [],
  activeTenantId: null,
  tenantReady: true,
  login: () => {},
  logout: async () => {},
  switchTenant: () => {},
  enterDemo: () => {},
  exitDemo: () => {},
});

const USERNAME_KEY = "opd-username";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(USERNAME_KEY);
  });
  const [demo, setDemo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(
    () => {
      if (typeof window === "undefined") return null;
      return getActiveTenantId();
    },
  );
  const [tenantReady, setTenantReady] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const applyTenants = useCallback((list: TenantMembership[]) => {
    setTenants(list);
    const stored = getActiveTenantId();
    const active =
      list.find((tenant) => tenant.id === stored && tenant.is_active) ??
      list.find((tenant) => tenant.is_active) ??
      list[0] ??
      null;
    setActiveTenantId(active?.id ?? null);
    setActiveTenantIdState(active?.id ?? null);
    setTenantReady(true);
  }, []);

  const loadTenants = useCallback(async () => {
    try {
      const response = await api.getMeTenants();
      applyTenants(response.data);
    } catch {
      // A failed tenant lookup must not block the dashboard. Single-tenant
      // installs still work because the API falls back to the only
      // membership; data requests will surface a real error if not.
      setTenantReady(true);
    }
  }, [applyTenants]);

  useEffect(() => {
    // Demo mode skips the whole login/setup flow. `isDemoActive` is the source
    // of truth so opting out in one tab survives reloads.
    if (DEMO_AVAILABLE && isDemoActive()) {
      setDemo(true);
      setUsername(DEMO_USER.full_name ?? DEMO_USER.email);
      setTenantReady(true);
      setIsLoading(false);
      return;
    }

    if (!hasStoredSession()) {
      window.localStorage.removeItem(USERNAME_KEY);
      setUsername(null);
      setTenantReady(true);
      setIsLoading(false);
      return;
    }

    // Validate the stored session. The API layer refreshes the access token
    // automatically when it has expired.
    api
      .getMe()
      .then(async (me) => {
        const name = me.full_name || me.email;
        window.localStorage.setItem(USERNAME_KEY, name);
        setUsername(name);
        await loadTenants();
      })
      .catch((error) => {
        // A 401/403 means the session is really gone. A transport error or a
        // 5xx is not a logout: keep the tokens and the cached name so the
        // layout does not redirect to the login screen.
        if (
          error instanceof ApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          clearTokens();
          window.localStorage.removeItem(USERNAME_KEY);
          setUsername(null);
          setActiveTenantId(null);
          setActiveTenantIdState(null);
          setTenants([]);
        }
        setTenantReady(true);
      })
      .finally(() => setIsLoading(false));
  }, [loadTenants]);

  useEffect(() => {
    function handleSessionExpired() {
      window.localStorage.removeItem(USERNAME_KEY);
      setUsername(null);
      setTenants([]);
      setActiveTenantId(null);
      setActiveTenantIdState(null);
      setTenantReady(true);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const isPublicRoute =
      pathname === "/" ||
      pathname.startsWith("/setup") ||
      pathname.startsWith("/recover-password") ||
      pathname.startsWith("/reset-password");
    if (!username && !isPublicRoute) {
      router.push("/");
    }
  }, [username, isLoading, pathname, router]);

  function login(name: string) {
    window.localStorage.setItem(USERNAME_KEY, name);
    setUsername(name);
    setTenantReady(false);
    void loadTenants();
  }

  function switchTenant(tenantId: string) {
    if (!tenantId || tenantId === activeTenantId) return;
    setActiveTenantId(tenantId);
    setActiveTenantIdState(tenantId);
    // Every page holds data for the previous tenant. A reload is the simplest
    // way to drop all caches and refetch with the new header.
    window.location.reload();
  }

  async function logout() {
    const revoked = await api.logout();
    clearTokens();
    if (demo) {
      disableDemo();
      setDemo(false);
    }
    window.localStorage.removeItem(USERNAME_KEY);
    setUsername(null);
    setTenants([]);
    setActiveTenantId(null);
    setActiveTenantIdState(null);
    setTenantReady(true);
    if (!revoked) {
      toast.error(
        "Signed out locally, but the server could not be reached. The old session may still be valid.",
      );
    }
    router.push("/");
  }

  function enterDemo() {
    if (!DEMO_AVAILABLE) return;
    // Best effort: do not leave a real session behind when switching to demo.
    void api.logout();
    enableDemo();
    clearTokens();
    setDemo(true);
    setUsername(DEMO_USER.full_name ?? DEMO_USER.email);
    setTenants([]);
    setActiveTenantIdState(null);
    setTenantReady(true);
    setIsLoading(false);
    router.push("/dashboard");
  }

  function exitDemo() {
    if (!DEMO_AVAILABLE) return;
    disableDemo();
    clearTokens();
    setDemo(false);
    setUsername(null);
    setTenants([]);
    setActiveTenantIdState(null);
    setTenantReady(false);
    router.push("/");
  }

  return (
    <AuthContext.Provider
      value={{
        username,
        isLoading,
        demo,
        demoAvailable: DEMO_AVAILABLE,
        tenants,
        activeTenantId,
        tenantReady,
        login,
        logout,
        switchTenant,
        enterDemo,
        exitDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
