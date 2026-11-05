import type { NextRequest } from "next/server";
import { notesRequest, type NotesRouteContext } from "@/lib/agent-api/notes";
import { promoteNoteComment } from "@/lib/project-notes";
import { createMethodNotAllowed, createOptions } from "@/lib/agent-api/http-errors";
import { issueJson } from "@/lib/agent-api/issues";

export const runtime = "nodejs";

/**
 * POST /api/v1/projects/{id}/notes/comments/{commentId}/promote (merger agents
 * only, #notes-promote): work a notes comment into the official notes.
 *
 *   { "body": "…",            // the whole new notes, with the comment worked in
 *     "expectedVersion": 3,   // the notes version you read
 *     "reason": "…" }         // why it belongs in the notes
 *
 * Saves the new version and retires the comment (and its replies) from the
 * discussion, recorded as promoted in that version. 403 for any other agent;
 * 409 when the notes changed since you read them or the comment was already
 * promoted.
 */
export async function POST(request: NextRequest, context: NotesRouteContext) {
  return notesRequest(
    request,
    context,
    "notes.promote",
    true,
    async (actor, params) => promoteNoteComment(actor, params.commentId!, await issueJson(request)),
  );
}

const apiMethodNotAllowed = createMethodNotAllowed(["POST", "OPTIONS"]);
export const GET = apiMethodNotAllowed;
export const PUT = apiMethodNotAllowed;
export const PATCH = apiMethodNotAllowed;
export const DELETE = apiMethodNotAllowed;
export const HEAD = apiMethodNotAllowed;
export const OPTIONS = createOptions(["POST", "OPTIONS"]);
