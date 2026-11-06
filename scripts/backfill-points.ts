/**
 * Award points for tickets that existed before the ledger (#435).
 *
 *   pnpm tsx scripts/backfill-points.ts --dry-run   # print what it would award
 *   pnpm tsx scripts/backfill-points.ts             # award it
 *
 * Operator-run against the database in DATABASE_URL. A production container
 * runs the same award on server start. Safe to run again: entries already in
 * the ledger are skipped. It never seeds or resets.
 */
import { PrismaClient } from "@prisma/client";
import { cleanEnv } from "../lib/env-clean";
import { backfillPoints, parseBackfillArgs, type BackfillLine } from "../lib/points/backfill";

function describe(line: BackfillLine): string {
  const state = line.alreadyAwarded ? "skip (already awarded)" : "award";
  const earnedAt = line.createdAt?.toISOString() ?? "at-write-time";
  return `${state.padEnd(22)} ${line.role.padEnd(8)} +${String(line.ledgerPoints).padEnd(3)} ` +
    `organisation=${line.organisationId} user=${line.userId} bug=${line.bugId} ` +
    `sourceKey=${line.sourceKey} agent=${line.agentId ?? "none"} earnedAt=${earnedAt}`;
}

async function main() {
  // Checked before connecting: an unknown flag (e.g. --dryrun) must not become a real run.
  const args = parseBackfillArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.error);
    process.exit(2);
  }
  const { dryRun, verbose, cutoffDate } = args;
  const url = cleanEnv(process.env.DATABASE_URL);
  const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

  try {
    console.log(dryRun ? "Dry run: nothing will be written.\n" : "Backfilling points.\n");
    const result = await backfillPoints(prisma, {
      dryRun,
      cutoffDate,
      onLine: verbose ? (line) => console.log(describe(line)) : undefined,
    });
    console.log(
      `\n${result.bugs} tickets, ${result.planned} entries by the rules, ` +
        `${result.existing} already awarded, ${dryRun ? "0 written (dry run)" : `${result.written} written`}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
