import { NextResponse } from "next/server";
import { fetchIndices, fetchMarketStocks } from "@/lib/eastmoney";
import {
  isTradingTime,
  recommendStocks,
  summarizeMarket,
  STRATEGIES,
} from "@/lib/recommend";
import type { StrategyKey } from "@/lib/types";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const strategy = (searchParams.get("strategy") ||
      "balanced") as StrategyKey;
    const topN = Math.min(
      50,
      Math.max(5, Number(searchParams.get("top") || 20))
    );
    const valid = STRATEGIES.some((s) => s.key === strategy);
    const key: StrategyKey = valid ? strategy : "balanced";

    const [stocks, indices] = await Promise.all([
      fetchMarketStocks(800),
      fetchIndices(),
    ]);

    const list = recommendStocks(stocks, key, topN);
    const summary = summarizeMarket(stocks);

    return NextResponse.json({
      ok: true,
      strategy: key,
      strategies: STRATEGIES,
      overview: {
        shIndex: {
          name: indices.sh.name || "上证指数",
          price: indices.sh.price,
          changePercent: indices.sh.changePercent,
        },
        szIndex: {
          name: indices.sz.name || "深证成指",
          price: indices.sz.price,
          changePercent: indices.sz.changePercent,
        },
        cybIndex: {
          name: indices.cyb.name || "创业板指",
          price: indices.cyb.price,
          changePercent: indices.cyb.changePercent,
        },
        ...summary,
        updatedAt: new Date().toISOString(),
        trading: isTradingTime(),
      },
      list,
      universe: stocks.length,
      disclaimer:
        "本站数据仅供学习研究，不构成任何投资建议。股市有风险，入市需谨慎。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }
}
