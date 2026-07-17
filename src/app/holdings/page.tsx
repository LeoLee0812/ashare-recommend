"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HoldingAdvice, HoldingItem, NavPoint, StockQuote } from "@/lib/types";
import { NavChart } from "@/components/NavChart";
import {
  NavBar,
  SiteHeader,
  actionClass,
  fmtPct,
  fmtPrice,
  pctClass,
} from "@/components/ui";

const STORAGE_KEY = "ashare_holdings_v1";

type LocalHolding = HoldingItem & { id: string };

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadLocal(): LocalHolding[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((h: HoldingItem) => ({
      ...h,
      id: (h as LocalHolding).id || uid(),
      code: String(h.code || "").replace(/^(sh|sz)/i, ""),
    }));
  } catch {
    return [];
  }
}

function saveLocal(list: LocalHolding[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function HoldingsPage() {
  const [holdings, setHoldings] = useState<LocalHolding[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [advices, setAdvices] = useState<HoldingAdvice[]>([]);
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [seriesMap, setSeriesMap] = useState<Record<string, NavPoint[]>>({});
  const [selectedCode, setSelectedCode] = useState<string>("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [portfolioChg, setPortfolioChg] = useState<number | undefined>();
  const [disclaimer, setDisclaimer] = useState("");

  // form
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    const local = loadLocal();
    setHoldings(local);
    setHydrated(true);
    if (local[0]) setSelectedCode(local[0].code);
  }, []);

  const refresh = useCallback(async (list: LocalHolding[]) => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: list.map(({ id: _id, ...rest }) => rest),
          days: 60,
        }),
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "加载失败");
      setAdvices(data.advices || []);
      setQuotes(data.quotes || []);
      setSeriesMap(data.seriesMap || {});
      setUpdatedAt(data.updatedAt || "");
      setDisclaimer(data.disclaimer || "");
      setPortfolioChg(data.portfolio?.weightedChangePercent);
      // 回填名称
      if (data.holdings?.length) {
        setHoldings((prev) => {
          const byCode = new Map(
            data.holdings.map((h: HoldingItem) => [h.code, h])
          );
          const next = prev.map((p) => {
            const hit = byCode.get(p.code) as HoldingItem | undefined;
            return hit ? { ...p, name: hit.name || p.name } : p;
          });
          saveLocal(next);
          return next;
        });
      }
      if (!selectedCode && data.holdings?.[0]?.code) {
        setSelectedCode(data.holdings[0].code);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedCode]);

  useEffect(() => {
    if (!hydrated) return;
    // 无本地持仓时用服务端默认观察组合
    refresh(holdings);
    const t = setInterval(() => refresh(holdings), 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const addHolding = () => {
    const c = code.trim().replace(/^(sh|sz)/i, "");
    if (!/^\d{6}$/.test(c)) {
      setErr("请输入 6 位基金/ETF 代码，如 512480");
      return;
    }
    if (holdings.some((h) => h.code === c)) {
      setErr("该代码已在持仓中");
      return;
    }
    const item: LocalHolding = {
      id: uid(),
      code: c,
      name: name.trim() || c,
      type: "etf",
      weight: weight ? Number(weight) : undefined,
      cost: cost ? Number(cost) : undefined,
      note: note.trim() || undefined,
    };
    const next = [...holdings, item];
    setHoldings(next);
    saveLocal(next);
    setSelectedCode(c);
    setCode("");
    setName("");
    setWeight("");
    setCost("");
    setNote("");
    setErr("");
    refresh(next);
  };

  const removeHolding = (id: string) => {
    const next = holdings.filter((h) => h.id !== id);
    setHoldings(next);
    saveLocal(next);
    if (selectedCode && !next.some((h) => h.code === selectedCode)) {
      setSelectedCode(next[0]?.code || "");
    }
    refresh(next);
  };

  const useDefault = () => {
    // 清空本地，让 API 走默认观察组合
    setHoldings([]);
    saveLocal([]);
    setSelectedCode("");
    refresh([]);
  };

  const quoteMap = useMemo(
    () => new Map(quotes.map((q) => [q.code, q])),
    [quotes]
  );
  const adviceMap = useMemo(
    () => new Map(advices.map((a) => [a.code, a])),
    [advices]
  );

  const displayList: Array<HoldingItem & { id?: string }> =
    holdings.length > 0
      ? holdings
      : advices.map((a) => ({
          code: a.code,
          name: a.name,
          type: "etf" as const,
        }));

  const selectedSeries = selectedCode ? seriesMap[selectedCode] || [] : [];
  const selectedAdvice = selectedCode
    ? adviceMap.get(selectedCode)
    : undefined;
  const selectedQuote = selectedCode
    ? quoteMap.get(selectedCode)
    : undefined;

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
        title="我的持仓 · 每日操作建议"
        subtitle="可添加 ETF/场内基金持仓（浏览器本地保存）。实时净值走势 + 规则化操作建议。默认预置半导体/科创/通信/宽基/红利观察组合。"
        onRefresh={() => refresh(holdings)}
        loading={loading}
        updatedText={updatedText}
      />

      {portfolioChg !== undefined ? (
        <section className="panel mb-5 p-4">
          <div className="text-sm text-[var(--muted)]">组合加权涨跌（按仓位）</div>
          <div
            className={`mt-1 text-3xl font-semibold tabular-nums ${pctClass(portfolioChg)}`}
          >
            {fmtPct(portfolioChg)}
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            {holdings.length
              ? `本地持仓 ${holdings.length} 只`
              : "当前为默认观察组合（未保存本地持仓）"}
          </div>
        </section>
      ) : null}

      {/* 添加持仓 */}
      <section className="panel mb-5 p-4">
        <h2 className="mb-3 text-sm font-medium">添加持仓</h2>
        <div className="grid gap-2 md:grid-cols-6">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="代码 512480"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名称（可选）"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="仓位% 如 30"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="成本净值（可选）"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <button className="btn btn-active" onClick={addHolding}>
            添加
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" onClick={useDefault}>
            恢复默认观察组合
          </button>
          <span className="text-xs leading-8 text-[var(--muted)]">
            持仓仅存本机浏览器 localStorage，不会上传账号系统
          </span>
        </div>
      </section>

      {err ? (
        <div className="panel mb-5 border-red-500/30 p-4 text-sm text-red-300">
          告。{err}
        </div>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--line)] px-4 py-3 text-sm font-medium">
            持仓列表与操作建议
          </div>
          <div className="divide-y divide-[var(--line)]">
            {loading && !displayList.length
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="p-4">
                    <div className="skeleton h-14 w-full" />
                  </div>
                ))
              : displayList.map((h) => {
                  const a = adviceMap.get(h.code);
                  const q = quoteMap.get(h.code);
                  return (
                    <div
                      key={(h as LocalHolding).id || h.code}
                      className={`flex cursor-pointer flex-col gap-2 px-4 py-3 transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between ${
                        selectedCode === h.code ? "bg-blue-500/10" : ""
                      }`}
                      onClick={() => setSelectedCode(h.code)}
                    >
                      <div>
                        <div className="font-medium">
                          {a?.name || h.name || h.code}
                          <span className="ml-2 text-xs text-[var(--muted)]">
                            {h.code}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {a ? (
                            <span className={actionClass(a.action)}>
                              {a.action}
                            </span>
                          ) : null}
                          {h.weight !== undefined ? (
                            <span className="tag">仓位 {h.weight}%</span>
                          ) : null}
                          {a?.pnlPct !== undefined ? (
                            <span
                              className={`tag ${a.pnlPct >= 0 ? "tag-hot" : "tag-good"}`}
                            >
                              成本盈亏 {fmtPct(a.pnlPct)}
                            </span>
                          ) : null}
                          {a ? (
                            <span className="tag">置信 {a.confidence}%</span>
                          ) : null}
                        </div>
                        {a?.reasons?.[0] ? (
                          <div className="mt-1 text-xs text-[var(--muted)]">
                            {a.reasons[0]}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="tabular-nums">
                            {q ? fmtPrice(q.price) : "-"}
                          </div>
                          <div
                            className={`text-sm tabular-nums ${pctClass(q?.changePercent || 0)}`}
                          >
                            {q ? fmtPct(q.changePercent) : "-"}
                          </div>
                        </div>
                        {holdings.length > 0 ? (
                          <button
                            className="btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              const id = (h as LocalHolding).id;
                              if (id) removeHolding(id);
                            }}
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>

        <aside className="panel p-4 md:p-5">
          {selectedCode ? (
            <>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="text-xs text-[var(--muted)]">标的走势</div>
                  <h3 className="mt-1 text-xl font-semibold">
                    {selectedAdvice?.name ||
                      selectedQuote?.name ||
                      selectedCode}
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">
                    {selectedQuote
                      ? fmtPrice(selectedQuote.price)
                      : "-"}
                  </div>
                  <div
                    className={`tabular-nums ${pctClass(selectedQuote?.changePercent || 0)}`}
                  >
                    {selectedQuote
                      ? fmtPct(selectedQuote.changePercent)
                      : "-"}
                  </div>
                </div>
              </div>

              {selectedAdvice ? (
                <div className="mb-4 rounded-xl border border-[var(--line)] bg-white/[0.02] p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={actionClass(selectedAdvice.action)}>
                      今日建议：{selectedAdvice.action}
                    </span>
                    <span className="tag">
                      置信 {selectedAdvice.confidence}%
                    </span>
                    <span className="tag">{selectedAdvice.horizon}</span>
                  </div>
                  <ul className="space-y-1 text-sm leading-6 text-[#d7e3ff]">
                    {selectedAdvice.reasons.map((r, i) => (
                      <li key={i}>· {r}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    风险：{selectedAdvice.risk}
                  </p>
                </div>
              ) : null}

              <div className="mb-2 text-sm text-[var(--muted)]">
                近 60 日净值/收盘走势
              </div>
              <NavChart data={selectedSeries} height={220} />
            </>
          ) : (
            <div className="text-sm text-[var(--muted)]">
              {loading ? "加载持仓建议中…" : "添加或选择持仓"}
            </div>
          )}
        </aside>
      </section>

      <footer className="mt-8 text-xs leading-6 text-[var(--muted)]">
        <p>
          {disclaimer ||
            "持仓建议为规则推演，仅供学习研究，不构成投资建议。"}
        </p>
        <p className="mt-1">45 秒自动刷新 · 本地持仓隐私存储</p>
      </footer>
    </main>
  );
}
