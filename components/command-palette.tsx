"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { workersHref } from "@/app/(app)/workers/href";
import { OPEN_PALETTE_EVENT, SHOW_SHORTCUTS_EVENT } from "@/lib/keyboard-shortcuts";
import { ideasPath, issuesPath, newIssuePath, projectPath } from "@/lib/project-paths";
import { useTheme } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";

type Command = {
  id: string;
  label: string;
  keywords: string;
  group: "Go to" | "Actions";
  run: () => void;
};

/** Whether a system theme is currently dark; false until hydration, matching the server paint. */
function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setPrefersDark(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return prefersDark;
}

function matches(query: string, command: Command): boolean {
  const haystack = `${command.label} ${command.keywords}`.toLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
}

/**
 * Ctrl/Cmd+K command palette, mounted once in the app shell (#palette). The
 * shortcut provider dispatches OPEN_PALETTE_EVENT; this overlay lists pages,
 * actions and an issue search. While open it swallows every key so the global
 * shortcuts never fire under it.
 */
export function CommandPalette({ slug }: { slug: string | null }) {
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const prefersDark = usePrefersDark();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<Element | null>(null);

  useEffect(() => {
    const onOpen = () => {
      lastFocused.current = document.activeElement;
      setQuery("");
      setActiveIndex(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (lastFocused.current instanceof HTMLElement) {
      lastFocused.current.focus();
    }
  }, [open]);

  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  const themeNext: Theme = isDark ? "light" : "dark";

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [];
    if (slug) {
      nav.push(
        { id: "app", label: "Your app", keywords: "home overview project", group: "Go to", run: () => router.push(projectPath(slug)) },
        { id: "issues", label: "Issues", keywords: "all tickets list", group: "Go to", run: () => router.push(issuesPath(slug, "all")) },
        { id: "ideas", label: "Ideas", keywords: "suggestions drafts", group: "Go to", run: () => router.push(ideasPath(slug)) },
        { id: "notes", label: "Notes", keywords: "project notes", group: "Go to", run: () => router.push(projectPath(slug, "/notes")) },
      );
    }
    nav.push(
      { id: "inbox", label: "Inbox", keywords: "notifications escalations", group: "Go to", run: () => router.push("/inbox") },
      { id: "ranking", label: "Ranking", keywords: "leaderboard team workers", group: "Go to", run: () => router.push(workersHref()) },
      { id: "agents", label: "Agents", keywords: "manage agents garden", group: "Go to", run: () => router.push("/agents") },
      { id: "activity", label: "Activity", keywords: "audit log history", group: "Go to", run: () => router.push("/activity") },
      { id: "settings", label: "Settings", keywords: "preferences profile security team", group: "Go to", run: () => router.push("/settings") },
      { id: "docs", label: "Docs", keywords: "documentation api reference", group: "Go to", run: () => router.push("/docs") },
    );
    const actions: Command[] = [
      {
        id: "theme",
        label: isDark ? "Switch to light mode" : "Switch to dark mode",
        keywords: "theme appearance dark light",
        group: "Actions",
        run: () => setTheme(themeNext),
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        keywords: "cheat sheet help keys",
        group: "Actions",
        run: () => window.dispatchEvent(new Event(SHOW_SHORTCUTS_EVENT)),
      },
    ];
    if (slug) {
      actions.unshift({
        id: "new-issue",
        label: "New issue",
        keywords: "report create bug",
        group: "Actions",
        run: () => router.push(newIssuePath(slug)),
      });
    }
    return [...nav, ...actions];
  }, [slug, router, isDark, themeNext, setTheme]);

  const trimmed = query.trim();
  const visible = useMemo(() => {
    const filtered = trimmed ? commands.filter((c) => matches(trimmed.toLowerCase(), c)) : commands;
    if (!trimmed || !slug) return filtered;
    const searchCommand: Command = {
      id: "search-issues",
      label: `Search issues for “${trimmed}”`,
      keywords: trimmed,
      group: "Go to",
      run: () => router.push(issuesPath(slug, "all", new URLSearchParams({ q: trimmed }))),
    };
    return [searchCommand, ...filtered];
  }, [commands, trimmed, slug, router]);

  const run = (command: Command) => {
    command.run();
    setOpen(false);
  };

  const focusOption = (index: number) => {
    const option = document.getElementById(`palette-cmd-${visible[index]?.id}`);
    if (option instanceof HTMLElement) option.focus();
  };

  // Every key while the palette is open belongs to it: stopPropagation keeps
  // the global shortcut listener from acting on the buttons' focus.
  const onOverlayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visible.length === 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(visible.length - 1, Math.max(0, activeIndex + direction));
      setActiveIndex(next);
      focusOption(next);
      return;
    }
    if (event.key === "Enter" && visible.length > 0) {
      event.preventDefault();
      run(visible[activeIndex]);
    }
  };

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
      onKeyDown={onOverlayKeyDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-zk-border bg-zk-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-zk-border px-4">
          <svg className="h-4 w-4 shrink-0 text-zk-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Jump to a page or search issues…"
            aria-label="Search commands"
            className="h-12 w-full bg-transparent text-sm text-zk-text outline-none placeholder:text-zk-muted"
          />
          <kbd className="shrink-0 rounded border border-zk-border bg-zk-chip px-1.5 py-0.5 font-mono text-[10px] text-zk-muted">
            Esc
          </kbd>
        </div>
        <div className="max-h-[min(24rem,55vh)] overflow-y-auto p-2">
          {visible.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zk-muted">No matching commands</p>
          ) : null}
          {visible.map((command, index) => {
            const showHeader = index === 0 || visible[index - 1].group !== command.group;
            return (
              <div key={command.id}>
                {showHeader ? (
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-zk-muted">
                    {command.group}
                  </p>
                ) : null}
                <button
                  id={`palette-cmd-${command.id}`}
                  type="button"
                  onClick={() => run(command)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-zk-text outline-none ${
                    index === activeIndex ? "bg-zk-chip" : ""
                  }`}
                >
                  <span>{command.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
