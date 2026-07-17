import { NextResponse } from "next/server";
import {
  fetchEtfList,
  fetchFundNavHistory,
  fetchKline,
  fetchQuotesByCodes,
  fetchSectors,
} from "@/lib/eastmoney";
import {
  DEFAULT_WATCH_HOLDINGS,
  buildHoldingAdvices,
  deriveHoldingMetrics,
  fillHoldingWeights,
} from "@/lib/analysis";
import type { HoldingItem } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 20;

function normalizeHoldings(raw: HoldingItem[]): HoldingItem[] {
  return raw
    .map((h) => ({
      ...h,
      code: String(h.code || "")
        .replace(/^(sh|sz)/i, "")
        .trim(),
      type: h.type || ("etf" as const),
      amount:
        h.amount !== undefined && Number.isFinite(Number(h.amount))
          ? Number(h.amount)
          : undefined,
      profit:
        h.profit !== undefined && Number.isFinite(Number(h.profit))
          ? Number(h.profit)
          : undefined,
      weight:
        h.weight !== undefined && Number.isFinite(Number(h.weight))
          ? Number(h.weight)
          : undefined,
      cost:
        h.cost !== undefined && Number.isFinite(Number(h.cost))
          ? Number(h.cost)
          : undefined,
    }))
    .filter((h) => h.code);
}

function buildPortfolioSummary(
  holdings: HoldingItem[],
  quoteMap: Map<string, { changePercent?: number; price?: number }>
) {
  const weighted = fillHoldingWeights(holdings);

  let totalAmount = 0;
  let totalProfit = 0;
  let totalCostAmount = 0;
  let totalWeight = 0;
  let weightedChg = 0;
  let hasAmount = false;
  let hasProfit = false;

  for (const h of weighted) {
    const q = quoteMap.get(h.code);
    const chg = q?.changePercent || 0;
    const metrics = deriveHoldingMetrics(h, q?.price);

    if (metrics.amount !== undefined) {
      hasAmount = true;
      totalAmount += metrics.amount;
    }
    if (metrics.profit !== undefined) {
      hasProfit = true;
      totalProfit += metrics.profit;
    }
    if (metrics.costAmount !== undefined) {
      totalCostAmount += metrics.costAmount;
    }

    const w =
      metrics.amount !== undefined && metrics.amount > 0
        ? metrics.amount
        : h.weight || 0;
    totalWeight += w;
    weightedChg += w * chg;
  }

  const portfolioChg = totalWeight > 0 ? weightedChg / totalWeight : undefined;
  const portfolioPnlPct =
    hasAmount && hasProfit && totalCostAmount > 0
      ? (totalProfit / totalCostAmount) * 100
      : undefined;

  return {
    holdings: weighted,
    portfolio: {
      totalAmount: hasAmount ? totalAmount : undefined,
      totalProfit: hasProfit ? totalProfit : undefined,
      totalCostAmount:
        hasAmount && hasProfit ? totalCostAmount : undefined,
      totalWeight: hasAmount
        ? 100
        : weighted.reduce((s, h) => s + (h.weight || 0), 0),
      weightedChangePercent: portfolioChg,
      portfolioPnlPct,
    },
  };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const codesParam = searchParams.get("codes") || "";
    const days = Math.min(
      120,
      Math.max(10, Number(searchParams.get("days") || 60))
    );

    // codes=512480:半导体ETF:30000:1200,510300:沪深300:25000:-300
    // 格式 code:name:amount:profit
    let holdings: HoldingItem[] = [];
    if (codesParam.trim()) {
      holdings = normalizeHoldings(
        codesParam.split(",").map((part) => {
          const [code, name, amount, profit] = part.split(":");
          return {
            code: code || "",
            name: name || code || "",
            type: "etf" as const,
            amount: amount ? Number(amount) : undefined,
            profit: profit ? Number(profit) : undefined,
          };
        })
      );
    } else {
      holdings = DEFAULT_WATCH_HOLDINGS;
    }

    const codes = holdings.map((h) => h.code);
    const [quotes, sectors, etfList] = await Promise.all([
      fetchQuotesByCodes(codes),
      fetchSectors("industry", 50).catch(() => []),
      fetchEtfList({ sort: "amount", limit: 80 }).catch(() => []),
    ]);

    const quoteMap = new Map(quotes.map((q) => [q.code, q]));
    holdings = holdings.map((h) => ({
      ...h,
      name: quoteMap.get(h.code)?.name || h.name,
    }));

    const sectorMap = new Map(sectors.map((s) => [s.code, s]));
    const { holdings: filled, portfolio } = buildPortfolioSummary(
      holdings,
      quoteMap
    );
    const advices = buildHoldingAdvices(filled, quoteMap, sectorMap);

    const seriesEntries = await Promise.all(
      codes.map(async (code) => {
        const series = await fetchKline(code, days).catch(async () => {
          return fetchFundNavHistory(code, days).catch(() => []);
        });
        return [code, series] as const;
      })
    );
    const seriesMap = Object.fromEntries(seriesEntries);

    return NextResponse.json({
      ok: true,
      holdings: filled,
      quotes,
      advices,
      seriesMap,
      sectors: sectors.slice(0, 30),
      etfSuggestions: etfList.slice(0, 20),
      portfolio,
      updatedAt: new Date().toISOString(),
      disclaimer:
        "持仓建议为规则推演，仅供学习研究，不构成投资建议。股市有风险，入市需谨慎。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // 与 GET 相同，body 传 holdings JSON，避免 URL 过长
  try {
    const body = await req.json().catch(() => ({}));
    const raw = (body.holdings || []) as HoldingItem[];
    const days = Math.min(120, Math.max(10, Number(body.days || 60)));
    const list =
      raw.length > 0 ? normalizeHoldings(raw) : DEFAULT_WATCH_HOLDINGS;

    const codes = list.map((h) => h.code);
    const [quotes, sectors] = await Promise.all([
      fetchQuotesByCodes(codes),
      fetchSectors("industry", 50).catch(() => []),
    ]);
    const quoteMap = new Map(quotes.map((q) => [q.code, q]));
    const sectorMap = new Map(sectors.map((s) => [s.code, s]));
    const named = list.map((h) => ({
      ...h,
      name: quoteMap.get(h.code)?.name || h.name,
    }));
    const { holdings: filled, portfolio } = buildPortfolioSummary(
      named,
      quoteMap
    );
    const advices = buildHoldingAdvices(filled, quoteMap, sectorMap);
    const seriesEntries = await Promise.all(
      codes.map(async (code) => {
        const series = await fetchKline(code, days).catch(async () =>
          fetchFundNavHistory(code, days).catch(() => [])
        );
        return [code, series] as const;
      })
    );

    return NextResponse.json({
      ok: true,
      holdings: filled,
      quotes,
      advices,
      seriesMap: Object.fromEntries(seriesEntries),
      portfolio,
      updatedAt: new Date().toISOString(),
      disclaimer: "持仓建议为规则推演，仅供学习研究，不构成投资建议。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
