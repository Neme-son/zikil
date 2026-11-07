"use client";

import { useEffect, useState } from "react";
import type { SkillItem } from "../skills-data";

export interface AgentInfo {
  id: string;
  name: string;
  username?: string;
}

interface SkillDetailInteractiveProps {
  skill: SkillItem;
  agents: AgentInfo[];
  isGuest?: boolean;
}

function buildSmartSkillPrompt(
  skill: SkillItem,
  selectedAgentName: string,
  agents: AgentInfo[]
): string {
  const isAll = selectedAgentName === "all";
  const matchedAgent = agents.find((a) => a.name === selectedAgentName);
  const targetTag = `Ziki-Verified-${skill.title.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://ziki.dev";

  if (isAll) {
    const agentList =
      agents.length > 0
        ? agents
            .map((a) => (a.username ? `@${a.username}` : a.name))
            .join(", ")
        : "All workspace agents";

    return `# Target Agents: ${agentList}
# Skill: ${skill.title}
# Category: ${skill.categoryLabel}
# Registered Tag: ${targetTag}

## Step 1: Idempotency & Version Verification
Before applying or modifying anything:
1. Check if the skill "${targetTag}" is already installed and registered in your workspace or agent configuration.
2. If already installed with the identical specification and version:
   -> Report: "✓ Skill ${targetTag} is already installed and up to date across your agents. No new updates to apply."
   -> Stop execution here.

## Step 2: Prerequisites & Installation
${skill.spec.sampleCommand ? `Verify required tooling:\n$ ${skill.spec.sampleCommand}\n` : ""}
Apply the following system instructions:
"""
${skill.prompt}
"""

## Step 3: Platform Sync (Ziki Agent Profile)
For each active agent in your organisation, sync this skill to their profile using your existing Ziki agent connection:
\`\`\`bash
curl -s -X PUT "${origin}/api/v1/agents/me/skills/${encodeURIComponent(targetTag)}" \\
  -H "Authorization: Bearer \$ZIKI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "summary": ${JSON.stringify(skill.description.slice(0, 120))},
    "description": ${JSON.stringify(skill.spec.overview || skill.description)}
  }'
\`\`\`

## Step 4: Final Confirmation
Output to the user:
"✓ Successfully applied ${targetTag} across your active Ziki agents!"`;
  }

  const agentLabel = matchedAgent
    ? `${matchedAgent.name}${matchedAgent.username ? ` (@${matchedAgent.username})` : ""}`
    : selectedAgentName;
  const agentProfileUrl = matchedAgent?.username
    ? `${origin}/agent/${matchedAgent.username}/edit/skills`
    : `${origin}/agents/mine`;

  return `# Target Agent: ${agentLabel}
# Skill: ${skill.title}
# Category: ${skill.categoryLabel}
# Registered Tag: ${targetTag}

## Step 1: Idempotency & Version Verification
Before applying or modifying anything:
1. Query your registered skills via \`GET ${origin}/api/v1/agents/me/skills\` or check your workspace skill registry.
2. If the skill "${targetTag}" is already registered for ${agentLabel} with the same instructions:
   -> Report: "✓ Skill ${targetTag} is already installed and up to date on ${agentLabel}. No new updates to apply."
   -> Stop execution here.

## Step 2: Prerequisites & Local Setup
${skill.spec.sampleCommand ? `Run the verification command if dependencies are missing:\n$ ${skill.spec.sampleCommand}\n` : ""}
Inject and follow these verified system instructions:
"""
${skill.prompt}
"""

## Step 3: Platform Sync (Ziki Agent Profile)
Register this verified skill to ${agentLabel}'s profile using your existing Ziki agent authorization:
\`\`\`bash
curl -s -X PUT "${origin}/api/v1/agents/me/skills/${encodeURIComponent(targetTag)}" \\
  -H "Authorization: Bearer \$ZIKI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "summary": ${JSON.stringify(skill.description.slice(0, 120))},
    "description": ${JSON.stringify(skill.spec.overview || skill.description)}
  }'
\`\`\`

## Step 4: Final Confirmation
Once complete, notify the user:
"✓ Skill \`${targetTag}\` has been successfully verified, installed, and registered to ${agentLabel}! You can view it on your profile: ${agentProfileUrl}"`;
}

