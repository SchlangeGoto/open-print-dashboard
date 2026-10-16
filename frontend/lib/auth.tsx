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

interface AuthContextType {
  username: string | null;
  isLoading: boolean;
  login: (username: string, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  username: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
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
    setUsername(null);
    router.push("/");
  }

  return (
    <AuthContext.Provider value={{ username, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
