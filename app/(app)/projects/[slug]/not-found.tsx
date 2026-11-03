import Link from "next/link";
import { StatusPage, primaryActionClass } from "@/components/status-page";
import { EmptyStateRobot } from "@/components/whimsical-empty-state";

/**
 * The same page whether the project doesn't exist or the viewer can't manage
 * it, so a slug doesn't reveal which projects a workspace has.
 */
export default function ProjectNotFound() {
  return (
    <StatusPage
      code="404"
      title="We couldn't find that project"
      illustration={<EmptyStateRobot variant="compass" />}
      actions={
        <Link href="/home" className={primaryActionClass}>
          Your issues
        </Link>
      }
    >
      <p>The link may be wrong, or only this workspace&apos;s admins can manage the project.</p>
    </StatusPage>
  );
}
