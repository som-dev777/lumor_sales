import { AppShell } from "@/components/shell/AppShell";
import { Sidebar } from "@/components/shell/Sidebar";

// Every signed-in page shares this frame. In R1 Step 7 the role comes from the signed-in
// user, and Admin-only items are hidden from Users (the pages also check on the server).
// Until then the sidebar shows every item.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell sidebar={<Sidebar role="Admin" />}>{children}</AppShell>;
}
