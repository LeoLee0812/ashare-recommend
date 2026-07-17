"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MarketOverview,
  RecommendItem,
  StrategyKey,
  StrategyMeta,
  StockQuote,
} from "@/lib/types";
import { NavBar } from "@/components/ui";

function fmtPrice(n: number) {
  if (!Number.isFinite(n)) return "-";
  return n >= 100 ? n.toFixed(2) : n.toFixed(2);
}

function fmtPct(n: number) {
  if (!Number.isFinite(n)) return "-";
  const s = n.toFixed(2);
  return n > 0 ? `+${s}%` : `${s}%`;
}

function fmtYi(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "-";
  return `${(n / 1e8).toFixed(2)}亿`;
}

function pctClass(n: number) {
  if (n > 0.01) return "up";
  if (n < -0.01) return "down";
  return "flat";
}

function tagClass(tag: string) {
  if (["涨停", "大涨", "放量", "资金热", "强动量", "高换手"].includes(tag))
    return "tag tag-hot";
  if (["低估值", "相对稳健"].includes(tag)) return "tag tag-good";
  if (["大盘股", "科创板", "创业板"].includes(tag)) return "tag tag-gold";
  return "tag";
}

function FactorBars({ item }: { item: RecommendItem }) {
  const rows = [
    { k: "动量", v: item.factorScores.momentum },
    { k: "资金", v: item.factorScores.volume },
    { k: "估值", v: item.factorScores.valuation },
    { k: "热度", v: item.factorScores.activity },
    { k: "稳健", v: item.factorScores.stability },
  ];
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <div key={r.k} className="grid grid-cols-[40px_1fr_36px] items-center gap-2 text-xs">
          <span className="text-[var(--muted)]">{r.k}</span>
          <div className="score-bar">
            <i style={{ width: `${Math.min(100, r.v)}%` }} />
          </div>
          <span className="text-right tabular-nums text-[var(--muted)]">
            {r.v.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [strategy, setStrategy] = useState<StrategyKey>("balanced");
  const [strategies, setStrategies] = useState<StrategyMeta[]>([]);
  const [list, setList] = useState<RecommendItem[]>([]);
  const [overview, setOverview] = useState<MarketOverview | null>(null);
  const [universe, setUniverse] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState<RecommendItem | null>(null);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<StockQuote[]>([]);
  const [disclaimer, setDisclaimer] = useState("");

  const load = useCallback(async (s: StrategyKey) => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/recommend?strategy=${s}&top=20`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "加载失败");
      setList(data.list || []);
      setOverview(data.overview || null);
      setStrategies(data.strategies || []);
      setUniverse(data.universe || 0);
      setDisclaimer(data.disclaimer || "");
      setSelected((prev) => {
        if (!prev) return data.list?.[0] || null;
        const found = (data.list || []).find(
          (x: RecommendItem) => x.code === prev.code
        );
        return found || data.list?.[0] || null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(strategy);
    // 交易时段更勤；统一 45s 自动刷新（服务端缓存约 30–60s）
    const t = setInterval(() => load(strategy), 45_000);
    return () => clearInterval(t);
  }, [strategy, load]);

  const onSearch = async () => {
    const kw = q.trim();
    if (!kw) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/stocks?q=${encodeURIComponent(kw)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setSearchHits(data.list || []);
    } catch {
      setSearchHits([]);
    } finally {
      setSearching(false);
    }
  };

  const updatedText = useMemo(() => {
    if (!overview?.updatedAt) return "";
    try {
      return new Date(overview.updatedAt).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });
    } catch {
      return overview.updatedAt;
    }
  }, [overview]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-10">
      <NavBar />
      {/* Header */}
      <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/5 px-3 py-1 text-xs text-[var(--muted)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            实时数据 · 多因子打分 · 学习研究用途
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            A股智能推荐
            <span className="ml-2 text-base font-normal text-[var(--muted)]">
              Ashare Picks
            </span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            基于东方财富公开行情，对沪深 A 股做动量 / 资金 / 估值 / 热度 / 稳健五维评分。
            另含板块三维分析、ETF 净值走势、持仓操作建议（基金视角）。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={() => load(strategy)} disabled={loading}>
            {loading ? "刷新中…" : "立即刷新"}
          </button>
          <div className="text-xs text-[var(--muted)]">
            {overview?.trading ? (
              <span className="up">交易时段</span>
            ) : (
              <span>非交易时段 / 收盘数据</span>
            )}
            {updatedText ? <div className="mt-1">更新：{updatedText}</div> : null}
          </div>
        </div>
      </header>

      {/* Market overview */}
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        {[
          overview?.shIndex,
          overview?.szIndex,
          overview?.cybIndex,
        ].map((idx, i) => (
          <div key={i} className="panel p-4">
            {idx ? (
              <>
                <div className="text-sm text-[var(--muted)]">{idx.name}</div>
                <div className="mt-1 flex items-end justify-between">
                  <div className="text-2xl font-semibold tabular-nums">
                    {fmtPrice(idx.price)}
                  </div>
                  <div className={`text-lg font-medium tabular-nums ${pctClass(idx.changePercent)}`}>
                    {fmtPct(idx.changePercent)}
                  </div>
                </div>
              </>
            ) : (
              <div className="skeleton h-14 w-full" />
            )}
          </div>
        ))}
      </section>

      {overview ? (
        <section className="panel mb-6 grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-6">
          <Stat label="样本股票" value={String(universe || overview.total)} />
          <Stat label="上涨" value={String(overview.upCount)} tone="up" />
          <Stat label="下跌" value={String(overview.downCount)} tone="down" />
          <Stat label="平盘" value={String(overview.flatCount)} />
          <Stat label="涨停" value={String(overview.limitUp)} tone="up" />
          <Stat label="跌停" value={String(overview.limitDown)} tone="down" />
        </section>
      ) : null}

      {/* Strategy + search */}
      <section className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(strategies.length
            ? strategies
            : [
                { key: "balanced", name: "均衡精选", desc: "" },
                { key: "momentum", name: "强势动量", desc: "" },
                { key: "value", name: "低估稳健", desc: "" },
                { key: "hot", name: "热度资金", desc: "" },
              ]
          ).map((s) => (
            <button
              key={s.key}
              className={`btn ${strategy === s.key ? "btn-active" : ""}`}
              title={s.desc}
              onClick={() => setStrategy(s.key as StrategyKey)}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            placeholder="搜索代码 / 名称，如 600519 或 茅台"
            className="min-w-[220px] flex-1 rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <button className="btn btn-active" onClick={onSearch} disabled={searching}>
            {searching ? "搜…" : "搜索"}
          </button>
        </div>
      </section>

      {searchHits.length > 0 ? (
        <section className="panel mb-5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">搜索结果</h2>
            <button className="btn" onClick={() => setSearchHits([])}>
              关闭
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {searchHits.map((s) => (
              <div
                key={s.code}
                className="rounded-xl border border-[var(--line)] bg-white/[0.02] p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {s.market}.{s.code}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums">{fmtPrice(s.price)}</div>
                    <div className={`text-sm tabular-nums ${pctClass(s.changePercent)}`}>
                      {fmtPct(s.changePercent)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {err ? (
        <div className="panel mb-5 border-red-500/30 p-4 text-sm text-red-300">
          告。加载失败：{err}
        </div>
      ) : null}

      {/* Main content */}
      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-medium">推荐榜 TOP {list.length || 20}</h2>
            <span className="text-xs text-[var(--muted)]">
              点击查看因子拆解
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-white/[0.02] text-xs text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2 font-normal">#</th>
                  <th className="px-3 py-2 font-normal">股票</th>
                  <th className="px-3 py-2 font-normal">现价</th>
                  <th className="px-3 py-2 font-normal">涨跌幅</th>
                  <th className="px-3 py-2 font-normal">成交额</th>
                  <th className="px-3 py-2 font-normal">换手</th>
                  <th className="px-3 py-2 font-normal">PE</th>
                  <th className="px-3 py-2 font-normal">得分</th>
                </tr>
              </thead>
              <tbody>
                {loading && !list.length
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={8} className="px-3 py-3">
                          <div className="skeleton h-6 w-full" />
                        </td>
                      </tr>
                    ))
                  : list.map((item) => (
                      <tr
                        key={item.code}
                        onClick={() => setSelected(item)}
                        className={`cursor-pointer border-t border-[var(--line)] transition hover:bg-white/[0.03] ${
                          selected?.code === item.code ? "bg-blue-500/10" : ""
                        }`}
                      >
                        <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                          {item.rank}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{item.name}</div>
                          <div className="text-xs text-[var(--muted)]">
                            {item.market}.{item.code}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.tags.slice(0, 3).map((t) => (
                              <span key={t} className={tagClass(t)}>
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 tabular-nums">{fmtPrice(item.price)}</td>
                        <td className={`px-3 py-3 tabular-nums ${pctClass(item.changePercent)}`}>
                          {fmtPct(item.changePercent)}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                          {fmtYi(item.amount)}
                        </td>
                        <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                          {item.turnover.toFixed(2)}%
                        </td>
                        <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                          {item.pe > 0 ? item.pe.toFixed(1) : "-"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold tabular-nums text-sky-300">
                            {item.score.toFixed(1)}
                          </div>
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
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-[var(--muted)]">当前选中</div>
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
                  <div className={`tabular-nums ${pctClass(selected.changePercent)}`}>
                    {fmtPct(selected.changePercent)}
                  </div>
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
                <Mini label="开盘" value={fmtPrice(selected.open)} />
                <Mini label="昨收" value={fmtPrice(selected.prevClose)} />
                <Mini label="最高" value={fmtPrice(selected.high)} />
                <Mini label="最低" value={fmtPrice(selected.low)} />
                <Mini label="成交额" value={fmtYi(selected.amount)} />
                <Mini label="量比" value={selected.volumeRatio.toFixed(2)} />
                <Mini
                  label="总市值"
                  value={selected.totalMV ? fmtYi(selected.totalMV) : "-"}
                />
                <Mini
                  label="PB"
                  value={selected.pb > 0 ? selected.pb.toFixed(2) : "-"}
                />
              </div>

              <div className="mb-4">
                <div className="mb-2 text-sm text-[var(--muted)]">综合得分</div>
                <div className="mb-2 text-3xl font-semibold tabular-nums text-sky-300">
                  {selected.score.toFixed(1)}
                </div>
                <FactorBars item={selected} />
              </div>

              <div className="mb-4">
                <div className="mb-2 text-sm text-[var(--muted)]">推荐理由</div>
                <ul className="space-y-2 text-sm leading-6 text-[#d7e3ff]">
                  {selected.reasons.map((r, i) => (
                    <li key={i} className="rounded-lg bg-white/[0.03] px-3 py-2">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-1">
                {selected.tags.map((t) => (
                  <span key={t} className={tagClass(t)}>
                    {t}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-[var(--muted)]">
              {loading ? "加载推荐中…" : "暂无选中股票"}
            </div>
          )}
        </aside>
      </section>

      <footer className="mt-8 space-y-2 text-xs leading-6 text-[var(--muted)]">
        <p>
          {disclaimer ||
            "本站数据仅供学习研究，不构成任何投资建议。股市有风险，入市需谨慎。"}
        </p>
        <p>
          数据源：东方财富 / 腾讯财经公开接口 · 策略可切换 · 服务端缓存约 60 秒 ·
          由 Leo 服务器部署
        </p>
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "up" ? "up" : tone === "down" ? "down" : ""
        }`}
      >
        {value}
      </div>
    </div>
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
