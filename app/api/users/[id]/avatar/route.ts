import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/users/[id]/avatar — serve a user's uploaded avatar image (#290, #576).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const attachment = await prisma.attachment.findFirst({
    where: { uploaderId: id, filename: { startsWith: "avatar" } },
    orderBy: { createdAt: "desc" },
    select: { data: true, contentType: true },
  });

  if (!attachment) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(attachment.data), {
    status: 200,
    headers: {
      "Content-Type": attachment.contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
