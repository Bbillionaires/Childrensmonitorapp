"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { ChildPublicProfile } from "@app/types";
import { ApiError, apiFetch } from "./api";

interface ChildSessionContextValue {
  child: ChildPublicProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ChildSessionContext = createContext<ChildSessionContextValue | undefined>(undefined);

export function ChildSessionProvider({ children }: { children: ReactNode }) {
  const [child, setChild] = useState<ChildPublicProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const profile = await apiFetch<ChildPublicProfile>("/api/child/profile");
      setChild(profile);
    } catch (error) {
      if (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 404)) {
        setChild(null);
      } else {
        throw error;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <ChildSessionContext.Provider value={{ child, loading, refresh }}>{children}</ChildSessionContext.Provider>
  );
}

export function useChildSession(): ChildSessionContextValue {
  const context = useContext(ChildSessionContext);
  if (!context) throw new Error("useChildSession must be used within a ChildSessionProvider");
  return context;
}
