import React, { createContext, useContext, useState, useEffect } from "react";
import { User, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";

type AuthContextType = {
  token: string | null;
  setToken: (token: string | null) => void;
  user: User | null;
  logout: () => void;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => {
    return localStorage.getItem("shivafer_token");
  });

  const { data: user, isLoading, status } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  // اگه /me با خطا برگشت (توکن قدیمی یا نامعتبر) → خودکار لاگ‌اوت
  useEffect(() => {
    if (status === "error" && token) {
      localStorage.removeItem("shivafer_token");
      setTokenState(null);
    }
  }, [status, token]);

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("shivafer_token", newToken);
    } else {
      localStorage.removeItem("shivafer_token");
    }
    setTokenState(newToken);
  };

  const logout = () => {
    setToken(null);
    // Ask backend to clear the HttpOnly media cookie (JS cannot access httpOnly cookies)
    const apiBase = (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ?? "";
    fetch(`${apiBase}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ token, setToken, user: user ?? null, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
