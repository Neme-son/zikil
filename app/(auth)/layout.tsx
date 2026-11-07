import type { ReactNode } from "react";
import { VersionFooter } from "@/components/version-footer";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zk-bg">
      <div className="flex flex-1 flex-col">{children}</div>
      <VersionFooter className="border-t border-zk-divider px-4 py-4" />
    </div>
  );
}
