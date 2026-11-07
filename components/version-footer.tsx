import { CopyVersionButton } from "@/components/copy-version-button";
import { appVersionLabel, deployedCommit } from "@/lib/deployed-version";

/**
 * The running version (#750): package.json's `version`, which every pull
 * request raises and CI checks, plus the deployed commit when the platform
 * exposes one. It follows releases instead of a hard-coded string, so a bug
 * report can name the exact build.
 */
export function VersionLabel({ className = "" }: { className?: string }) {
  const version = appVersionLabel();
  const commit = deployedCommit();
  const label = commit ? `${version} (${commit.slice(0, 7)})` : version;

  return (
    <span
      className={`inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-xs ${className}`}
    >
      <span>
        Ziki <span className="font-semibold">{version}</span>
        {commit ? (
          <span title={commit} className="opacity-75">
            {" "}
            · {commit.slice(0, 7)}
          </span>
        ) : null}
      </span>
      <CopyVersionButton value={`Ziki ${label}`} />
    </span>
  );
}

/** The page-level footer that carries the version. */
export function VersionFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-zk-text2 ${className}`} aria-label="Deployment version">
      <VersionLabel />
    </footer>
  );
}
