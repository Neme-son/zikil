"use client";

import { useActionState, useState } from "react";
import { creditAwardsAction, type DisputeActionResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

/** An admin credits missing solver or reporter awards by issue number. */
export function CreditAwardsForm() {
  const toast = useToast();
  const [numbers, setNumbers] = useState("");
  const [result, action, pending] = useActionState<DisputeActionResult | undefined, FormData>(
    async (previous, formData) => {
      const next = await creditAwardsAction(previous, formData);
      if (next.ok) {
        toast(next.message);
        setNumbers("");
      }
      return next;
    },
    undefined,
  );
  const error = result && !result.ok ? result : null;

  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="space-y-1">
        <label htmlFor="credit-numbers" className="block text-xs font-medium text-zk-text2">
          Issue numbers
        </label>
        <Textarea
          id="credit-numbers"
          name="numbers"
          value={numbers}
          onChange={(event) => setNumbers(event.target.value)}
          rows={2}
          placeholder="269, 270, 10, 271, 272, 273"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="credit-role" className="sr-only">
          Which award to credit
        </label>
        <Select id="credit-role" name="role" defaultValue="solver" className="w-auto">
          <option value="solver">Solver award</option>
          <option value="reporter">Reporter award</option>
        </Select>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Credit awards"}
        </Button>
      </div>
      <p className="text-xs text-zk-muted">
        The solver&apos;s reward needs a resolved or closed issue with an assignee. The reporter&apos;s $ are
        withheld on duplicates. An award that is already in the ledger is not added again.
      </p>
      {error ? (
        <p className="text-sm text-zk-bad-fg" role="alert">
          {error.error}
        </p>
      ) : null}
      {result?.ok ? <p className="text-sm text-zk-text2">{result.message}</p> : null}
    </form>
  );
}
