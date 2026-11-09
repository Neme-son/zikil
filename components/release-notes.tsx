"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createReleaseAction, publishReleaseAction, deleteReleaseAction } from "@/app/actions/releases";

export type ReleaseView = {
  id: string;
  title: string;
  tag: string | null;
  status: string;
  body: string | null;
  createdAt: string;
  publishedAt: string | null;
  issueCount: number;
};

type Props = {
  projectId: string;
  releases: ReleaseView[];
};

export function ReleaseNotes({ projectId, releases }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createReleaseAction(projectId, title);
      if (result.error) { setError(result.error); return; }
      setTitle("");
      router.refresh();
    });
  };

  const publish = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await publishReleaseAction(id);
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  };

  const remove = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteReleaseAction(id);
      if (result.error) { setError(result.error); return; }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Release title (e.g. v1.2.0)"
          className="flex-1 rounded-lg border border-zk-border bg-zk-bg px-3 py-2 text-sm text-zk-text placeholder:text-zk-muted focus:outline-none focus:ring-2 focus:ring-zk-accent"
        />
        <button
          type="button"
          disabled={pending || !title.trim()}
          onClick={create}
          className="rounded-lg border border-zk-border px-3 py-2 text-sm font-semibold text-zk-text disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create release from resolved issues"}
        </button>
      </div>

      {error ? <p role="alert" className="m-0 text-sm text-zk-bad-fg">{error}</p> : null}

      {releases.length === 0 ? (
        <p className="m-0 text-sm text-zk-muted">No releases yet. Resolved issues will be collected automatically.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {releases.map((release) => (
            <li key={release.id} className="rounded-[14px] border border-zk-border bg-zk-bg p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-zk-text">{release.title}</span>
                  {release.tag ? <span className="ml-2 text-xs text-zk-muted">{release.tag}</span> : null}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${release.status === "published" ? "bg-zk-ok-bg text-zk-ok-fg" : "bg-zk-chip text-zk-muted"}`}>
                    {release.status}
                  </span>
                  <span className="ml-2 text-xs text-zk-muted">{release.issueCount} issue(s)</span>
                </div>
                <div className="flex gap-2">
                  {release.status === "draft" ? (
                    <>
                      <button type="button" disabled={pending} onClick={() => publish(release.id)} className="text-xs text-zk-accent underline disabled:opacity-50">
                        Publish
                      </button>
                      <button type="button" disabled={pending} onClick={() => remove(release.id)} className="text-xs text-zk-muted underline disabled:opacity-50">
                        Delete
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              {release.body ? (
                <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-zk-surface p-3 text-xs text-zk-text2">{release.body}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
