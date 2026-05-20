import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FrameForge AI Video Platform",
  description: "AI video generation SaaS platform for creators and operators."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
