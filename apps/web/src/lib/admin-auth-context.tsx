"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AdminProfile } from "@app/types";
import { ApiError, apiFetch } from "./api";

interface AdminAuthContextValue {
  admin: AdminProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const profile = await apiFetch<AdminProfile>("/api/admin/me");
      setAdmin(profile);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        setAdmin(null);
      } else {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/admin/logout", { method: "POST" });
    setAdmin(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AdminAuthContext.Provider value={{ admin, loading, refresh, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error("useAdminAuth must be used within an AdminAuthProvider");
  return context;
}
