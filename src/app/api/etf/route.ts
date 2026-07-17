import { NextResponse } from "next/server";
import {
  fetchEtfList,
  fetchFundNavHistory,
  fetchKline,
  fetchQuoteByCode,
  searchEtfs,
} from "@/lib/eastmoney";

export const runtime = "nodejs";
export const revalidate = 20;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const code = (searchParams.get("code") || "").trim();
    const sort = (searchParams.get("sort") || "amount") as "amount" | "change";
    const limit = Math.min(200, Math.max(10, Number(searchParams.get("limit") || 60)));
    const withNav = searchParams.get("nav") === "1" || !!code;
    const navLimit = Math.min(120, Math.max(10, Number(searchParams.get("days") || 60)));

    // 单码详情 + 走势
    if (code) {
      const pure = code.replace(/^(sh|sz)/i, "");
      const [quote, kline, nav] = await Promise.all([
        fetchQuoteByCode(pure),
        fetchKline(pure, navLimit).catch(() => []),
        fetchFundNavHistory(pure, navLimit).catch(() => []),
      ]);
      // 优先 K 线（实时价序列），净值作补充
      const series =
        kline.length > 0
          ? kline
          : nav.map((n) => ({
              ...n,
              close: n.nav || n.close,
            }));
      return NextResponse.json({
        ok: true,
        quote,
        series,
        nav,
        updatedAt: new Date().toISOString(),
      });
    }

    if (q) {
      const list = await searchEtfs(q);
      return NextResponse.json({
        ok: true,
        list,
        updatedAt: new Date().toISOString(),
      });
    }

    const list = await fetchEtfList({ sort, limit });

    // 可选：给前 N 只带精简走势（避免超时，默认不带）
    let seriesMap: Record<string, unknown> = {};
    if (withNav) {
      const top = list.slice(0, 5);
      const pairs = await Promise.all(
        top.map(async (e) => {
          const series = await fetchKline(e.code, 30).catch(() => []);
          return [e.code, series] as const;
        })
      );
      seriesMap = Object.fromEntries(pairs);
    }

    return NextResponse.json({
      ok: true,
      list,
      seriesMap,
      updatedAt: new Date().toISOString(),
      disclaimer:
        "ETF 行情来自公开接口，净值日更；仅供学习研究，不构成投资建议。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
