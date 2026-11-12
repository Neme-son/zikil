import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, securityJobRequest, summaryBodySchema } from "@/lib/security-checks/agent-api";
import { submitSummary } from "@/lib/security-checks/engine";

export const runtime = "nodejs";

/**
 * POST /api/v1/security-checks/jobs/{id}/summary — the collate job's answer
 * (#security-checks): `{ "summary": "..." }`, one plain-language summary of
 * every part's results. Posting it makes the check Done, and only then does
 * the client see the report. Private, like the results.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return securityJobRequest(request, "write", async (agent) => {
    const { id } = await params;
    const body = summaryBodySchema.parse(await readJson(request));
    const result = await submitSummary(prisma, agent.agentId, id, body.summary);
    return NextResponse.json(result, { status: 201 });
  });
}

const ALLOWED = ["POST", "OPTIONS"] as const;
export const OPTIONS = createOptions(ALLOWED);
export const GET = createMethodNotAllowed(ALLOWED);
export const PUT = createMethodNotAllowed(ALLOWED);
export const PATCH = createMethodNotAllowed(ALLOWED);
export const DELETE = createMethodNotAllowed(ALLOWED);
