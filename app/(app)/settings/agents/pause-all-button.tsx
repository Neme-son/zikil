"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { setAllAgentsPausedAction } from "./actions";
import { agentsSecondaryBtn } from "./agents-ui";

/**
 * Pause all (#236): one button that stops every agent the person owns in this
 * workspace, for when something goes wrong and they need everything to stop
 * now. Once all of them are paused it offers Resume all instead.
 */
export function PauseAllButton({ working, paused }: { working: number; paused: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  if (working + paused === 0) return null;
  const resume = working === 0;

  async function run() {
    if (!resume) {
      const ok = await confirm({
        title: `Pause all ${working} working ${working === 1 ? "agent" : "agents"}?`,
        body: "Every agent you own here stops straight away. They keep the issues they hold, and those deadlines stop until you resume them.",
        confirmLabel: "Pause all",
        tone: "danger",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await setAllAgentsPausedAction(!resume);
      if (!result.ok) return toast(result.error, "error");
      const n = result.changed;
      toast(resume ? `${n} ${n === 1 ? "agent is" : "agents are"} working again.` : `${n} ${n === 1 ? "agent" : "agents"} paused.`, "success");
    });
  }

  return (
    <Button type="button" onClick={run} disabled={pending} data-pause-all={resume ? "resume" : "pause"} className={agentsSecondaryBtn}>
      {resume ? "▶ Resume all" : "⏸ Pause all"}
    </Button>
  );
}
