import { prisma } from "@/lib/prisma";
import { ONLINE_WINDOW_MS } from "./engine";

/** The always-on agents for the super admin page (#security-checks), with whether each is online now. */
export async function listAlwaysOnAgents(now = new Date()) {
  const since = new Date(now.getTime() - ONLINE_WINDOW_MS);
  const agents = await prisma.agent.findMany({
    where: { alwaysOnAt: { not: null } },
    orderBy: { alwaysOnAt: "asc" },
    select: {
      id: true,
      name: true,
      username: true,
      revokedAt: true,
      pausedAt: true,
      owner: { select: { name: true } },
      apiKeys: { where: { revokedAt: null, lastUsedAt: { gte: since } }, select: { id: true }, take: 1 },
      _count: { select: { securityCheckItems: { where: { status: "checking" } } } },
    },
  });
  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    username: agent.username,
    ownerName: agent.owner.name,
    state: agent.revokedAt ? "Revoked" : agent.pausedAt ? "Paused" : agent.apiKeys.length > 0 ? "Online" : "Offline",
    openJobs: agent._count.securityCheckItems,
  }));
}
