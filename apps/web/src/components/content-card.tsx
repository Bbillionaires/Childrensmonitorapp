import type { ContentSummary } from "@app/types";
import { SupervisionScoreBadge } from "./supervision-score-badge";
import { ReportContentAction } from "./report-content-action";

function formatDuration(seconds: number | null): string | null {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function ContentCard({
  content,
  actions,
  childId,
}: {
  content: ContentSummary;
  actions?: React.ReactNode;
  childId?: string;
}) {
  const duration = formatDuration(content.durationSeconds);

  return (
    <div className="card flex gap-4">
      <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400">
        {content.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={content.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl">{content.contentType === "WEBSITE" ? "🌐" : "🎬"}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{content.title}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {content.creatorName ?? content.providerId}
          {duration && ` · ${duration}`}
          {content.providerMadeForKids !== null &&
            ` · ${content.providerMadeForKids ? "Marked made for kids" : "Not marked made for kids"}`}
        </p>
        {content.description && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">{content.description}</p>
        )}
        {content.supervisionScore && <SupervisionScoreBadge score={content.supervisionScore} />}
        {actions && <div className="mt-3 flex gap-2">{actions}</div>}
        <ReportContentAction contentId={content.id} childId={childId} />
      </div>
    </div>
  );
}
