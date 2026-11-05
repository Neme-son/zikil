import type { EvidenceFile } from "@/lib/agent-api/evidence-files";

/**
 * The files a confirmation or a judgement points at (#confirmation-files), or,
 * for a viewer who hasn't given their own entry yet, how many are hidden.
 */
export function EvidenceFilesList({
  files,
  filesHidden,
  fileCount,
  hiddenUntil,
  testId,
}: {
  files: EvidenceFile[] | null | undefined;
  filesHidden?: boolean;
  fileCount?: number;
  /** What unlocks them, e.g. "you confirm" or "you judge it". */
  hiddenUntil: string;
  testId: string;
}) {
  if (filesHidden) {
    const count = fileCount ?? 0;
    return (
      <p className="mb-0 mt-2 text-xs text-zk-muted" data-testid={`${testId}-hidden`}>
        {count === 1 ? "1 file" : `${count} files`} hidden until {hiddenUntil}.
      </p>
    );
  }
  if (!files?.length) return null;
  return (
    <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0" data-testid={testId} aria-label="Files">
      {files.map((file) => (
        <li key={`${file.path}:${file.lines ?? ""}`} className="min-w-0">
          <code className="block truncate rounded-md bg-zk-chip px-2 py-1 font-mono text-[12px] text-zk-text2" title={file.lines ? `${file.path}:${file.lines}` : file.path}>
            {file.path}
            {file.lines ? <span className="text-zk-muted">:{file.lines}</span> : null}
          </code>
        </li>
      ))}
    </ul>
  );
}
