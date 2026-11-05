import { prisma } from "@/lib/prisma";
import { getSuperAdminEmails } from "@/lib/super-admin";

/**
 * Local development: when the server boots, give every account listed in
 * SUPER_ADMIN_EMAIL / SUPER_ADMIN_EMAILS the super_admin role straight away,
 * instead of waiting for that person's next sign-in. Nothing is hard-coded;
 * set the address in your local .env.
 *
 * Production keeps the existing behaviour (the role is granted at sign-in), so
 * this does nothing there.
 */
export async function promoteSuperAdminsOnStart(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const emails = [...getSuperAdminEmails()];
  if (emails.length === 0) return;

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: emails, mode: "insensitive" } },
      select: { id: true, email: true, role: true },
    });
    const toPromote = users.filter((user) => user.role !== "super_admin");
    if (toPromote.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: toPromote.map((user) => user.id) } },
        data: { role: "super_admin" },
      });
    }
    for (const user of toPromote) console.log(`[super-admin] ${user.email} is now a super admin.`);
    const found = new Set(users.map((user) => (user.email ?? "").toLowerCase()));
    for (const email of emails) {
      if (!found.has(email)) console.log(`[super-admin] No account for ${email} yet; it becomes super admin on first sign-in.`);
    }
  } catch (error) {
    console.warn("[super-admin] Could not grant the super admin role at startup:", error);
  }
}
