import Link from "next/link";
import { StatusPage, primaryActionClass } from "@/components/status-page";
import { EmptyStateRobot } from "@/components/whimsical-empty-state";

/** A redesign proposal that doesn't exist or belongs to another workspace. */
export default function RedesignNotFound() {
  return (
    <StatusPage
      code="404"
      title="We couldn't find that redesign proposal"
      illustration={<EmptyStateRobot variant="compass" />}
      actions={
        <Link href="/inbox?tab=escalations" className={primaryActionClass}>
          Escalations
        </Link>
      }
    >
      <p>The link may be wrong, or the proposal may belong to another workspace.</p>
    </StatusPage>
  );
}
