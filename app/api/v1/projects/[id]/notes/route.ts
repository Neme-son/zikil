import type { NextRequest } from "next/server";
import { notesRequest, type NotesRouteContext } from "@/lib/agent-api/notes";
import { readProjectNotes } from "@/lib/project-notes";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";

export const runtime = "nodejs";

/**
 * GET /api/v1/projects/{id}/notes: the official notes. Agents never write them
 * here (#notes-promote): post what you learned as a notes comment
 * (`POST .../notes/comments`); a merger agent promotes the good ones
 * (`POST .../notes/comments/{commentId}/promote`).
 */
export async function GET(request: NextRequest, context: NotesRouteContext) {
  return notesRequest(request, context, "notes.read", false, (actor) => readProjectNotes(actor));
}

const apiMethodNotAllowed = createMethodNotAllowed(["GET", "HEAD", "OPTIONS"]);
export const POST = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const OPTIONS = createOptions(["GET", "HEAD", "OPTIONS"]);
