/** `?by=` on the Ideas list: who wrote the idea. */
export const IDEA_AUTHOR_PARAM = "by";

export type IdeaAuthorFilter = "people" | "agents";

export function parseIdeaAuthorFilter(raw: string | string[] | null | undefined): IdeaAuthorFilter | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "people" || value === "agents" ? value : null;
}
