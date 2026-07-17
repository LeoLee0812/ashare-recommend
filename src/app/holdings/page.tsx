"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FundInfo,
  HoldingAdvice,
  HoldingItem,
  NavPoint,
  StockQuote,
} from "@/lib/types";
import { NavChart } from "@/components/NavChart";
import {
  NavBar,
  SiteHeader,
  actionClass,
  fmtPct,
  fmtPrice,
  pctClass,
} from "@/components/ui";

const STORAGE_KEY = "ashare_holdings_v2";
const LEGACY_STORAGE_KEY = "ashare_holdings_v1";

type LocalHolding = HoldingItem & { id: string };

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseNum(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function migrateLegacy(h: HoldingItem): LocalHolding {
  // 旧版：weight + cost(净值) → 新版优先 amount/profit；无金额则保留旧字段兼容
  return {
    id: (h as LocalHolding).id || uid(),
    code: String(h.code || "").replace(/^(sh|sz|of)/i, ""),
    name: h.name || String(h.code || ""),
    type: h.type || "fund",
    amount: parseNum((h as HoldingItem).amount),
    profit: parseNum((h as HoldingItem).profit),
    weight: parseNum(h.weight),
    cost: parseNum(h.cost),
    shares: parseNum(h.shares),
    note: h.note,
    sectorTags: h.sectorTags,
    fundType: h.fundType,
  };
}

function loadLocal(): LocalHolding[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const list = arr.map((h: HoldingItem) => migrateLegacy(h));
    // 迁移到 v2
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return list;
  } catch {
    return [];
  }
}

