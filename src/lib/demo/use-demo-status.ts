"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/permissions";

export type DemoStatus = {
  configured: boolean;
  isDemo: boolean;
  businessId: string | null;
  businessName: string | null;
  role: Role | null;
  canReset: boolean;
  lastResetAt: string | null;
  unavailableReason: string | null;
};

const initialStatus: DemoStatus = {
  configured: false,
  isDemo: false,
  businessId: null,
  businessName: null,
  role: null,
  canReset: false,
  lastResetAt: null,
  unavailableReason: null,
};

export function useDemoStatus() {
  const [status, setStatus] = useState<DemoStatus>(initialStatus);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/demo/status", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        setStatus(initialStatus);
        return;
      }

      const payload = (await response.json()) as Partial<DemoStatus>;
      setStatus({ ...initialStatus, ...payload });
    } catch {
      setStatus(initialStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (active) void load();
    });

    return () => {
      active = false;
    };
  }, [load]);

  return { status, loading, refresh: load };
}
