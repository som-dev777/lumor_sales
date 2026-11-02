import { redirect } from "next/navigation";

/** The old address of Calendar → Events (renamed in 2.7.0, D-043). */
export default function OldMeetingTypesPage() {
  redirect("/calendar/events");
}
