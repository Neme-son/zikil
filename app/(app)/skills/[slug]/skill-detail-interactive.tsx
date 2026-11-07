"use client";

import { useState } from "react";
import type { SkillItem } from "../skills-data";

interface SkillDetailInteractiveProps {
  skill: SkillItem;
  agents: { id: string; name: string }[];
  isGuest?: boolean;
}

export function SkillDetailInteractive({
  skill,
  agents = [],
}: SkillDetailInteractiveProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>(
    agents.length > 0 ? agents[0].name : "Default Agent"
  );
  const [copiedPrimary, setCopiedPrimary] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }

  async function copyPrompt(source: "hero" | "code") {
    const targeted = Boolean(selectedAgent && selectedAgent !== "all");
    const promptText = targeted
      ? `Target Agent: ${selectedAgent}\n\n${skill.prompt}`
      : skill.prompt;

    try {
      await navigator.clipboard.writeText(promptText);
      if (source === "hero") {
        setCopiedPrimary(true);
        setTimeout(() => setCopiedPrimary(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }

      showToast(
        targeted
          ? `Copied prompt targeted for ${selectedAgent}!`
          : `Copied "${skill.title}" prompt to clipboard!`
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
            onChange={(e) => setSelectedAgent(e.target.value)}
            aria-label="Target agent"
            className="w-full appearance-none rounded-xl border border-zk-border bg-zk-chip/60 hover:bg-zk-chip py-2.5 pl-3.5 pr-8 text-xs font-semibold text-zk-text focus:border-blue-600 focus:outline-hidden transition cursor-pointer"
          >
            {agents.length > 0 ? (
              agents.map((ag) => (
                <option key={ag.id} value={ag.name}>
                  For: {ag.name}
                </option>
              ))
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
          onClick={() => copyPrompt("hero")}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 active:scale-[0.98] transition cursor-pointer shrink-0"
        >
          {copiedPrimary ? (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
              <span>Copied for {selectedAgent !== "all" ? selectedAgent : "Agent"}!</span>
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

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }

  async function handleCopy() {
    const targeted = Boolean(selectedAgent && selectedAgent !== "all");
    const promptText = targeted
      ? `Target Agent: ${selectedAgent}\n\n${skill.prompt}`
      : skill.prompt;

    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast(
        targeted
          ? `Copied prompt targeted for ${selectedAgent}!`
          : `Copied "${skill.title}" prompt to clipboard!`
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
