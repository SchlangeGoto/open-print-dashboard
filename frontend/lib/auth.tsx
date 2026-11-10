"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  api,
  ApiError,
  clearTokens,
  hasStoredSession,
  SESSION_EXPIRED_EVENT,
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
  login: (username: string) => void;
  logout: () => Promise<void>;
  enterDemo: () => void;
  exitDemo: () => void;
}

const AuthContext = createContext<AuthContextType>({
  username: null,
  isLoading: true,
  demo: false,
  demoAvailable: DEMO_AVAILABLE,
  login: () => {},
  logout: async () => {},
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
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Demo mode skips the whole login/setup flow. `isDemoActive` is the source
    // of truth so opting out in one tab survives reloads.
    if (DEMO_AVAILABLE && isDemoActive()) {
      setDemo(true);
      setUsername(DEMO_USER.full_name ?? DEMO_USER.email);
      setIsLoading(false);
      return;
    }

    if (!hasStoredSession()) {
      window.localStorage.removeItem(USERNAME_KEY);
      setUsername(null);
      setIsLoading(false);
      return;
    }

    // Validate the stored session. The API layer refreshes the access token
    // automatically when it has expired.
    api
      .getMe()
      .then((me) => {
        const name = me.full_name || me.email;
        window.localStorage.setItem(USERNAME_KEY, name);
        setUsername(name);
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
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      window.localStorage.removeItem(USERNAME_KEY);
      setUsername(null);
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
    setIsLoading(false);
    router.push("/dashboard");
  }

  function exitDemo() {
    if (!DEMO_AVAILABLE) return;
    disableDemo();
    clearTokens();
    setDemo(false);
    setUsername(null);
    router.push("/");
  }

  return (
    <AuthContext.Provider
      value={{
        username,
        isLoading,
        demo,
        demoAvailable: DEMO_AVAILABLE,
        login,
        logout,
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
