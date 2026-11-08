"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api";
import {
  DEMO_AVAILABLE,
  DEMO_USER,
  disableDemo,
  enableDemo,
  isDemoActive,
} from "@/lib/demo";

interface AuthContextType {
  username: string | null;
  isLoading: boolean;
  demo: boolean;
  demoAvailable: boolean;
  login: (username: string, token: string) => void;
  logout: () => void;
  enterDemo: () => void;
  exitDemo: () => void;
}

const AuthContext = createContext<AuthContextType>({
  username: null,
  isLoading: true,
  demo: false,
  demoAvailable: DEMO_AVAILABLE,
  login: () => {},
  logout: () => {},
  enterDemo: () => {},
  exitDemo: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
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

    const storedToken = localStorage.getItem("access_token");

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    // Validate token by fetching the current user.
    api
      .getMe()
      .then((me) => {
        setUsername(me.full_name || me.email);
      })
      .catch(() => {
        localStorage.removeItem("access_token");
        setUsername(null);
      })
      .finally(() => setIsLoading(false));
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

  function login(name: string, token: string) {
    localStorage.setItem("access_token", token);
    setUsername(name);
  }

  function logout() {
    localStorage.removeItem("access_token");
    if (demo) {
      disableDemo();
      setDemo(false);
    }
    setUsername(null);
    router.push("/");
  }

  function enterDemo() {
    if (!DEMO_AVAILABLE) return;
    enableDemo();
    localStorage.removeItem("access_token");
    setDemo(true);
    setUsername(DEMO_USER.full_name ?? DEMO_USER.email);
    setIsLoading(false);
    router.push("/dashboard");
  }

  function exitDemo() {
    if (!DEMO_AVAILABLE) return;
    disableDemo();
    localStorage.removeItem("access_token");
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
