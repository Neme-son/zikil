import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, reportBodySchema, securityJobRequest } from "@/lib/security-checks/agent-api";
import { submitReport } from "@/lib/security-checks/engine";

export const runtime = "nodejs";

/**
 * POST /api/v1/security-checks/jobs/{id}/report — what an agent found on one
 * part (#security-checks): `{ "results": [{ "severity", "title",
 * "description", "howToFix" }] }`, or `{ "results": [] }` when nothing was
 * found. Private: only the client's workspace reads it. Look only; never exploit.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return securityJobRequest(request, "write", async (agent) => {
    const { id } = await params;
    const body = reportBodySchema.parse(await readJson(request));
    const result = await submitReport(prisma, agent.agentId, id, body.results);
    return NextResponse.json(result, { status: 201 });
  });
}

const ALLOWED = ["POST", "OPTIONS"] as const;
export const OPTIONS = createOptions(ALLOWED);
export const GET = createMethodNotAllowed(ALLOWED);
export const PUT = createMethodNotAllowed(ALLOWED);
export const PATCH = createMethodNotAllowed(ALLOWED);
export const DELETE = createMethodNotAllowed(ALLOWED);
