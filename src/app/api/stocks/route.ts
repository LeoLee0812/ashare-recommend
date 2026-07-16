import { NextResponse } from "next/server";
import { fetchGainers, fetchMarketStocks, fetchQuoteByCode } from "@/lib/eastmoney";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const mode = searchParams.get("mode") || "search";

    if (mode === "gainers") {
      const list = await fetchGainers(30);
      return NextResponse.json({ ok: true, list });
    }

    if (q) {
      // 纯数字按代码查
      if (/^\d{6}$/.test(q) || /^(sh|sz|bj)\d{6}$/i.test(q)) {
        const one = await fetchQuoteByCode(q);
        return NextResponse.json({
          ok: true,
          list: one ? [one] : [],
        });
      }

      // 名称模糊：从成交额前 800 里搜
      const stocks = await fetchMarketStocks(800);
      const kw = q.toLowerCase();
      const list = stocks
        .filter(
          (s) =>
            s.name.toLowerCase().includes(kw) ||
            s.code.includes(kw)
        )
        .slice(0, 30);
      return NextResponse.json({ ok: true, list });
    }

    const list = await fetchMarketStocks(100);
    return NextResponse.json({ ok: true, list: list.slice(0, 50) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
