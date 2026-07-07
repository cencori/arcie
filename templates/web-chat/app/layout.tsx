import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arcie",
  description: "Chat with your arcie agent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full dark" suppressHydrationWarning>
      <body className="h-full">{children}</body>
    </html>
  );
}