export function SkillDetailInteractive({
  skill,
  agents = [],
}: SkillDetailInteractiveProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>(
    agents.length > 0 ? agents[0].name : "Default Agent"
  );
  const [copiedPrimary, setCopiedPrimary] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function handleAgentChange(name: string) {
    setSelectedAgent(name);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("ziki-agent-selected", { detail: name })
      );
    }
  }

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }

  async function copyPrompt() {
    const promptText = buildSmartSkillPrompt(skill, selectedAgent, agents);

    try {
      await navigator.clipboard.writeText(promptText);
      setCopiedPrimary(true);
      setTimeout(() => setCopiedPrimary(false), 2000);

      showToast(
        selectedAgent !== "all"
          ? `Copied prompt targeted for ${selectedAgent} with Ziki sync!`
          : `Copied "${skill.title}" prompt for all agents!`
      );
    } catch {
      showToast("Unable to copy to clipboard.");
    }
  }

  return (
    <>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-zk-border bg-zk-surface px-4 py-3 text-xs font-semibold text-zk-text shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Action Bar: Agent Selector & Copy Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
        {/* Agent Dropdown */}
        <div className="relative min-w-[200px]">
          <select
            value={selectedAgent}
            onChange={(e) => handleAgentChange(e.target.value)}
            aria-label="Target agent"
            className="w-full appearance-none rounded-xl border border-zk-border bg-zk-chip/60 hover:bg-zk-chip py-2.5 pl-3.5 pr-8 text-xs font-semibold text-zk-text focus:border-blue-600 focus:outline-hidden transition cursor-pointer"
          >
            {agents.length > 0 ? (
              <>
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.name}>
                    For: {ag.name}
                  </option>
                ))}
                <option value="all">For: All Agents (Roster)</option>
              </>
            ) : (
              <>
                <option value="Default Agent">For: Default Agent</option>
                <option value="all">For: All Agents (Generic)</option>
              </>
            )}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-zk-muted">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Primary Copy Button */}
        <button
          type="button"
          onClick={copyPrompt}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-[0.98] transition cursor-pointer shrink-0"
        >
          {copiedPrimary ? (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Copied for {selectedAgent !== "all" ? selectedAgent : "All Agents"}!</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>Copy Agent Skill Prompt</span>
            </>
          )}
        </button>
      </div>
    </>
  );
}

export function SkillPromptSection({
  skill,
  agents = [],
}: SkillDetailInteractiveProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>(
    agents.length > 0 ? agents[0].name : "Default Agent"
  );
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    function onAgentSelected(e: Event) {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setSelectedAgent(customEvent.detail);
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("ziki-agent-selected", onAgentSelected);
      return () => {
        window.removeEventListener("ziki-agent-selected", onAgentSelected);
      };
    }
  }, []);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }

  async function handleCopy() {
    const promptText = buildSmartSkillPrompt(skill, selectedAgent, agents);

    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast(
        selectedAgent !== "all"
          ? `Copied prompt targeted for ${selectedAgent} with Ziki sync!`
          : `Copied "${skill.title}" prompt for all agents!`
      );
    } catch {
      showToast("Unable to copy to clipboard.");
    }
  }

  return (
    <section className="space-y-3">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-zk-border bg-zk-surface px-4 py-3 text-xs font-semibold text-zk-text shadow-lg animate-in fade-in slide-in-from-bottom-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-zk-text">
            Agent System Instructions
          </h2>
          <p className="text-xs text-zk-muted">
            Production-grade prompt directives injected into your workspace agent runtime.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zk-border bg-zk-surface hover:bg-zk-chip px-3 py-1.5 text-xs font-bold text-zk-text transition shadow-2xs cursor-pointer"
        >
          {copied ? (
            <>
              <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-emerald-600">Copied!</span>
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5 text-zk-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <span>Copy Instructions</span>
            </>
          )}
        </button>
      </div>

      {/* Visual display remains pure clean Markdown prompt instructions */}
      <div className="overflow-hidden rounded-2xl border border-zk-border bg-zk-chip/40">
        <div className="flex items-center justify-between border-b border-zk-border/60 bg-zk-chip/80 px-4 py-2.5 text-[11px] font-mono text-zk-muted">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
            <span className="font-semibold text-zk-text">prompt.md</span>
          </div>
          <span>Markdown Instructions</span>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap p-5 text-xs font-mono text-zk-text leading-relaxed select-text">
          {skill.prompt}
        </pre>
      </div>
    </section>
  );
}

export function CopyCommandButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={handleCopy}
      type="button"
      className="inline-flex items-center gap-1.5 rounded-lg border border-zk-border bg-zk-surface hover:bg-zk-chip px-3 py-1.5 text-xs font-bold text-zk-text transition shadow-2xs cursor-pointer shrink-0"
      title="Copy execution command"
    >
      {copied ? (
        <>
          <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-600">Copied!</span>
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5 text-zk-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
