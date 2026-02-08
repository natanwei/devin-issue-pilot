import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Devin Issue Pilot",
  description: "Scope and fix GitHub issues with Devin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
