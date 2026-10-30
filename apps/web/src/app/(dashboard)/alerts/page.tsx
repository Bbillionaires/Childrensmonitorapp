"use client";

import { useEffect, useState } from "react";
import type { AlertStatusValue, ParentReportItem, SafetyAlertItem } from "@app/types";
import { apiFetch } from "@/lib/api";
import { ContentCard } from "@/components/content-card";

function AlertCard({ alert, onResolve }: { alert: SafetyAlertItem; onResolve: (resolution: AlertStatusValue) => void }) {
  const [resolving, setResolving] = useState<AlertStatusValue | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function handle(resolution: Extract<AlertStatusValue, "KEPT_APPROVED" | "REMOVED">) {
    setResolving(resolution);
    try {
      onResolve(resolution);
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="card space-y-3">
      <ContentCard content={alert.content} />
      <p className="text-sm text-slate-600">
        <strong>{alert.child.firstName}</strong> currently has this approved, but its Supervision
        Score has changed
        {alert.previousScore && alert.newScore && (
          <>
            : <strong>{alert.previousScore.overallScore}/1000</strong> → <strong>{alert.newScore.overallScore}/1000</strong>{" "}
            ({alert.newScore.riskBand.toLowerCase()} risk).
          </>
        )}
      </p>

      {alert.status === "OPEN" ? (
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={resolving !== null} onClick={() => void handle("KEPT_APPROVED")}>
            {resolving === "KEPT_APPROVED" ? "Keeping…" : "Keep Approved"}
          </button>
          <button className="btn-danger" disabled={resolving !== null} onClick={() => void handle("REMOVED")}>
            {resolving === "REMOVED" ? "Removing…" : "Remove"}
          </button>
          <button className="btn-secondary" onClick={() => setDetailsOpen((v) => !v)}>
            Review Details
          </button>
        </div>
      ) : (
        <p className="text-xs font-medium text-slate-400">
          {alert.status === "KEPT_APPROVED" ? "Kept approved" : "Removed"} on{" "}
          {alert.resolvedAt && new Date(alert.resolvedAt).toLocaleDateString()}
        </p>
      )}

      {detailsOpen && alert.newScore && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Why this score changed</p>
          <p className="mt-1">{alert.newScore.explanation}</p>
        </div>
      )}
    </div>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<SafetyAlertItem[] | null>(null);
  const [reports, setReports] = useState<ParentReportItem[] | null>(null);

  async function loadAlerts() {
    const data = await apiFetch<{ items: SafetyAlertItem[] }>("/api/parents/alerts");
    setAlerts(data.items);
  }

  useEffect(() => {
    void loadAlerts();
    void apiFetch<{ items: ParentReportItem[] }>("/api/parents/reports").then((data) => setReports(data.items));
  }, []);

  async function resolve(alertId: string, resolution: AlertStatusValue) {
    await apiFetch(`/api/parents/alerts/${alertId}/resolve`, { method: "POST", body: { resolution } });
    await loadAlerts();
  }

  const open = alerts?.filter((a) => a.status === "OPEN") ?? [];
  const resolved = alerts?.filter((a) => a.status !== "OPEN") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Safety Alerts</h1>
        <p className="text-sm text-slate-500">
          When previously approved content gets new safety information — its Supervision Score
          changing for the worse — you decide here: keep it approved, remove it, or review what
          changed. Content is never silently removed.
        </p>
      </div>

      {alerts === null && <p className="text-sm text-slate-500">Loading…</p>}

      {alerts !== null && open.length === 0 && (
        <div className="card text-center">
          <p className="text-sm text-slate-600">No open alerts. You&apos;ll see one here if approved content&apos;s score changes for the worse.</p>
        </div>
      )}

      <div className="space-y-3">
        {open.map((alert) => (
          <AlertCard key={alert.id} alert={alert} onResolve={(resolution) => void resolve(alert.id, resolution)} />
        ))}
      </div>

      {resolved.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Resolved alerts ({resolved.length})
          </summary>
          <div className="mt-3 space-y-3">
            {resolved.map((alert) => (
              <AlertCard key={alert.id} alert={alert} onResolve={() => {}} />
            ))}
          </div>
        </details>
      )}

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Your Reports</h2>
        <p className="text-sm text-slate-500">
          Content you&apos;ve reported. Validated reports feed future Supervision Score recalculation.
        </p>
      </div>
      {reports?.length === 0 && <p className="text-sm text-slate-500">You haven&apos;t reported any content.</p>}
      <div className="space-y-2">
        {reports?.map((report) => (
          <div key={report.id} className="card flex items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{report.content.title}</p>
              <p className="text-xs text-slate-500">
                {report.category.replace(/_/g, " ").toLowerCase()}
                {report.details && ` — ${report.details}`}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
              {report.status.toLowerCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
