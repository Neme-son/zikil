"use client";

import { useActionState } from "react";
import { updateProjectAction } from "@/app/(app)/projects/actions";
import type { ProjectActionResult } from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProjectRewardRulesSection } from "@/components/project-reward-rules-section";
import type { ProjectRewardConfig } from "@/lib/points/project-rewards";

type Project = {
  slug: string;
  name: string;
  goal: string | null;
  repoUrl: string | null;
  stagingUrl: string | null;
  siteUrl: string | null;
  rewardConfig?: unknown;
};

export function ProjectSettingsForm({
  project,
  defaults = null,
}: {
  project: Project;
  defaults?: ProjectRewardConfig | null;
}) {
  const [result, action, pending] = useActionState<ProjectActionResult | undefined, FormData>(updateProjectAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={project.slug} />
      {result?.error ? <p role="alert" className="rounded-[14px] bg-zk-bad-bg p-3 text-sm text-zk-bad-fg">{result.error}</p> : null}
      <label htmlFor="project-name" className="block space-y-1 text-sm font-medium text-zk-text">Project name
        <Input id="project-name" name="name" defaultValue={project.name} minLength={2} maxLength={60} required />
        {result?.field === "name" ? <span className="text-xs text-zk-bad-fg">{result.fieldErrors?.name ?? result.error}</span> : null}
      </label>
      <label htmlFor="project-goal" className="block space-y-1 text-sm font-medium text-zk-text">Goal
        <Textarea id="project-goal" name="goal" defaultValue={project.goal ?? ""} maxLength={4000} rows={6} aria-describedby="project-goal-hint" />
        <span id="project-goal-hint" className="block text-xs font-normal text-zk-muted">Markdown is supported. Maximum 4,000 characters.</span>
      </label>
      <label htmlFor="project-repo-url" className="block space-y-1 text-sm font-medium text-zk-text">GitHub repository URL
        <Input id="project-repo-url" name="repoUrl" type="url" inputMode="url" placeholder="https://github.com/owner/repository" defaultValue={project.repoUrl ?? ""} />
        {result?.field === "repoUrl" ? <span className="text-xs text-zk-bad-fg">{result.fieldErrors?.repoUrl ?? result.error}</span> : null}
      </label>
      <label htmlFor="project-site-url" className="block space-y-1 text-sm font-medium text-zk-text">Site URL
        <Input id="project-site-url" name="siteUrl" type="url" inputMode="url" placeholder="https://example.com" defaultValue={project.siteUrl ?? ""} />
        {result?.field === "siteUrl" ? <span className="text-xs text-zk-bad-fg">{result.fieldErrors?.siteUrl ?? result.error}</span> : null}
      </label>
      <label htmlFor="project-staging-url" className="block space-y-1 text-sm font-medium text-zk-text">Staging URL
        <Input id="project-staging-url" name="stagingUrl" type="url" inputMode="url" placeholder="https://staging.example.com" defaultValue={project.stagingUrl ?? ""} />
        {result?.field === "stagingUrl" ? <span className="text-xs text-zk-bad-fg">{result.fieldErrors?.stagingUrl ?? result.error}</span> : null}
      </label>

      <ProjectRewardRulesSection
        initialConfig={project.rewardConfig as ProjectRewardConfig | null}
        defaults={defaults}
        disabled={pending}
      />

      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
      {result && !result.error ? <span role="status" className="ml-3 text-sm text-zk-ok-fg">Settings saved.</span> : null}
    </form>
  );
}
