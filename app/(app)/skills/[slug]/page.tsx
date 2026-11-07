import { notFound } from "next/navigation";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { optionalUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSkillBySlug, SkillUnavailableError, type SkillItem } from "../skills-data";
import { SkillIcon } from "../skills-directory";
import {
  SkillDetailInteractive,
  SkillPromptSection,
  CopyCommandButton,
} from "./skill-detail-interactive";

/** GAP 3: a failing database renders this instead of a misleading 404. */
function SkillUnavailableBanner() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-16 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight text-zk-text">
        Skill unavailable
      </h1>
      <p role="alert" className="text-sm text-zk-text2">
        The skills library is temporarily unavailable, so this skill can&apos;t
        be loaded right now. Please try again in a moment.
      </p>
      <Link
        href="/skills"
        className="inline-flex items-center justify-center rounded-xl border border-zk-border bg-zk-chip px-4 py-2 text-xs font-semibold text-zk-text hover:bg-zk-tint transition"
      >
        ← Back to Library
      </Link>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let skill: SkillItem | undefined;
  try {
    skill = await getSkillBySlug(slug);
  } catch (error) {
    if (!(error instanceof SkillUnavailableError)) throw error;
    return {
      title: "Skills Library Unavailable — Ziki",
      description: "The skills library is temporarily unavailable. Please try again shortly.",
    };
  }

  if (!skill) {
    return {
      title: "Skill Not Found — Ziki",
      description: "The requested skill does not exist in the library.",
    };
  }

  return {
    title: `${skill.title} — Skills Library — Ziki`,
    description: skill.description,
    openGraph: {
      title: `${skill.title} — Skills Library — Ziki`,
      description: skill.description,
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: `${skill.title} — Skills Library — Ziki`,
      description: skill.description,
    },
  };
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let skill: SkillItem | undefined;
  try {
    skill = await getSkillBySlug(slug);
  } catch (error) {
    if (!(error instanceof SkillUnavailableError)) throw error;
    return <SkillUnavailableBanner />;
  }

  if (!skill) {
    notFound();
  }

  // Data loading: load agents owned by the signed-in viewer (guests get [])
  const user = await optionalUser();
  const agents = user
    ? await prisma.agent
        .findMany({
          where: { ownerUserId: user.id },
          select: { id: true, name: true, username: true },
          orderBy: { name: "asc" },
        })
        .catch(() => [])
    : [];

  // Schema.org Structured Data for Search Engines (safe with JsonLd escaping)
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: skill.title,
    description: skill.description,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "All",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    author: {
      "@type": "Person",
      name: skill.author.name,
    },
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      {/* JSON-LD Structured Data for Search Engines */}
      <JsonLd data={jsonLd} />

      {/* Hero Header Card */}
      <div className="rounded-2xl border border-zk-border bg-zk-surface p-6 sm:p-8 overflow-hidden shadow-xs">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between gap-4 border-b border-zk-divider pb-4 mb-6">
          <Link
            href="/skills"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zk-muted hover:text-blue-600 transition"
          >
            <span>←</span>
            <span>Back to Skills Library</span>
          </Link>
          <span className="text-xs font-medium text-zk-muted">
            Skills / <span className="text-zk-text font-semibold">{skill.categoryLabel}</span>
          </span>
        </div>

        {/* Title, Icon & Description */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <SkillIcon icon={skill.icon} className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {skill.categoryLabel}
              </p>
              <h1 className="text-2xl font-extrabold tracking-tight text-zk-text sm:text-3xl sm:leading-tight">
                {skill.title}
              </h1>
            </div>
          </div>

          <p className="text-sm text-zk-text2 leading-relaxed sm:text-base max-w-3xl">
            {skill.description}
          </p>

          {/* Interactive Agent Target & Copy Action Bar */}
          <div className="pt-2">
            <SkillDetailInteractive skill={skill} agents={agents} isGuest={!user} />
          </div>
        </div>

        {/* Footer Meta */}
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-zk-muted pt-4 border-t border-zk-divider">
          <span>
            Authored by <strong className="text-zk-text">{skill.author.name}</strong>
          </span>
          {skill.spec.documentationUrl && (
            <>
              <span>•</span>
              <a
                href={skill.spec.documentationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <span>Documentation</span>
                <span>↗</span>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Main Grid: Content & Meta */}
      <div className="grid grid-cols-1 gap-6 lg:gap-8 lg:grid-cols-3">
        {/* Left Column: Spec, Checklist, Command, Instructions */}
        <div className="space-y-6 lg:col-span-2">
          {/* Overview & Objectives */}
          <section className="space-y-2.5">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zk-text">Overview &amp; Objectives</h2>
            <div className="rounded-2xl border border-zk-border bg-zk-surface p-5">
              <p className="text-sm text-zk-text2 leading-relaxed">
                {skill.spec.overview}
              </p>
            </div>
          </section>

          {/* Quality & Verification Checklist */}
          {skill.spec.checklist.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zk-text">
                Quality &amp; Verification Checklist
              </h2>
              <div className="rounded-2xl border border-zk-border bg-zk-surface p-5 space-y-3">
                {skill.spec.checklist.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs text-zk-text leading-relaxed">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                      ✓
                    </span>
                    <span className="pt-0.5">{item}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sample CLI Command */}
          {skill.spec.sampleCommand && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zk-text">CLI Verification Command</h2>
              <div className="flex items-center justify-between rounded-xl border border-zk-border bg-zk-chip/60 px-4 py-3">
                <div className="flex items-center gap-2 overflow-hidden mr-2">
                  <span className="text-zk-muted font-mono text-xs select-none">$</span>
                  <code className="text-xs font-mono text-zk-text truncate select-all">
                    {skill.spec.sampleCommand}
                  </code>
                </div>
                <CopyCommandButton command={skill.spec.sampleCommand} />
              </div>
            </section>
          )}

          {/* Agent System Instructions Box */}
          <SkillPromptSection skill={skill} agents={agents} />
        </div>

        {/* Right Sidebar: Skill Specification & Tags */}
        <div className="space-y-6 lg:col-span-1">
          {/* Skill Specification Details */}
          <div className="rounded-2xl border border-zk-border bg-zk-surface p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zk-muted">Specification</h3>
            <div className="space-y-3 text-xs divide-y divide-zk-divider">
              <div className="pt-2.5 flex justify-between items-center">
                <span className="text-zk-muted">Category</span>
                <span className="font-semibold text-zk-text">
                  {skill.categoryLabel}
                </span>
              </div>
              <div className="pt-2.5 flex justify-between items-center">
                <span className="text-zk-muted">Compatible Agents</span>
                <span className="font-semibold text-zk-text">All AI Agents</span>
              </div>
              <div className="pt-2.5 flex justify-between items-center">
                <span className="text-zk-muted">Author</span>
                <span className="font-semibold text-zk-text">
                  {skill.author.name}
                </span>
              </div>
              <div className="pt-2.5 flex justify-between items-center">
                <span className="text-zk-muted">Verification</span>
                <span className="font-semibold text-zk-text">CLI &amp; Test Suite</span>
              </div>
              {skill.spec.documentationUrl && (
                <div className="pt-2.5 flex justify-between items-center">
                  <span className="text-zk-muted">Documentation</span>
                  <a
                    href={skill.spec.documentationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    <span>Reference</span>
                    <span>↗</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Tags */}
          {skill.tags.length > 0 && (
            <div className="rounded-2xl border border-zk-border bg-zk-surface p-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zk-muted">
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {skill.tags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/skills?search=${encodeURIComponent(tag)}`}
                    className="rounded-md bg-zk-chip hover:bg-zk-border px-2.5 py-1 text-[11px] font-mono text-zk-muted hover:text-zk-text transition"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Browse Library Link */}
          <div className="rounded-2xl border border-zk-border bg-zk-surface p-5 text-center space-y-2">
            <p className="text-xs text-zk-muted">
              Looking for other verified skills?
            </p>
            <Link
              href="/skills"
              className="inline-block text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              Browse All Skills in Library →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
