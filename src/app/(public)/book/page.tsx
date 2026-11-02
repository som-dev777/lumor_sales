import { notFound } from "next/navigation";

// The address without a rep or code: the public "link doesn't work" page (D-042).
export default function Bare() {
  notFound();
}
