"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChildLibraryResponse } from "@app/types";
import { apiFetch } from "@/lib/api";

function BigCard({ href, title, subtitle, emoji, thumbnailUrl }: { href: string; title: string; subtitle?: string; emoji: string; thumbnailUrl?: string | null }) {
  return (
    <Link
      href={href}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex h-28 items-center justify-center bg-slate-100 text-4xl">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          emoji
        )}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
    </Link>
  );
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

  useEffect(() => {
    void apiFetch<ChildLibraryResponse>("/api/child/library").then(setLibrary);
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

  return (
    <div className="space-y-8">
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

      {library.videos.length > 0 && (
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
