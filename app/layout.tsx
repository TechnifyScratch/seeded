import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Seeded · Developmental research",
  description:
    "Observe a bounded developmental AI experiment. Recorded information, explicit decisions, and an auditable history.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
