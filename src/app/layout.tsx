import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A股/基金智能看板 | Ashare Picks",
  description:
    "多因子个股推荐 · 板块三维分析 · ETF净值走势 · 持仓操作建议。数据仅供学习研究，不构成投资建议。",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
