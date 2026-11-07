import Link from "next/link";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/skip-link";
import { PAGE_CONTAINER_CLASS } from "@/components/page-container";

export default function PublicProjectLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink />
      <header className="border-b border-zk-border bg-zk-surface">
        <div className={`${PAGE_CONTAINER_CLASS} flex min-h-16 items-center justify-between gap-4`}>
          <Link href="/" className="text-xl font-extrabold tracking-tight text-zk-text">Ziki</Link>
          <nav aria-label="Public project navigation" className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/discover" className="text-zk-text2 hover:text-zk-text">Discover</Link>
            <Link href="/login" className="text-zk-accent hover:underline">Sign in</Link>
          </nav>
        </div>
      </header>
      <main id={MAIN_CONTENT_ID} className={`${PAGE_CONTAINER_CLASS} flex-1 py-8`}>
        {children}
      </main>
      <footer className="border-t border-zk-border py-5 text-center text-xs text-zk-muted">
        Public project pages expose only fields approved for signed-out visitors.
      </footer>
    </div>
  );
}
