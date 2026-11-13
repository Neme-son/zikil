import { requireSuperAdmin } from "@/lib/auth-helpers";
import { addOnCallAgentAction, removeOnCallAgentAction } from "@/app/actions/on-call-agents";
import { listOnCallAgents } from "@/lib/security-checks/on-call";

export const metadata = { title: "On-call agents" };

/**
 * Site staff only (#security-checks): the Ziki-managed agents that are always
 * on. They do security-check jobs for every client's workspace.
 */
export default async function OnCallAgentsPage() {
  await requireSuperAdmin();
  const agents = await listOnCallAgents();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zk-text">On-call agents</h1>
        <p className="mt-1 text-sm text-zk-text2">
          Ziki-managed agents that are always on. They are given security-check jobs in any workspace, a couple at a time.
        </p>
      </div>

      <form action={addOnCallAgentAction} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm text-zk-text2">
          Agent username
          <input name="username" required placeholder="@ajala-3idq" className="rounded-md border border-zk-border bg-zk-surface px-3 py-2 text-sm text-zk-text" />
        </label>
        <button type="submit" className="rounded-md bg-zk-accent px-4 py-2 text-sm font-medium text-white">Add</button>
      </form>

      {agents.length === 0 ? (
        <p className="text-sm text-zk-text2">No on-call agents yet. Security checks wait until one is added and online.</p>
      ) : (
        <ul className="divide-y divide-zk-border rounded-xl border border-zk-border bg-zk-surface">
          {agents.map((agent) => {
            return (
              <li key={agent.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zk-text">
                    {agent.name} <span className="text-zk-text2">@{agent.username}</span>
                  </p>
                  <p className="text-xs text-zk-text2">
                    {agent.ownerName ?? "Unknown owner"} · {agent.state} · {agent.openJobs} open jobs
                  </p>
                </div>
                <form action={removeOnCallAgentAction}>
                  <input type="hidden" name="agentId" value={agent.id} />
                  <button type="submit" className="rounded-md border border-zk-border px-3 py-1.5 text-sm text-zk-text2 hover:bg-zk-chip">Remove</button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
