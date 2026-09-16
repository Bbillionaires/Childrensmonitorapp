"use client";

import { useEffect, useState } from "react";
import type { ChildProfile } from "@app/types";
import { apiFetch } from "./api";

export function useChildren() {
  const [children, setChildren] = useState<ChildProfile[] | null>(null);

  useEffect(() => {
    void apiFetch<{ children: ChildProfile[] }>("/api/parents/children").then((data) =>
      setChildren(data.children),
    );
  }, []);

  return children;
}
