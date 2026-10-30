"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChildLibraryResponse } from "@app/types";
import { apiFetch } from "@/lib/api";
import { useTvAutoFocus } from "@/lib/tv-nav";

function TvCard({
  href,
  title,
  subtitle,
  emoji,
  thumbnailUrl,
}: {
  href: string;
  title: string;
  subtitle?: string;
  emoji: string;
  thumbnailUrl?: string | null;
}) {
  return (
    <Link
      href={href}
      data-tv-focusable
      className="flex flex-col overflow-hidden rounded-2xl border-4 border-transparent bg-slate-900 shadow-lg transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-400/40"
    >
      <div className="flex h-40 items-center justify-center bg-slate-800 text-6xl">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          emoji
        )}
      </div>
      <div className="p-4">
        <p className="line-clamp-2 text-xl font-semibold text-white">{title}</p>
        {subtitle && <p className="mt-1 text-base text-slate-400">{subtitle}</p>}
      </div>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-bold text-white">{title}</h2>
      <div className="grid grid-cols-4 gap-6">{children}</div>
    </section>
  );
}

export default function TvHomePage() {
  const [library, setLibrary] = useState<ChildLibraryResponse | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void apiFetch<ChildLibraryResponse>("/api/child/library").then(setLibrary);
  }, []);

  useTvAutoFocus(contentRef, [library]);

  if (!library) {
    return <p className="text-xl text-slate-400">Loading your library…</p>;
  }

  const nothingYet = library.videos.length === 0 && library.playlists.length === 0 && library.websites.length === 0;

  if (nothingYet) {
    return (
      <div className="rounded-3xl bg-slate-900 p-12 text-center">
        <p className="text-5xl">📭</p>
        <p className="mt-4 text-xl text-slate-300">Nothing has been approved for you yet. Ask a parent!</p>
      </div>
    );
  }

  return (
    <div ref={contentRef} className="space-y-10">
      {library.playlists.length > 0 && (
        <Section title="Playlists">
          {library.playlists.map((playlist) => (
            <TvCard
              key={playlist.id}
              href={`/tv/playlists/${playlist.id}`}
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
            <TvCard
              key={video.id}
              href={`/tv/play/${video.id}`}
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
            <TvCard key={site.id} href={`/tv/play/${site.id}`} title={site.title} emoji="🌐" />
          ))}
        </Section>
      )}
    </div>
  );
}
