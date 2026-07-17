"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "个股推荐" },
  { href: "/sectors", label: "板块分析" },
  { href: "/etf", label: "ETF/基金" },
  { href: "/holdings", label: "我的持仓" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <nav className="mb-5 flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active =
          t.href === "/"
            ? pathname === "/"
            : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`btn ${active ? "btn-active" : ""}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteHeader({
  title,
  subtitle,
  badge,
  onRefresh,
  loading,
  updatedText,
  trading,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  onRefresh?: () => void;
  loading?: boolean;
  updatedText?: string;
  trading?: boolean;
}) {
  return (
    <header className="mb-4 flex flex-col gap-4 md:mb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/5 px-3 py-1 text-xs text-[var(--muted)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          {badge || "实时数据 · 基金视角 · 学习研究用途"}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh ? (
          <button className="btn" onClick={onRefresh} disabled={loading}>
            {loading ? "刷新中…" : "立即刷新"}
          </button>
        ) : null}
        <div className="text-xs text-[var(--muted)]">
          {trading === true ? (
            <span className="up">交易时段 · 自动刷新</span>
          ) : trading === false ? (
            <span>非交易时段 / 收盘数据</span>
          ) : null}
          {updatedText ? <div className="mt-1">更新：{updatedText}</div> : null}
        </div>
      </div>
    </header>
  );
}

export function fmtPrice(n: number, digits = 3) {
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(digits);
}

export function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "-";
  const s = n.toFixed(2);
  return n > 0 ? `+${s}%` : `${s}%`;
}

export function fmtYi(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${(n / 1e8).toFixed(2)}亿`;
}

export function pctClass(n: number) {
  if (n > 0.01) return "up";
  if (n < -0.01) return "down";
  return "flat";
}

export function actionClass(action: string) {
  if (["加仓", "分批建仓"].includes(action)) return "tag tag-good";
  if (["减仓", "止盈", "止损观察"].includes(action)) return "tag tag-hot";
  if (action === "观望") return "tag tag-gold";
  return "tag";
}
