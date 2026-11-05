import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { formatStructuredDescription, isUnstructuredDraft } from "@/lib/ideas";
import { logger } from "@/lib/logger";

/**
 * Structure an idea as it is submitted (#idea-intake): Claude reads what the
 * person typed and writes it up as a clear idea (a title and the standard
 * headings) before it is saved, instead of saving the raw text as it is.
 *
 * Uses ZIKI_CLAUDE_API_KEY with Claude Sonnet 5.5 at low effort: a quick,
 * cheap extraction. Without the key, or if the call fails or is declined, the
 * idea is saved as typed (the draft sweep in lib/cron/draft-structuring.ts can
 * still pick it up later), so a person can always file an idea.
 */
const MODEL = "claude-sonnet-5-5";
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

const IdeaExtraction = z.object({
  title: z.string().describe("A short, specific title for the idea: what should change, in plain words (at most 12 words)."),
  summary: z.string().describe("One sentence: what the person wants."),
  problem: z.string().describe("What is wrong or missing today, in the person's own terms where possible."),
  proposedSolution: z.string().describe("The change or feature being asked for. If they did not propose one, say what needs deciding."),
  acceptanceCriteria: z.array(z.string()).describe("2 to 5 short, checkable conditions that show it is done."),
});

const SYSTEM = `You turn ideas that people type into a product tracker into clear, structured ideas that other people and coding agents can act on.

Stay faithful to what the person wrote. Do not invent requirements, numbers, names or scope that it doesn't state or clearly imply. Keep their meaning and their wording where it is already clear. Write plainly, in the same language they used.`;

export type StructuredIdea = { title: string; description: string };

/**
 * Whether an idea is sent for structuring: anything a person typed that isn't
 * already in the standard headings. Short ideas are structured too: they are
 * the ones that most need writing up (the model is told not to invent scope,
 * and to say what still needs deciding).
 */
export function shouldStructureIdea(description: string): boolean {
  return description.trim().length > 0 && isUnstructuredDraft({ createdByAgentId: null, description });
}

export async function structureIdea(input: { title: string; description: string }): Promise<StructuredIdea | null> {
  const apiKey = process.env.ZIKI_CLAUDE_API_KEY?.trim();
  if (!apiKey || !shouldStructureIdea(input.description)) return null;

  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(IdeaExtraction) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Structure this idea.\n\nTitle they gave: ${input.title || "(none)"}\n\nWhat they wrote:\n${input.description}`,
        },
      ],
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    const extracted = response.parsed_output;
    if (!extracted) return null;

    const title = extracted.title.trim().slice(0, TITLE_MAX);
    const structured = formatStructuredDescription(input.description, {
      summary: extracted.summary,
      problem: extracted.problem,
      proposedSolution: extracted.proposedSolution,
      acceptanceCriteria: extracted.acceptanceCriteria,
    }).trim();
    // Keep what they actually typed under the write-up when it fits, so nothing is lost.
    const withOriginal = `${structured}\n\n## Original request\n${input.description.trim()}`;
    const description = withOriginal.length <= DESCRIPTION_MAX ? withOriginal : structured.slice(0, DESCRIPTION_MAX);
    if (title.length < 3 || description.length < 10) return null;
    return { title, description };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      logger.error("[ideas] ZIKI_CLAUDE_API_KEY was rejected; saving the idea as typed.");
    } else if (error instanceof Anthropic.RateLimitError) {
      logger.warn("[ideas] Claude rate limit reached; saving the idea as typed.");
    } else if (error instanceof Anthropic.APIError) {
      logger.error(`[ideas] Claude API error ${error.status}; saving the idea as typed.`, error);
    } else {
      logger.error("[ideas] Structuring the idea failed; saving it as typed.", error);
    }
    return null;
  }
}
