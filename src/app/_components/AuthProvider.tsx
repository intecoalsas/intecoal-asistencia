// src/app/_components/AuthProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface AuthUser {
  id: string;
  name: string;
  role: string; // "ADMIN" | "EMPLEADO" | "SUPERVISOR" | "KIOSCO"
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  /** Refresh auth state (e.g. after login / logout) */
  refresh: () => void;
  /** Logout current user */
  logout: () => Promise<void>;
}


const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  refresh: () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
      if (res.status === 401) {
        setUser(null);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error fetching auth");
        setUser(null);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setUser({ id: data.id, name: data.name, role: data.role });
    } catch (e) {
      setError((e as Error).message);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  // initial load
  useEffect(() => {
    fetchAuth();
  }, []);

  const refresh = () => {
    fetchAuth();
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch (e) {
      console.error("Logout error", e);
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
};




