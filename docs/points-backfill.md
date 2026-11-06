# Recovering missing confirmation awards

`backfillPoints` reuses the live confirmation-award rules for reviewer-confirm,
triager-clear and duplicate-marker entries. It preserves the agent and earned
timestamp and inserts by the existing unique source key. Running it again fills
missing entries without replacing or duplicating existing credits.

The current confirmation model replaces the legacy validation terminology in
issue #539. Recovery follows counted, standing confirmations and the configured
reward amounts, not the historical numbers copied into that issue. Undone,
superseded, penalised and own-issue confirmations do not receive recovered
confirmation awards; deleted issues receive no backfill awards.

## Preview before an operator-authorized recovery

Set `DATABASE_URL` to the intended database through the existing secret-management
process. Do not paste credentials into reports or commit an environment file.

```sh
pnpm tsx scripts/backfill-points.ts --dry-run
```

The preview writes no ledger rows. Each line identifies the organisation, user,
issue, source key, originating agent and earned time. Its amount includes the
organisation's points multiplier, matching what the ledger would store. A line
marked `skip (already awarded)` is not a proposed new credit. An entry without a
historical timestamp says `at-write-time`.

Check the source keys and recipients, expected historical ordering and duplicate
eligibility, and the final planned/existing counts. Dry-run output is an estimate
under the configuration and standing records read during that run, not a reserved
transaction: live actions or configuration can change before a later execution.

After the operator has reviewed the preview and authorized the intended write:

```sh
pnpm tsx scripts/backfill-points.ts --verbose
pnpm tsx scripts/backfill-points.ts --dry-run
```

The second preview should report no missing entries while eligibility is unchanged.
The unique source key also protects against a live award arriving between lookup
and insertion. This procedure never seeds, resets, directly edits or deletes ledger
rows. Production containers can run the same idempotent recovery on startup;
`BACKFILL_POINTS_ON_START=0` disables that automatic run.
