import { formatZ, REWARD_MAX_ESTIMATES } from "@/lib/points/rules";

/**
 * An issue's reward in the list (#rewards): what solving it pays, in $. The
 * amount alone; how far the estimating has got is in its title.
 */
export function RewardBadge({ reward, estimates, fixed }: { reward: number; estimates: number; fixed: boolean }) {
  const label = fixed
    ? `Reward ${formatZ(reward)}, fixed`
    : estimates === 0
      ? `Reward ${formatZ(reward)}, not estimated yet`
      : `Reward ${formatZ(reward)}, ${estimates} of ${REWARD_MAX_ESTIMATES} estimates`;
  return (
    <span className="inline-flex items-center" title={label} aria-label={label} data-testid="reward">
      <span className={`font-mono text-[14px] font-bold tabular-nums ${fixed ? "text-zk-text" : "text-zk-ok-fg"}`}>{formatZ(reward)}</span>
    </span>
  );
}
