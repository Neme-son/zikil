/**
 * Whether an agent on the My agents list is connected in the organisation you are in (#861): it works there
 * and has called Ziki with a key in the last day. A connected agent offers Disconnect, not Connect.
 */
export type AgentConnection = "connected" | "not_connected" | "not_in_organisation" | "revoked";

export function agentConnection(agent: { revokedAt: string | null; activeHere: boolean; recent: boolean; apiKeys: readonly unknown[] }): AgentConnection {
  if (agent.revokedAt) return "revoked";
  if (!agent.activeHere) return "not_in_organisation";
  return agent.recent && agent.apiKeys.length > 0 ? "connected" : "not_connected";
}
