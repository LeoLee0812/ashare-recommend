import { NextResponse } from "next/server";
import { searchFunds, resolveFundsByCodes } from "@/lib/eastmoney";

export const runtime = "nodejs";
export const revalidate = 30;

/**
 * GET /api/funds?q=110022
 * GET /api/funds?code=110022,161725
 * 支付宝基金：用代码搜索名称 + 板块
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || searchParams.get("key") || "").trim();
    const codeParam = (searchParams.get("code") || searchParams.get("codes") || "").trim();

    if (codeParam) {
      const codes = codeParam
        .split(/[,，\s]+/)
        .map((c) => c.replace(/^(sh|sz|of)/i, "").trim())
        .filter(Boolean);
      const map = await resolveFundsByCodes(codes);
      const list = codes
        .map((c) => map.get(c))
        .filter((x): x is NonNullable<typeof x> => !!x);
      return NextResponse.json({
        ok: true,
        list,
        updatedAt: new Date().toISOString(),
      });
    }

    if (!q) {
      return NextResponse.json(
        { ok: false, error: "请提供 q=代码/名称 或 code=6位代码" },
        { status: 400 }
      );
    }

    const list = await searchFunds(q);
    return NextResponse.json({
      ok: true,
      list,
      updatedAt: new Date().toISOString(),
      disclaimer: "基金名称与板块来自公开接口，仅供学习研究，不构成投资建议。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
