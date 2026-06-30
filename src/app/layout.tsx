import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/nav/Sidebar";

export const metadata: Metadata = {
  title: "Talent Trop — Scout Dashboard",
  description: "Polish sports talent scouting dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="flex h-full" style={{ backgroundColor: "var(--color-bg)" }}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
