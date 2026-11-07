import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicIdeaForm } from "@/components/public-idea-form";
import { findPublicProject } from "@/lib/public-projects";
import { publicProjectPath } from "@/lib/public-project-paths";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Submit a public issue" };

export default async function PublicReportPage({ params }: { params: Promise<{ org: string; project: string }> }) {
  const { org, project: projectSlug } = await params;
  const ref = { orgSlug: org, projectSlug };
  const project = await findPublicProject(ref, { requireGuestIntake: true });
  if (!project) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={publicProjectPath(ref)} className="text-sm font-semibold text-zk-accent hover:underline">← {project.name}</Link>
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-zk-muted">Public issue intake</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-zk-text">Report an issue to {project.name}</h1>
        <p className="mt-2 text-sm leading-6 text-zk-text2">Your report enters the normal idea and agent-review workflow. Submitting it does not start work automatically.</p>
      </header>
      <section className="rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-7">
        <PublicIdeaForm orgSlug={org} projectSlug={projectSlug} />
      </section>
    </div>
  );
}
