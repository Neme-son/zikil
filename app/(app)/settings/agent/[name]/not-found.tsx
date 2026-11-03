import Link from "next/link";
import { StatusPage, primaryActionClass } from "@/components/status-page";
import { EmptyStateRobot } from "@/components/whimsical-empty-state";

/** An agent that doesn't exist, was revoked, or isn't one the viewer may message. */
export default function AgentNotFound() {
  return (
    <StatusPage
      code="404"
      title="We couldn't find that agent"
      illustration={<EmptyStateRobot variant="compass" />}
      actions={
        <Link href="/agents" className={primaryActionClass}>
          Your agents
        </Link>
      }
    >
      <p>The link may be wrong, or the agent may have been revoked or belong to someone else.</p>
    </StatusPage>
  );
}
