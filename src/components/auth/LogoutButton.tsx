import { LogOut } from "lucide-react";
import { logout } from "@/server/actions/auth";
import { Button } from "@/components/ui/Button";

/** A small form, so logging out works even before the page's scripts have loaded. */
export function LogoutButton({ variant = "ghost" }: { variant?: "ghost" | "secondary" }) {
  return (
    <form action={logout}>
      <Button type="submit" variant={variant}>
        <LogOut size={16} aria-hidden />
        Log out
      </Button>
    </form>
  );
}
