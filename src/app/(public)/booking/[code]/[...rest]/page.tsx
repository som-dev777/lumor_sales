import { notFound } from "next/navigation";

// Anything added to the end of a booking address shows the public "link doesn't work" page,
// not the app's own (D-042).
export default function ExtraPath() {
  notFound();
}
