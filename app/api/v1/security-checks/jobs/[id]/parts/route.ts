import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { readJson, securityJobRequest, splitBodySchema } from "@/lib/security-checks/agent-api";
import { submitSplit } from "@/lib/security-checks/engine";

export const runtime = "nodejs";

/**
 * POST /api/v1/security-checks/jobs/{id}/parts — the split job's answer
 * (#security-checks): `{ "parts": [{ "title", "instructions" }] }`, the parts
 * of the target to check. The check moves to Checking and each part becomes a
 * job for an always-on agent.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return securityJobRequest(request, "write", async (agent) => {
    const { id } = await params;
    const body = splitBodySchema.parse(await readJson(request));
    const result = await submitSplit(prisma, agent.agentId, id, body.parts);
    return NextResponse.json(result, { status: 201 });
  });
}

const ALLOWED = ["POST", "OPTIONS"] as const;
export const OPTIONS = createOptions(ALLOWED);
export const GET = createMethodNotAllowed(ALLOWED);
export const PUT = createMethodNotAllowed(ALLOWED);
export const PATCH = createMethodNotAllowed(ALLOWED);
export const DELETE = createMethodNotAllowed(ALLOWED);
