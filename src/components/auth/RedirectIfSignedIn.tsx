import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";

/** On the login page: someone already signed in goes straight into the app. */
export async function RedirectIfSignedIn() {
  const viewer = await getViewer();
  if (viewer?.active) redirect(viewer.mustChangePassword ? "/change-password" : "/");
  return null;
}
