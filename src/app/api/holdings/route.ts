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
} from "@/lib/analysis";
import type { HoldingItem } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 20;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const codesParam = searchParams.get("codes") || "";
    const days = Math.min(120, Math.max(10, Number(searchParams.get("days") || 60)));

    // codes=512480:半导体ETF:30:1.2,510300:沪深300:25
    // 格式 code:name:weight:cost
    let holdings: HoldingItem[] = [];
    if (codesParam.trim()) {
      holdings = codesParam.split(",").map((part) => {
        const [code, name, weight, cost] = part.split(":");
        return {
          code: (code || "").replace(/^(sh|sz)/i, "").trim(),
          name: name || code || "",
          type: "etf" as const,
          weight: weight ? Number(weight) : undefined,
          cost: cost ? Number(cost) : undefined,
        };
      }).filter((h) => h.code);
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
    // 补名称
    holdings = holdings.map((h) => ({
      ...h,
      name: quoteMap.get(h.code)?.name || h.name,
    }));

    const sectorMap = new Map(sectors.map((s) => [s.code, s]));
    const advices = buildHoldingAdvices(holdings, quoteMap, sectorMap);

    // 每只持仓拉走势
    const seriesEntries = await Promise.all(
      codes.map(async (code) => {
        const series = await fetchKline(code, days).catch(async () => {
          return fetchFundNavHistory(code, days).catch(() => []);
        });
        return [code, series] as const;
      })
    );
    const seriesMap = Object.fromEntries(seriesEntries);

    // 组合简易汇总
    let totalWeight = 0;
    let weightedChg = 0;
    for (const h of holdings) {
      const w = h.weight || 0;
      const chg = quoteMap.get(h.code)?.changePercent || 0;
      totalWeight += w;
      weightedChg += w * chg;
    }
    const portfolioChg =
      totalWeight > 0 ? weightedChg / totalWeight : undefined;

    return NextResponse.json({
      ok: true,
      holdings,
      quotes,
      advices,
      seriesMap,
      sectors: sectors.slice(0, 30),
      etfSuggestions: etfList.slice(0, 20),
      portfolio: {
        totalWeight,
        weightedChangePercent: portfolioChg,
      },
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
    const holdings = (body.holdings || []) as HoldingItem[];
    const days = Math.min(120, Math.max(10, Number(body.days || 60)));
    const list =
      holdings.length > 0
        ? holdings.map((h) => ({
            ...h,
            code: String(h.code || "").replace(/^(sh|sz)/i, ""),
            type: h.type || "etf",
          }))
        : DEFAULT_WATCH_HOLDINGS;

    const codes = list.map((h) => h.code);
    const [quotes, sectors] = await Promise.all([
      fetchQuotesByCodes(codes),
      fetchSectors("industry", 50).catch(() => []),
    ]);
    const quoteMap = new Map(quotes.map((q) => [q.code, q]));
    const sectorMap = new Map(sectors.map((s) => [s.code, s]));
    const filled = list.map((h) => ({
      ...h,
      name: quoteMap.get(h.code)?.name || h.name,
    }));
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
      updatedAt: new Date().toISOString(),
      disclaimer:
        "持仓建议为规则推演，仅供学习研究，不构成投资建议。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
