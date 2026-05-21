import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "即梦工坊 · AI 视频创作",
  description: "项目化管理多条生成记录，从脚本、分镜到合成导出的一站式 AI 视频创作平台。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
