import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, SlidersHorizontal, Users } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import styles from "./settings.module.scss";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  {
    href: "/settings/users",
    title: "Users",
    description: "Invite people, change roles, deactivate and reactivate. Admin only.",
    icon: Users,
  },
  {
    href: "/settings/product-facts",
    title: "Product Facts",
    description: "The only facts the AI may use about Lumor. Everyone reads; Admin edits.",
    icon: BookOpenCheck,
  },
  {
    href: "/settings/playbook",
    title: "Playbook Settings",
    description: "Follow-up delays and daily targets. Everyone reads; Admin edits.",
    icon: SlidersHorizontal,
  },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <div className={styles.grid}>
        {SECTIONS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className={styles.card}>
            <Icon size={20} className={styles.icon} aria-hidden />
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.description}>{description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
