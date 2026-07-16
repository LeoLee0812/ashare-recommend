import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A股智能推荐 | Asharе Picks",
  description:
    "多因子 A 股推荐看板：均衡精选 / 强势动量 / 低估稳健 / 热度资金。数据仅供学习研究，不构成投资建议。",
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
