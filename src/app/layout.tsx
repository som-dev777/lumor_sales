import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.scss";

// Inter for the whole platform.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Bricolage Grotesque only for the "Sales Hub" wordmark.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: "600",
});

export const metadata: Metadata = {
  title: { default: "Lumor Sales Hub", template: "%s · Lumor Sales Hub" },
  description: "Lumor's internal sales hub for LinkedIn prospecting.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  );
}
