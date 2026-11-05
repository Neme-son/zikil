"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function UserSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  function applySearch(term: string) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = term.trim();
    if (trimmed) {
      params.set("q", trimmed);
    } else {
      params.delete("q");
    }
    startTransition(() => {
      const qs = params.toString();
      router.push(`/superadmin/users${qs ? `?${qs}` : ""}`);
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    applySearch(query);
  }

  function handleClear() {
    setQuery("");
    applySearch("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="relative flex w-full max-w-sm items-center"
    >
      <label htmlFor="user-search-input" className="sr-only">
        Search users by name or email
      </label>
      <div className="relative w-full">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 1114 0z"
            />
          </svg>
        </div>
        <input
          id="user-search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or email…"
          disabled={isPending}
          className="w-full rounded-lg border border-slate-300 bg-card py-2 pl-9 pr-8 text-sm text-slate-900 placeholder-slate-400 shadow-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
        />
        {query ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-500 hover:text-slate-700 focus:outline-none"
          >
            <span className="text-sm font-bold">✕</span>
          </button>
        ) : null}
      </div>
    </form>
  );
}
