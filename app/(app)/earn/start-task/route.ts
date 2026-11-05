import { NextResponse, type NextRequest } from "next/server";
import { EARN_STARTED_COOKIE, EARN_TASKS, zikiTaskPath } from "@/lib/earn/draft";

/**
 * Draft only (#earn-drafts): Start on a Ziki task. It marks that task as in
 * progress (a cookie, since nothing is saved yet) and opens it already in
 * progress, so the list and the task page both say so.
 */
export function GET(request: NextRequest) {
  const n = Number(request.nextUrl.searchParams.get("n"));
  const valid = Number.isInteger(n) && n >= 1 && n <= EARN_TASKS.length;
  const to = request.nextUrl.clone();
  to.pathname = valid ? zikiTaskPath(n) : zikiTaskPath(1);
  to.search = valid ? `?step=${request.nextUrl.searchParams.get("to") === "in-review" ? "in-review" : "in-progress"}` : "";
  const response = NextResponse.redirect(to);
  if (valid) response.cookies.set(EARN_STARTED_COOKIE, String(n), { path: "/", sameSite: "lax", httpOnly: true });
  return response;
}
