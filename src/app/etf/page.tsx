"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EtfQuote, NavPoint } from "@/lib/types";
import { NavChart } from "@/components/NavChart";
import {
  NavBar,
  SiteHeader,
  fmtPct,
  fmtPrice,
  fmtYi,
  pctClass,
} from "@/components/ui";

export default function EtfPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [list, setList] = useState<EtfQuote[]>([]);
  const [sort, setSort] = useState<"amount" | "change">("amount");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<EtfQuote | null>(null);
  const [series, setSeries] = useState<NavPoint[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [filter, setFilter] = useState<"all" | "theme" | "broad" | "money">(
    "all"
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const url = q.trim()
        ? `/api/etf?q=${encodeURIComponent(q.trim())}`
        : `/api/etf?sort=${sort}&limit=80`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "加载失败");
      setList(data.list || []);
      setUpdatedAt(data.updatedAt || "");
      setSelected((prev) => {
        if (!prev) return data.list?.[0] || null;
        return (
          (data.list || []).find((x: EtfQuote) => x.code === prev.code) ||
          data.list?.[0] ||
          null
        );
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [q, sort]);

  const loadDetail = useCallback(async (code: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/etf?code=${code}&days=60`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.ok) {
        setSeries(data.series || []);
        if (data.quote) {
          setSelected((prev) =>
            prev
              ? {
                  ...prev,
                  price: data.quote.price,
                  changePercent: data.quote.changePercent,
                  name: data.quote.name || prev.name,
                  amount: data.quote.amount || prev.amount,
                  high: data.quote.high,
                  low: data.quote.low,
                  open: data.quote.open,
                  prevClose: data.quote.prevClose,
                }
              : prev
          );
        }
      }
    } catch {
      setSeries([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 45_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (selected?.code) loadDetail(selected.code);
  }, [selected?.code, loadDetail]);

  const filtered = useMemo(() => {
    if (filter === "all") return list;
    return list.filter((e) => {
      const n = e.name;
      if (filter === "money")
        return /日利|添益|货币|债|国债|城投|短融/.test(n);
      if (filter === "broad")
        return /300|500|1000|A50|A500|50ETF|红利|创业板|科创50|中证/.test(n);
      // theme: 排除货币债 + 宽基噪声，保留行业主题
      return (
        !/日利|添益|货币|债/.test(n) &&
        !/300ETF|500ETF|1000|红利|沪深300|中证500|上证50$/.test(n)
      );
    });
  }, [list, filter]);

  const updatedText = useMemo(() => {
    if (!updatedAt) return "";
    try {
      return new Date(updatedAt).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });
    } catch {
      return updatedAt;
    }
  }, [updatedAt]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
      <NavBar />
      <SiteHeader
        title="ETF / 场内基金"
        subtitle="实时行情 + 净值/收盘走势图。可搜索芯片、半导体、红利、沪深300 等。45 秒自动刷新。"
        onRefresh={load}
        loading={loading}
        updatedText={updatedText}
      />

      <section className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            className={`btn ${sort === "amount" ? "btn-active" : ""}`}
            onClick={() => setSort("amount")}
          >
            按成交额
          </button>
          <button
            className={`btn ${sort === "change" ? "btn-active" : ""}`}
            onClick={() => setSort("change")}
          >
            按涨跌幅
          </button>
          {(
            [
              ["all", "全部"],
              ["theme", "主题/行业"],
              ["broad", "宽基/红利"],
              ["money", "货币/债"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              className={`btn ${filter === k ? "btn-active" : ""}`}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="搜索：芯片 / 512480 / 红利"
            className="min-w-[220px] flex-1 rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <button className="btn btn-active" onClick={load} disabled={loading}>
            搜索
          </button>
        </div>
      </section>

      {err ? (
        <div className="panel mb-5 border-red-500/30 p-4 text-sm text-red-300">
          告。加载失败：{err}
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-medium">
              ETF 列表 {filtered.length ? `· ${filtered.length}` : ""}
            </h2>
            <span className="text-xs text-[var(--muted)]">点击查看走势</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-white/[0.02] text-xs text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-normal">名称</th>
                  <th className="px-3 py-2 font-normal">现价</th>
                  <th className="px-3 py-2 font-normal">涨跌幅</th>
                  <th className="px-3 py-2 font-normal">成交额</th>
                  <th className="px-3 py-2 font-normal">换手</th>
                </tr>
              </thead>
              <tbody>
                {loading && !filtered.length
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={5} className="px-3 py-3">
                          <div className="skeleton h-6 w-full" />
                        </td>
                      </tr>
                    ))
                  : filtered.map((e) => (
                      <tr
                        key={e.code}
                        onClick={() => setSelected(e)}
                        className={`cursor-pointer border-t border-[var(--line)] transition hover:bg-white/[0.03] ${
                          selected?.code === e.code ? "bg-blue-500/10" : ""
                        }`}
                      >
                        <td className="px-3 py-3">
                          <div className="font-medium">{e.name}</div>
                          <div className="text-xs text-[var(--muted)]">
                            {e.market}.{e.code}
                          </div>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {fmtPrice(e.price)}
                        </td>
                        <td
                          className={`px-3 py-3 tabular-nums ${pctClass(e.changePercent)}`}
                        >
                          {fmtPct(e.changePercent)}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                          {fmtYi(e.amount)}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                          {e.turnover ? `${e.turnover.toFixed(2)}%` : "-"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="panel p-4 md:p-5">
          {selected ? (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-[var(--muted)]">当前标的</div>
                  <h3 className="mt-1 text-xl font-semibold">
                    {selected.name}
                    <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                      {selected.market}.{selected.code}
                    </span>
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmtPrice(selected.price)}
                  </div>
                  <div
                    className={`tabular-nums ${pctClass(selected.changePercent)}`}
                  >
                    {fmtPct(selected.changePercent)}
                  </div>
                </div>
              </div>

              <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
                <Mini label="开盘" value={fmtPrice(selected.open)} />
                <Mini label="昨收" value={fmtPrice(selected.prevClose)} />
                <Mini label="最高" value={fmtPrice(selected.high)} />
                <Mini label="最低" value={fmtPrice(selected.low)} />
                <Mini label="成交额" value={fmtYi(selected.amount)} />
                <Mini
                  label="换手"
                  value={
                    selected.turnover
                      ? `${selected.turnover.toFixed(2)}%`
                      : "-"
                  }
                />
              </div>

              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm text-[var(--muted)]">
                  近 60 日净值/收盘走势
                </div>
                {detailLoading ? (
                  <span className="text-xs text-[var(--muted)]">加载中…</span>
                ) : null}
              </div>
              <NavChart data={series} height={220} />
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                走势优先用交易所日 K（更贴近实时交易价）；场内基金单位净值日终更新，可能与盘中价有小幅折溢价。
              </p>
            </>
          ) : (
            <div className="text-sm text-[var(--muted)]">
              {loading ? "加载中…" : "选择一只 ETF 查看走势"}
            </div>
          )}
        </aside>
      </section>

      <footer className="mt-8 text-xs leading-6 text-[var(--muted)]">
        <p>ETF 数据仅供学习研究，不构成投资建议。股市有风险，入市需谨慎。</p>
      </footer>
    </main>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white/[0.02] px-3 py-2">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
