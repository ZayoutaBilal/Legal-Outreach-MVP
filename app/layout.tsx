import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal Outreach MVP",
  description: "SaaS MVP to automate outreach emails to lawyers."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