function saveLocal(list: LocalHolding[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function fmtMoney(n?: number, signed = false) {
  if (n === undefined || !Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  const body =
    abs >= 10000 ? `${(abs / 10000).toFixed(2)}万` : `${abs.toFixed(2)}元`;
  if (!signed) return n < 0 ? `-${body}` : body;
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return body;
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
  const [portfolioAmount, setPortfolioAmount] = useState<number | undefined>();
  const [portfolioProfit, setPortfolioProfit] = useState<number | undefined>();
  const [portfolioPnlPct, setPortfolioPnlPct] = useState<number | undefined>();
  const [disclaimer, setDisclaimer] = useState("");

  // form：代码搜索 → 自动名称/板块 + 持仓金额 + 收益
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [profit, setProfit] = useState("");
  const [note, setNote] = useState("");
  const [sectorTags, setSectorTags] = useState<string[]>([]);
  const [fundType, setFundType] = useState("");
  const [searchHits, setSearchHits] = useState<FundInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [pickedCode, setPickedCode] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const local = loadLocal();
    setHoldings(local);
    setHydrated(true);
    if (local[0]) setSelectedCode(local[0].code);
  }, []);

  // 输入代码/名称时自动搜索支付宝基金
  useEffect(() => {
    const q = code.trim().replace(/^(sh|sz|of)/i, "");
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q || q.length < 2) {
      setSearchHits([]);
      setSearching(false);
      return;
    }
    // 已选中同一代码时不再弹列表
    if (pickedCode && pickedCode === q && name) {
      setSearchHits([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/funds?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (data.ok) {
          const list = (data.list || []) as FundInfo[];
          setSearchHits(list);
          // 精确 6 位代码命中：自动回填名称与板块
          if (/^\d{6}$/.test(q)) {
            const exact = list.find((x) => x.code === q) || list[0];
            if (exact && exact.code === q) {
              setName(exact.name);
              setSectorTags(exact.sectorTags || exact.themes || []);
              setFundType(exact.fundType || "");
              setPickedCode(exact.code);
              setSearchHits([]);
            }
          }
        }
      } catch {
        // ignore search errors
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [code, pickedCode, name]);

  const pickFund = (f: FundInfo) => {
    setCode(f.code);
    setName(f.name);
    setSectorTags(f.sectorTags || f.themes || []);
    setFundType(f.fundType || (f.category === "etf" ? "ETF" : ""));
    setPickedCode(f.code);
    setSearchHits([]);
    setErr("");
  };

  const refresh = useCallback(
    async (list: LocalHolding[]) => {
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
        setPortfolioAmount(data.portfolio?.totalAmount);
        setPortfolioProfit(data.portfolio?.totalProfit);
        setPortfolioPnlPct(data.portfolio?.portfolioPnlPct);
        // 回填名称、板块与自动仓位
        if (data.holdings?.length) {
          setHoldings((prev) => {
            // 默认观察组合时不写本地
            if (prev.length === 0) return prev;
            const byCode = new Map(
              data.holdings.map((h: HoldingItem) => [h.code, h])
            );
            const next = prev.map((p) => {
              const hit = byCode.get(p.code) as HoldingItem | undefined;
              if (!hit) return p;
              return {
                ...p,
                name: hit.name || p.name,
                weight: hit.weight ?? p.weight,
                sectorTags:
                  hit.sectorTags && hit.sectorTags.length
                    ? hit.sectorTags
                    : p.sectorTags,
                fundType: hit.fundType || p.fundType,
                type: hit.type || p.type,
              };
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
    },
    [selectedCode]
  );

  useEffect(() => {
    if (!hydrated) return;
    // 无本地持仓时用服务端默认观察组合
    refresh(holdings);
    const t = setInterval(() => refresh(holdings), 45_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const addHolding = () => {
    const c = code.trim().replace(/^(sh|sz|of)/i, "");
    if (!/^\d{6}$/.test(c)) {
      setErr("请输入 6 位支付宝基金代码，如 110022 / 161725");
      return;
    }
    if (holdings.some((h) => h.code === c)) {
      setErr("该代码已在持仓中");
      return;
    }
    const amountNum = parseNum(amount);
    const profitNum = parseNum(profit);
    if (amountNum === undefined || amountNum <= 0) {
      setErr("请填写持仓金额（元，当前市值）");
      return;
    }
    if (profitNum === undefined) {
      setErr("请填写持有收益（元，浮亏填负数）");
      return;
    }
    if (amountNum - profitNum <= 0 && profitNum >= 0) {
      // 成本金额 = 金额 - 收益；若收益过大导致成本非正，提示
      setErr("收益不能大于等于持仓金额（成本金额需为正）");
      return;
    }

    const displayName = name.trim() || c;
    const tags =
      sectorTags.length > 0
        ? sectorTags
        : undefined;
    const looksEtf = /ETF/i.test(displayName) || fundType === "ETF";
    const item: LocalHolding = {
      id: uid(),
      code: c,
      name: displayName,
      type: looksEtf ? "etf" : "fund",
      amount: amountNum,
      profit: profitNum,
      note: note.trim() || undefined,
      sectorTags: tags,
      fundType: fundType || undefined,
    };
    const next = [...holdings, item];
    setHoldings(next);
    saveLocal(next);
    setSelectedCode(c);
    setCode("");
    setName("");
    setAmount("");
    setProfit("");
    setNote("");
    setSectorTags([]);
    setFundType("");
    setPickedCode("");
    setSearchHits([]);
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
          type: "fund" as const,
          amount: a.amount,
          profit: a.profit,
          weight: a.weight,
          sectorTags: a.sectorTags,
          fundType: a.fundType,
        }));

  const selectedSeries = selectedCode ? seriesMap[selectedCode] || [] : [];
  const selectedAdvice = selectedCode
    ? adviceMap.get(selectedCode)
    : undefined;
  const selectedQuote = selectedCode
    ? quoteMap.get(selectedCode)
    : undefined;
  const selectedHolding = displayList.find((h) => h.code === selectedCode);

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
        subtitle="支付宝基金按 6 位代码搜索添加。自动识别基金名称与所属板块，录入持仓金额与持有收益后给出仓位/盈亏与操作建议。"
        onRefresh={() => refresh(holdings)}
        loading={loading}
        updatedText={updatedText}
      />

      <section className="panel mb-5 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-sm text-[var(--muted)]">组合持仓金额</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {fmtMoney(portfolioAmount)}
          </div>
        </div>
        <div>
          <div className="text-sm text-[var(--muted)]">组合持有收益</div>
          <div
            className={`mt-1 text-2xl font-semibold tabular-nums ${pctClass(portfolioProfit || 0)}`}
          >
            {fmtMoney(portfolioProfit, true)}
          </div>
        </div>
        <div>
          <div className="text-sm text-[var(--muted)]">组合盈亏%</div>
          <div
            className={`mt-1 text-2xl font-semibold tabular-nums ${pctClass(portfolioPnlPct || 0)}`}
          >
            {portfolioPnlPct !== undefined ? fmtPct(portfolioPnlPct) : "-"}
          </div>
        </div>
        <div>
          <div className="text-sm text-[var(--muted)]">组合加权涨跌（今日）</div>
          <div
            className={`mt-1 text-2xl font-semibold tabular-nums ${pctClass(portfolioChg || 0)}`}
          >
            {portfolioChg !== undefined ? fmtPct(portfolioChg) : "-"}
          </div>
          <div className="mt-1 text-xs text-[var(--muted)]">
            {holdings.length
              ? `本地持仓 ${holdings.length} 只`
              : "当前为默认观察组合（示例金额）"}
          </div>
        </div>
      </section>

      {/* 添加持仓 */}
      <section className="panel mb-5 p-4">
        <h2 className="mb-3 text-sm font-medium">添加支付宝基金持仓</h2>
        <div className="grid gap-2 md:grid-cols-6">
          <div className="relative md:col-span-1">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setPickedCode("");
              }}
              placeholder="代码 110022"
              className="w-full rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
            />
            {searching ? (
              <div className="absolute right-2 top-2 text-[10px] text-[var(--muted)]">
                搜…
              </div>
            ) : null}
            {searchHits.length > 0 ? (
              <div className="absolute z-20 mt-1 max-h-56 w-[min(22rem,90vw)] overflow-auto rounded-xl border border-[var(--line)] bg-[#0b1220] shadow-xl">
                {searchHits.map((f) => (
                  <button
                    key={f.code}
                    type="button"
                    className="flex w-full flex-col gap-0.5 border-b border-[var(--line)] px-3 py-2 text-left text-sm hover:bg-white/[0.05]"
                    onClick={() => pickFund(f)}
                  >
                    <div className="font-medium">
                      {f.name}
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        {f.code}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 text-[11px] text-[var(--muted)]">
                      {f.fundType ? <span>{f.fundType}</span> : null}
                      {(f.sectorTags || []).slice(0, 3).map((t) => (
                        <span key={t} className="tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="基金名称（代码搜索自动填）"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60 md:col-span-1"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="持仓金额(元) 如 30000"
            inputMode="decimal"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <input
            value={profit}
            onChange={(e) => setProfit(e.target.value)}
            placeholder="持有收益(元) 如 1200 或 -500"
            inputMode="decimal"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选）"
            className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2 text-sm outline-none focus:border-blue-400/60"
          />
          <button className="btn btn-active" onClick={addHolding}>
            添加
          </button>
        </div>
        {(name || sectorTags.length > 0 || fundType) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {name ? (
              <span className="text-[#d7e3ff]">
                已识别：<strong>{name}</strong>
                {fundType ? ` · ${fundType}` : ""}
              </span>
            ) : null}
            {sectorTags.map((t) => (
              <span key={t} className="tag tag-hot">
                板块 {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 text-xs leading-5 text-[var(--muted)]">
          用法：在支付宝复制<strong className="text-[#d7e3ff]">6 位基金代码</strong>
          搜索 → 自动带出<strong className="text-[#d7e3ff]">基金名称</strong>与
          <strong className="text-[#d7e3ff]">所属板块</strong> → 再填
          <strong className="text-[#d7e3ff]">持仓金额</strong>与
          <strong className="text-[#d7e3ff]">持有收益</strong>
          （浮亏填负数）。系统自动算成本、盈亏%与组合仓位。
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
                  const showAmount = a?.amount ?? h.amount;
                  const showProfit = a?.profit ?? h.profit;
                  const showWeight = a?.weight ?? h.weight;
                  const tags =
                    a?.sectorTags ||
                    h.sectorTags ||
                    [];
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
                          {tags.slice(0, 4).map((t) => (
                            <span key={t} className="tag tag-hot">
                              {t}
                            </span>
                          ))}
                          {(a?.fundType || h.fundType) && (
                            <span className="tag">
                              {a?.fundType || h.fundType}
                            </span>
                          )}
                          {a ? (
                            <span className={actionClass(a.action)}>
                              {a.action}
                            </span>
                          ) : null}
                          {showAmount !== undefined ? (
                            <span className="tag">
                              金额 {fmtMoney(showAmount)}
                            </span>
                          ) : null}
                          {showProfit !== undefined ? (
                            <span
                              className={`tag ${
                                showProfit >= 0 ? "tag-hot" : "tag-good"
                              }`}
                            >
                              收益 {fmtMoney(showProfit, true)}
                            </span>
                          ) : null}
                          {showWeight !== undefined ? (
                            <span className="tag">仓位 {showWeight}%</span>
                          ) : null}
                          {a?.pnlPct !== undefined ? (
                            <span
                              className={`tag ${
                                a.pnlPct >= 0 ? "tag-hot" : "tag-good"
                              }`}
                            >
                              盈亏 {fmtPct(a.pnlPct)}
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
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(
                      selectedAdvice?.sectorTags ||
                      selectedHolding?.sectorTags ||
                      []
                    ).map((t) => (
                      <span key={t} className="tag tag-hot">
                        板块 {t}
                      </span>
                    ))}
                    {(selectedAdvice?.fundType ||
                      selectedHolding?.fundType) && (
                      <span className="tag">
                        {selectedAdvice?.fundType ||
                          selectedHolding?.fundType}
                      </span>
                    )}
                  </div>
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
                  {(selectedAdvice.amount !== undefined ||
                    selectedAdvice.profit !== undefined) && (
                    <div className="mb-2 flex flex-wrap gap-3 text-sm">
                      {selectedAdvice.amount !== undefined ? (
                        <span>
                          持仓金额{" "}
                          <strong className="tabular-nums">
                            {fmtMoney(selectedAdvice.amount)}
                          </strong>
                        </span>
                      ) : null}
                      {selectedAdvice.profit !== undefined ? (
                        <span>
                          持有收益{" "}
                          <strong
                            className={`tabular-nums ${pctClass(selectedAdvice.profit)}`}
                          >
                            {fmtMoney(selectedAdvice.profit, true)}
                          </strong>
                        </span>
                      ) : null}
                      {selectedAdvice.pnlPct !== undefined ? (
                        <span>
                          盈亏{" "}
                          <strong
                            className={`tabular-nums ${pctClass(selectedAdvice.pnlPct)}`}
                          >
                            {fmtPct(selectedAdvice.pnlPct)}
                          </strong>
                        </span>
                      ) : null}
                    </div>
                  )}
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
        <p className="mt-1">45 秒自动刷新 · 本地持仓隐私存储 · 支持支付宝场外基金</p>
      </footer>
    </main>
  );
}
