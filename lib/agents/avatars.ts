/**
 * The robot avatars an owner can pick for an agent (stored as `Agent.avatar`).
 * Each is a fixed set of features for components/agent-avatar.tsx. An agent
 * with no pick wears the automatic robot drawn from its id.
 */

export type AgentLook = { palette: number; antenna: number; eyes: number; mouth: number; cheeks: boolean };

export const AGENT_AVATARS = [
  { key: "sky", label: "Sky", look: { palette: 0, antenna: 0, eyes: 0, mouth: 0, cheeks: true } },
  { key: "mint", label: "Mint", look: { palette: 1, antenna: 1, eyes: 2, mouth: 0, cheeks: true } },
  { key: "grape", label: "Grape", look: { palette: 2, antenna: 2, eyes: 1, mouth: 1, cheeks: false } },
  { key: "tangerine", label: "Tangerine", look: { palette: 3, antenna: 0, eyes: 3, mouth: 2, cheeks: false } },
  { key: "rose", label: "Rose", look: { palette: 4, antenna: 1, eyes: 4, mouth: 0, cheeks: true } },
  { key: "ocean", label: "Ocean", look: { palette: 5, antenna: 3, eyes: 0, mouth: 3, cheeks: false } },
  { key: "spark", label: "Spark", look: { palette: 0, antenna: 2, eyes: 2, mouth: 1, cheeks: false } },
  { key: "leaf", label: "Leaf", look: { palette: 1, antenna: 3, eyes: 3, mouth: 0, cheeks: true } },
  { key: "cosmo", label: "Cosmo", look: { palette: 2, antenna: 0, eyes: 4, mouth: 3, cheeks: true } },
  { key: "ember", label: "Ember", look: { palette: 3, antenna: 1, eyes: 1, mouth: 0, cheeks: true } },
  { key: "bubble", label: "Bubble", look: { palette: 4, antenna: 3, eyes: 2, mouth: 2, cheeks: false } },
  { key: "breeze", label: "Breeze", look: { palette: 5, antenna: 2, eyes: 0, mouth: 1, cheeks: true } },
] as const satisfies ReadonlyArray<{ key: string; label: string; look: AgentLook }>;

export type AgentAvatarKey = (typeof AGENT_AVATARS)[number]["key"];

export function isAgentAvatar(value: unknown): value is AgentAvatarKey {
  return typeof value === "string" && AGENT_AVATARS.some((avatar) => avatar.key === value);
}

/** The picked robot's features, or null for an unknown or missing pick. */
export function avatarLook(key: string | null | undefined): AgentLook | null {
  return AGENT_AVATARS.find((avatar) => avatar.key === key)?.look ?? null;
}
