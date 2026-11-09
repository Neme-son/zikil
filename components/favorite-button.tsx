"use client";

import { useState, useTransition } from "react";
import { toggleFavoriteAction } from "@/app/actions/favorites";

export function FavoriteButton({ bugId, initialFavorited }: { bugId: string; initialFavorited: boolean }) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const prev = favorited;
    setFavorited(!favorited);
    startTransition(async () => {
      const result = await toggleFavoriteAction(bugId);
      if (result.error) {
        setFavorited(prev);
      } else if (result.favorited !== undefined) {
        setFavorited(result.favorited);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorited}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zk-border bg-zk-surface text-zk-text transition hover:bg-zk-chip focus:outline-none focus:ring-2 focus:ring-zk-accent disabled:opacity-50"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill={favorited ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
