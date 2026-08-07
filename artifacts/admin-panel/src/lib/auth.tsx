import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export const SUPER_ADMIN_USERNAME = "admin";

export interface Admin { id: number; username: string; isSuperAdmin?: boolean; permissions?: string[]; }

interface AuthCtx {
  admin: Admin | null;
  token: string | null;
  login: (token: string, admin: Admin) => void;
  logout: () => void;
  isLoading: boolean;
  isSuperAdmin: boolean;
  hasPermission: (key: string) => boolean;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("shivafer_admin_token");
    const a = localStorage.getItem("shivafer_admin_info");
    if (t && a) {
      try {
        setToken(t);
        setAdmin(JSON.parse(a));
      } catch {}
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      localStorage.removeItem("shivafer_admin_token");
      localStorage.removeItem("shivafer_admin_info");
      setToken(null);
      setAdmin(null);
    }
    window.addEventListener("admin-unauthorized", handleUnauthorized);
    return () => window.removeEventListener("admin-unauthorized", handleUnauthorized);
  }, []);

  function login(t: string, a: Admin) {
    localStorage.setItem("shivafer_admin_token", t);
    localStorage.setItem("shivafer_admin_info", JSON.stringify(a));
    setToken(t);
    setAdmin(a);
  }

  function logout() {
    localStorage.removeItem("shivafer_admin_token");
    localStorage.removeItem("shivafer_admin_info");
    setToken(null);
    setAdmin(null);
  }

  const isSuperAdmin = admin?.username === SUPER_ADMIN_USERNAME || admin?.isSuperAdmin === true;
  const hasPermission = (key: string) => isSuperAdmin || (admin?.permissions ?? []).includes(key);

  return <Ctx.Provider value={{ admin, token, login, logout, isLoading, isSuperAdmin, hasPermission }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
