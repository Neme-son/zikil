"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useProjectRef } from "@/lib/use-project-ref";
import { issuesPath } from "@/lib/project-paths";
import { newIssueHref } from "@/lib/reported-from";

type Command = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  run: () => void;
};

function match(cmd: Command, query: string): boolean {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  const haystack = `${cmd.label} ${cmd.hint ?? ""} ${cmd.keywords ?? ""}`.toLowerCase();
  return haystack.includes(needle);
}

function groupCommands(commands: Command[]): { group: string; items: Command[] }[] {
  const groups: { group: string; items: Command[] }[] = [];
  const index = new Map<string, number>();
  for (const cmd of commands) {
    let i = index.get(cmd.group);
    if (i === undefined) {
      i = groups.length;
      index.set(cmd.group, i);
      groups.push({ group: cmd.group, items: [] });
    }
    groups[i].items.push(cmd);
  }
  return groups;
}

export function CommandPalette() {
  const router = useRouter();
  const slug = useProjectRef();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const nav = (href: string) => () => router.push(href);
    const list: Command[] = [
      { id: "go-issues", group: "Navigation", label: "Go to issues", hint: "Issues list", keywords: "issues bugs list", run: nav(slug ? issuesPath(slug) : "/") },
      { id: "go-notifications", group: "Navigation", label: "Go to notifications", hint: "Inbox", keywords: "notifications inbox", run: nav("/inbox") },
      { id: "new-issue", group: "Actions", label: "Report a new issue", hint: "Create", keywords: "new issue report create", run: () => router.push(slug ? newIssueHref(slug) : "/") },
      { id: "show-help", group: "Actions", label: "Show keyboard shortcuts", hint: "?", keywords: "help shortcuts keys", run: () => window.dispatchEvent(new CustomEvent("ziki:show-shortcuts")) },
      { id: "go-home", group: "Navigation", label: "Go to overview", hint: "Home", keywords: "home overview dashboard", run: nav(slug ? `/${slug}` : "/") },
    ];
    return list;
  }, [router, slug]);

  const filtered = useMemo(() => commands.filter((c) => match(c, query)), [commands, query]);
  const grouped = useMemo(() => groupCommands(filtered), [filtered]);

  // Flatten for index navigation.
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => {
    if (open) {
      if (dialogRef.current && typeof dialogRef.current.showModal === "function") {
        dialogRef.current.showModal();
      }
      // Focus the input after the dialog is shown.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setActiveIndex(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const execute = useCallback(
    (cmd: Command) => {
      close();
      // Defer so the dialog closes before navigation.
      requestAnimationFrame(() => cmd.run());
    },
    [close],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const cmd = flat[activeIndex];
      if (cmd) execute(cmd);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="command-palette-title"
      className="fixed inset-0 z-50 m-auto w-full max-w-xl rounded-2xl border border-zk-border bg-zk-surface p-0 shadow-2xl backdrop:bg-black/40"
      onClose={close}
    >
      <div className="flex flex-col">
        <div className="border-b border-zk-border px-4 py-3">
          <input
            ref={inputRef}
            id="command-palette-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search…"
            aria-label="Command palette search"
            className="w-full bg-transparent text-sm text-zk-text placeholder:text-zk-muted focus:outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {flat.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-zk-muted">No matching commands.</p>
          ) : (
            grouped.map((g) => (
              <div key={g.group} className="mb-2">
                <p className="px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-zk-muted">
                  {g.group}
                </p>
                <ul role="listbox" aria-label={g.group}>
                  {g.items.map((cmd) => {
                    const idx = flat.indexOf(cmd);
                    const active = idx === activeIndex;
                    return (
                      <li key={cmd.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => execute(cmd)}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                            active ? "bg-zk-tint text-zk-accent" : "text-zk-text hover:bg-zk-chip"
                          }`}
                        >
                          <span>{cmd.label}</span>
                          {cmd.hint ? (
                            <span className="text-xs text-zk-muted">{cmd.hint}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
        <div className="border-t border-zk-border px-4 py-2 text-[11px] text-zk-muted">
          ↑↓ navigate · Enter run · Esc close
        </div>
      </div>
    </dialog>
  );
}