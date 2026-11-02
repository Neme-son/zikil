import "../settings-design.css";
import Link from "next/link";
import { DisplayNameForm } from "@/components/display-name-form";
import { ProfileAvatarUpload } from "@/components/profile-avatar-upload";
import { requireUser } from "@/lib/auth-helpers";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <div className="profile-page settings-design mx-auto flex w-full flex-col gap-6 pb-10">
      <div className="flex flex-col gap-2.5">
        <Link
          href="/settings?section=account"
          className="inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-semibold text-zk-accent hover:underline"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to settings
        </Link>
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em] text-zk-text">Profile</h1>
        <p className="m-0 text-sm text-zk-muted">
          Manage how your name and avatar appear on issues and comments.
        </p>
      </div>

      <section className="flex flex-col gap-5 rounded-[20px] border border-zk-border bg-zk-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-lg font-bold text-zk-text">Your profile</h2>
            <span className="text-[13px] text-zk-muted">How you appear to everyone in the workspace.</span>
          </div>
          <Link
            href={`/users/${user.id}`}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-full border border-zk-border px-3.5 text-[13px] font-bold text-zk-text hover:bg-zk-chip"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            See how others see you
          </Link>
        </div>

        <ProfileAvatarUpload initialImage={user.image} name={user.name} />

        <div className="border-t border-zk-divider pt-4">
          <DisplayNameForm initialName={user.name ?? ""} initialImage={user.image} showAvatar={false} />
        </div>

        <div className="space-y-1 border-t border-zk-divider pt-4">
          <p className="text-sm font-bold text-zk-text">Email</p>
          <p className="break-words text-sm text-zk-text2">{user.email}</p>
          <p className="text-xs text-zk-muted">Your sign-in email cannot be changed here.</p>
        </div>
      </section>
    </div>
  );
}
