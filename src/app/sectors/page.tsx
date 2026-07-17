"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SectorAnalysis, SectorBoard } from "@/lib/types";
import { NavBar, SiteHeader, fmtPct, fmtYi, pctClass, actionClass } from "@/components/ui";

export default function SectorsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"industry" | "concept" | "all">("all");
  const [sectors, setSectors] = useState<SectorBoard[]>([]);
  const [gainers, setGainers] = useState<SectorBoard[]>([]);
  const [losers, setLosers] = useState<SectorBoard[]>([]);
  const [focusBoards, setFocusBoards] = useState<SectorBoard[]>([]);
  const [analyses, setAnalyses] = useState<SectorAnalysis[]>([]);
  const [selected, setSelected] = useState<SectorAnalysis | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [disclaimer, setDisclaimer] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`/api/sectors?type=${tab}&limit=50`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "加载失败");
      setSectors(data.sectors || []);
      setGainers(data.topGainers || []);
      setLosers(data.topLosers || []);
      setFocusBoards(data.focusBoards || []);
      setAnalyses(data.analyses || []);
      setUpdatedAt(data.updatedAt || "");
      setDisclaimer(data.disclaimer || "");
      setSelected((prev) => {
        if (!prev) return data.analyses?.[0] || null;
        return (
          (data.analyses || []).find(
            (a: SectorAnalysis) => a.code === prev.code
          ) ||
          data.analyses?.[0] ||
          null
        );
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

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
        title="板块三维分析"
        subtitle="技术面 · 消息面 · 政策面，重点覆盖持仓相关板块（半导体/通信/电子等）。基金视角操作提示，非投资建议。"
        onRefresh={load}
        loading={loading}
        updatedText={updatedText}
        trading={undefined}
      />

      <section className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["all", "全部"],
            ["industry", "行业"],
            ["concept", "概念"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={`btn ${tab === k ? "btn-active" : ""}`}
            onClick={() => setTab(k)}
          >
            {label}
          </button>
        ))}
      </section>

      {err ? (
        <div className="panel mb-5 border-red-500/30 p-4 text-sm text-red-300">
          告。加载失败：{err}
        </div>
      ) : null}

      {focusBoards.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-3 text-sm font-medium text-[var(--muted)]">
            持仓相关 / 焦点板块
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {focusBoards.slice(0, 8).map((b) => (
              <button
                key={b.code}
                className="panel p-4 text-left transition hover:border-blue-400/40"
                onClick={() => {
                  const a = analyses.find((x) => x.code === b.code);
                  if (a) setSelected(a);
                }}
              >
                <div className="text-sm text-[var(--muted)]">{b.name}</div>
                <div className="mt-1 flex items-end justify-between">
                  <div className="text-lg font-semibold tabular-nums">
                    {b.price?.toFixed?.(2) ?? "-"}
                  </div>
                  <div
                    className={`text-lg font-medium tabular-nums ${pctClass(b.changePercent)}`}
                  >
                    {fmtPct(b.changePercent)}
                  </div>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  成交额 {fmtYi(b.amount)}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mb-5 grid gap-4 lg:grid-cols-2">
        <BoardList title="涨幅榜" list={gainers} tone="up" />
        <BoardList title="跌幅榜" list={losers} tone="down" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-medium">
            三维分析列表（点击查看）
          </div>
          <div className="divide-y divide-[var(--line)]">
            {loading && !analyses.length
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="p-4">
                    <div className="skeleton h-12 w-full" />
                  </div>
                ))
              : analyses.map((a) => (
                  <button
                    key={a.code}
                    onClick={() => setSelected(a)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/[0.03] ${
                      selected?.code === a.code ? "bg-blue-500/10" : ""
                    }`}
                  >
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className={actionClass(a.fundView.action)}>
                          {a.fundView.action}
                        </span>
                        <span className="tag">
                          技术 {a.technical.score}
                        </span>
                        <span className="tag">消息 {a.news.score}</span>
                        <span className="tag">政策 {a.policy.score}</span>
                      </div>
                    </div>
                    <div
                      className={`text-lg font-semibold tabular-nums ${pctClass(a.changePercent)}`}
                    >
                      {fmtPct(a.changePercent)}
                    </div>
                  </button>
                ))}
          </div>
        </div>

        <aside className="panel p-4 md:p-5">
          {selected ? (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-[var(--muted)]">当前板块</div>
                  <h3 className="mt-1 text-xl font-semibold">{selected.name}</h3>
                </div>
                <div
                  className={`text-2xl font-semibold tabular-nums ${pctClass(selected.changePercent)}`}
                >
                  {fmtPct(selected.changePercent)}
                </div>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className={actionClass(selected.fundView.action)}>
                  基金建议：{selected.fundView.action}
                </span>
                <span className="tag">
                  置信 {selected.fundView.confidence}%
                </span>
              </div>
              <p className="mb-4 text-sm leading-6 text-[#d7e3ff]">
                {selected.fundView.comment}
              </p>

              <DimBlock
                title="技术层面"
                score={selected.technical.score}
                summary={selected.technical.summary}
                items={[
                  `位置：${selected.technical.position}`,
                  ...selected.technical.signals,
                ]}
              />
              <DimBlock
                title="消息层面"
                score={selected.news.score}
                summary={selected.news.summary}
                items={[
                  ...selected.news.catalysts.map((x) => `催化：${x}`),
                  ...selected.news.risks.map((x) => `风险：${x}`),
                ]}
              />
              <DimBlock
                title="政策层面"
                score={selected.policy.score}
                summary={selected.policy.summary}
                items={selected.policy.supports}
              />

              {selected.fundView.relatedEtfs.length ? (
                <div className="mt-3">
                  <div className="mb-2 text-sm text-[var(--muted)]">
                    相关 ETF / 主题
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selected.fundView.relatedEtfs.map((e) => (
                      <span key={e} className="tag tag-gold">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-sm text-[var(--muted)]">
              {loading ? "分析生成中…" : "暂无分析"}
            </div>
          )}
        </aside>
      </section>

      <footer className="mt-8 text-xs leading-6 text-[var(--muted)]">
        <p>
          {disclaimer ||
            "本站数据仅供学习研究，不构成任何投资建议。股市有风险，入市需谨慎。"}
        </p>
        <p className="mt-1">
          样本板块 {sectors.length} · 60 秒自动刷新 · 东方财富公开接口
        </p>
      </footer>
    </main>
  );
}

function BoardList({
  title,
  list,
  tone,
}: {
  title: string;
  list: SectorBoard[];
  tone: "up" | "down";
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-medium">
        {title}
      </div>
      <div className="divide-y divide-[var(--line)]">
        {list.slice(0, 10).map((b, i) => (
          <div
            key={b.code}
            className="flex items-center justify-between px-4 py-2.5 text-sm"
          >
            <div className="flex items-center gap-3">
              <span className="w-5 tabular-nums text-[var(--muted)]">
                {i + 1}
              </span>
              <div>
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {b.type === "industry" ? "行业" : "概念"} · {fmtYi(b.amount)}
                </div>
              </div>
            </div>
            <div
              className={`font-semibold tabular-nums ${pctClass(b.changePercent)}`}
            >
              {fmtPct(b.changePercent)}
            </div>
          </div>
        ))}
        {!list.length ? (
          <div className="px-4 py-6 text-sm text-[var(--muted)]">暂无数据</div>
        ) : null}
      </div>
    </div>
  );
}

function DimBlock({
  title,
  score,
  summary,
  items,
}: {
  title: string;
  score: number;
  summary: string;
  items: string[];
}) {
  return (
    <div className="mb-4 rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-sm tabular-nums text-sky-300">{score}</div>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <p className="mb-2 text-sm leading-6 text-[#d7e3ff]">{summary}</p>
      <ul className="space-y-1 text-xs leading-5 text-[var(--muted)]">
        {items.slice(0, 6).map((x, i) => (
          <li key={i}>· {x}</li>
        ))}
      </ul>
    </div>
  );
}
