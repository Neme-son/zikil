"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveIssueStatusAction } from "@/app/actions/issues";
import { IssuePriorityBadge } from "@/components/issue-priority-badge";

const COLUMNS = [
  { key: "open", label: "Open", color: "bg-zk-chip" },
  { key: "in_progress", label: "In Progress", color: "bg-zk-tint" },
  { key: "done", label: "Done", color: "bg-zk-ok-bg" },
  { key: "merge", label: "Merge", color: "bg-zk-warn-bg" },
  { key: "resolved", label: "Resolved", color: "bg-zk-ok-bg" },
  { key: "closed", label: "Closed", color: "bg-zk-chip" },
] as const;

export type KanbanIssue = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string | null;
  assigneeName: string | null;
  typeName: string | null;
};

type Props = {
  projectId: string;
  issues: KanbanIssue[];
};

export function KanbanBoard({ projectId, issues }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<KanbanIssue[]>(issues);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byStatus = (status: string) => items.filter((i) => i.status === status);

  const handleDragStart = (id: string) => setDragging(id);
  const handleDragEnd = () => setDragging(null);

  const handleDrop = (status: string) => {
    if (!dragging) return;
    const issue = items.find((i) => i.id === dragging);
    if (!issue || issue.status === status) { setDragging(null); return; }

    // Optimistic update.
    setItems((prev) => prev.map((i) => (i.id === dragging ? { ...i, status } : i)));
    setError(null);

    startTransition(async () => {
      const result = await moveIssueStatusAction(dragging, status);
      if (result.error) {
        // Revert on failure.
        setItems((prev) => prev.map((i) => (i.id === dragging ? { ...i, status: issue.status } : i)));
        setError(result.error);
      } else {
        router.refresh();
      }
    });
    setDragging(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <p role="alert" className="m-0 text-sm text-zk-bad-fg">{error}</p> : null}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.key)}
            className={`flex min-w-[260px] flex-1 flex-col gap-2 rounded-[16px] border border-zk-border ${col.color} p-3`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zk-text">{col.label}</h3>
              <span className="rounded-full bg-zk-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-zk-muted">
                {byStatus(col.key).length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {byStatus(col.key).map((issue) => (
                <div
                  key={issue.id}
                  draggable
                  onDragStart={() => handleDragStart(issue.id)}
                  onDragEnd={handleDragEnd}
                  className={`cursor-grab rounded-[12px] border border-zk-border bg-zk-surface p-3 shadow-sm transition hover:shadow-md ${dragging === issue.id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold tabular-nums text-zk-muted">#{issue.number}</span>
                    <IssuePriorityBadge priority={issue.priority} />
                  </div>
                  <p className="m-0 mt-1 text-sm font-semibold text-zk-text line-clamp-2">{issue.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1 text-xs text-zk-muted">
                    {issue.typeName ? <span className="rounded bg-zk-chip px-1.5 py-0.5">{issue.typeName}</span> : null}
                    {issue.assigneeName ? <span>{issue.assigneeName}</span> : null}
                  </div>
                </div>
              ))}
              {byStatus(col.key).length === 0 ? (
                <p className="m-0 py-4 text-center text-xs text-zk-muted">Drop here</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {pending ? <p className="m-0 text-xs text-zk-muted">Updating…</p> : null}
    </div>
  );
}
