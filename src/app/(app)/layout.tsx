import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Sidebar } from "@/components/shell/Sidebar";
import { SignedInSidebar } from "@/components/shell/SignedInSidebar";

// Every signed-in page shares this frame. The frame appears at once; the user-specific
// sidebar (role, name, Log out) streams in, and its sign-in check protects every page.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell
      sidebar={
        <Suspense fallback={<Sidebar role={null} />}>
          <SignedInSidebar />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
