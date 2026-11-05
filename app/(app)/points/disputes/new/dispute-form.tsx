"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { openDisputeAction, type DisputeActionResult } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** The open-a-dispute form; prefill a bug number and/or a wrong entry (#436). */
export function DisputeForm({
  defaultBugNumber = "",
  defaultEntryId = "",
}: {
  defaultBugNumber?: string;
  defaultEntryId?: string;
}) {
  const [kind, setKind] = useState<"missing" | "wrong">(defaultEntryId ? "wrong" : "missing");
  const [result, action, pending] = useActionState<DisputeActionResult | undefined, FormData>(
    openDisputeAction,
    undefined,
  );
  const error = result && !result.ok ? result : null;

  if (result?.ok) {
    return (
      <div className="space-y-3 rounded-xl border border-zk-border bg-zk-tint p-4" role="status">
        <p className="text-sm font-medium text-zk-text">{result.message}</p>
        <Link href="/points/disputes" className="text-sm font-medium text-zk-accent hover:underline">
          See your disputes →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="bugNumber" className="block text-sm font-medium text-zk-text">
          Issue number
        </label>
        <Input
          id="bugNumber"
          name="bugNumber"
          type="number"
          min={1}
          defaultValue={defaultBugNumber}
          placeholder="42"
          required
          aria-invalid={error?.field === "bugNumber" || undefined}
          aria-describedby={error ? "dispute-form-error" : undefined}
        />
      </div>

      <fieldset className="space-y-1">
        <legend className="text-sm font-medium text-zk-text">What&apos;s wrong?</legend>
        <div className="flex flex-col gap-2 pt-1">
          <label className="flex items-center gap-2 text-sm text-zk-text2">
            <input
              type="radio"
              name="kind"
              value="missing"
              checked={kind === "missing"}
              onChange={() => setKind("missing")}
            />
            An award is missing (I solved or reported it, but got no points)
          </label>
          <label className="flex items-center gap-2 text-sm text-zk-text2">
            <input
              type="radio"
              name="kind"
              value="wrong"
              checked={kind === "wrong"}
              onChange={() => setKind("wrong")}
            />
            An entry is wrong (points look off, or the role is wrong)
          </label>
        </div>
      </fieldset>

      {kind === "missing" ? (
        <div className="space-y-1">
          <label htmlFor="role" className="block text-sm font-medium text-zk-text">
            Which award is missing?
          </label>
          <Select id="role" name="role" defaultValue="solver">
            <option value="solver">Solver award (for resolving it)</option>
            <option value="reporter">Reporter award (for reporting it)</option>
          </Select>
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor="pointEntryId" className="block text-sm font-medium text-zk-text">
            Points entry id
          </label>
          <Input
            id="pointEntryId"
            name="pointEntryId"
            defaultValue={defaultEntryId}
            placeholder="Entry id from your ledger"
            required
            aria-invalid={error?.field === "pointEntryId" || undefined}
          />
          <p className="text-xs text-zk-muted">
            Find it under “Your ledger entries” on the disputes page, then press Dispute.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="reason" className="block text-sm font-medium text-zk-text">
          Why?
        </label>
        <Textarea
          id="reason"
          name="reason"
          rows={3}
          maxLength={1000}
          placeholder="I resolved #42 on Tuesday but no solver $ appeared."
          required
          aria-invalid={error?.field === "reason" || undefined}
          aria-describedby={error ? "dispute-form-error" : undefined}
        />
      </div>

      {error ? (
        <p id="dispute-form-error" className="text-sm text-zk-bad-fg" role="alert">
          {error.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Opening…" : "Open dispute"}
      </Button>
    </form>
  );
}
