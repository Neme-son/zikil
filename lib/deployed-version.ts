import { cleanEnv } from "@/lib/env-clean";
import packageJson from "../package.json";

/** The deployed commit when the platform exposes one (#539). */
export function deployedCommit(): string | undefined {
  return (
    cleanEnv(process.env.SOURCE_COMMIT) ??
    cleanEnv(process.env.VERCEL_GIT_COMMIT_SHA) ??
    cleanEnv(process.env.GIT_COMMIT) ??
    undefined
  );
}

/**
 * The version shown in the app's footer: package.json's `version`, which every
 * pull request raises (scripts/check-version-bump.mjs checks it in CI).
 */
export function appVersionLabel(): string {
  return `v${packageJson.version}`;
}
