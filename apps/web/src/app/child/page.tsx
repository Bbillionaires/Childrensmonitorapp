"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChildLibraryResponse, LearningQueueStatus } from "@app/types";
import { apiFetch } from "@/lib/api";

function BigCard({
  href,
  title,
  subtitle,
  emoji,
  thumbnailUrl,
  locked,
}: {
  href: string;
  title: string;
  subtitle?: string;
  emoji: string;
  thumbnailUrl?: string | null;
  locked?: boolean;
}) {
  const card = (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative flex h-28 items-center justify-center bg-slate-100 text-4xl">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          emoji
        )}
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-3xl text-white">
            🔒
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </div>
  );
  if (locked) return card;
  return <Link href={href}>{card}</Link>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

export default function ChildHomePage() {
  const [library, setLibrary] = useState<ChildLibraryResponse | null>(null);
  const [queue, setQueue] = useState<LearningQueueStatus | null>(null);

  useEffect(() => {
    void apiFetch<ChildLibraryResponse>("/api/child/library").then(setLibrary);
    void apiFetch<LearningQueueStatus>("/api/child/learning-queue").then(setQueue);
  }, []);

  if (!library) {
    return <p className="text-center text-sm text-slate-500">Loading your library…</p>;
  }

  const nothingYet = library.videos.length === 0 && library.playlists.length === 0 && library.websites.length === 0;

  if (nothingYet) {
    return (
      <div className="card text-center">
        <p className="text-4xl">📭</p>
        <p className="mt-2 text-sm text-slate-600">Nothing has been approved for you yet. Ask a parent!</p>
      </div>
    );
  }

  const learningDue = Boolean(queue?.enabled && queue.phase === "LEARNING_REQUIRED");
  const funLocked = learningDue && Boolean(queue?.gateEnforced);

  return (
    <div className="space-y-8">
      {queue?.enabled && (
        <div className={`card ${learningDue ? "border-amber-300 bg-amber-50" : "border-emerald-300 bg-emerald-50"}`}>
          {learningDue ? (
            <p className="text-sm font-medium text-amber-800">
              📚 Time for a learning video{funLocked ? " — fun videos are locked until you finish one!" : "."}
            </p>
          ) : (
            <p className="text-sm font-medium text-emerald-800">
              🎉 {queue.funRemainingBeforeLearning} more fun video{queue.funRemainingBeforeLearning === 1 ? "" : "s"}{" "}
              before the next learning video.
            </p>
          )}
        </div>
      )}

      {library.playlists.length > 0 && (
        <Section title="Playlists">
          {library.playlists.map((playlist) => (
            <BigCard
              key={playlist.id}
              href={`/child/playlists/${playlist.id}`}
              title={playlist.title}
              subtitle={`${playlist.approvedItemCount} video${playlist.approvedItemCount === 1 ? "" : "s"}`}
              emoji="📺"
            />
          ))}
        </Section>
      )}

      {queue?.enabled ? (
        <>
          {queue.learningCandidates.length > 0 && (
            <Section title="Learning videos">
              {queue.learningCandidates.map((video) => (
                <BigCard
                  key={video.id}
                  href={`/child/play/${video.id}`}
                  title={video.title}
                  thumbnailUrl={video.thumbnailUrl}
                  emoji="📚"
                />
              ))}
            </Section>
          )}
          {queue.funCandidates.length > 0 && (
            <Section title="Fun videos">
              {queue.funCandidates.map((video) => (
                <BigCard
                  key={video.id}
                  href={`/child/play/${video.id}`}
                  title={video.title}
                  thumbnailUrl={video.thumbnailUrl}
                  emoji="🎬"
                  locked={funLocked}
                />
              ))}
            </Section>
          )}
        </>
      ) : (
        library.videos.length > 0 && (
          <Section title="Watch">
            {library.videos.map((video) => (
              <BigCard
                key={video.id}
                href={`/child/play/${video.id}`}
                title={video.title}
                thumbnailUrl={video.thumbnailUrl}
                emoji="🎬"
              />
            ))}
          </Section>
        )
      )}

      {library.websites.length > 0 && (
        <Section title="Websites">
          {library.websites.map((site) => (
            <BigCard key={site.id} href={`/child/play/${site.id}`} title={site.title} emoji="🌐" />
          ))}
        </Section>
      )}
    </div>
  );
}
