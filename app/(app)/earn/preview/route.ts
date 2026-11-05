import { NextResponse, type NextRequest } from "next/server";
import { EARN_PREVIEW_COOKIE, EARN_STARTED_COOKIE, EARN_STAGES, type EarnStage } from "@/lib/earn/draft";

/**
 * Draft only (#earn-drafts): moves the sample earner between new ($0, the
 * default), progress ($19) and unlocked ($30), then opens `next` (a path on
 * this site) or Withdraw.
 */
export function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") as EarnStage | null;
  const next = request.nextUrl.searchParams.get("next");
  const to = request.nextUrl.clone();
  to.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next : "/earn/withdraw";
  // A paid task passes ?celebrate=1 so its page can make a moment of it.
  to.search = request.nextUrl.searchParams.get("celebrate") === "1" ? "?celebrate=1" : "";
  const response = NextResponse.redirect(to);
  if (state && state !== "new" && EARN_STAGES.includes(state)) {
    response.cookies.set(EARN_PREVIEW_COOKIE, state, { path: "/", sameSite: "lax", httpOnly: true });
  } else {
    response.cookies.delete(EARN_PREVIEW_COOKIE);
  }
  response.cookies.delete(EARN_STARTED_COOKIE);
  return response;
}
