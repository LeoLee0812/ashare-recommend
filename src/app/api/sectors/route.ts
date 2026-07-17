import { NextResponse } from "next/server";
import { fetchEtfList, fetchSectors } from "@/lib/eastmoney";
import { analyzeSector, matchEtfsForSector } from "@/lib/analysis";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") || "all") as
      | "industry"
      | "concept"
      | "all";
    const limit = Math.min(
      80,
      Math.max(10, Number(searchParams.get("limit") || 40))
    );
    const focus = (searchParams.get("focus") || "")
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const focusKeys =
      focus.length > 0
        ? focus
        : [
            "半导",
            "芯片",
            "通信",
            "光模块",
            "电子",
            "消费电子",
            "电力设备",
            "专用设备",
          ];

    const [sectors, etfs] = await Promise.all([
      fetchSectors(type, limit),
      fetchEtfList({ sort: "amount", limit: 120 }).catch(() => []),
    ]);

    const gainers = [...sectors].sort(
      (a, b) => b.changePercent - a.changePercent
    );
    const losers = [...sectors].sort(
      (a, b) => a.changePercent - b.changePercent
    );

    const focusBoards = sectors.filter((s) =>
      focusKeys.some((k) => s.name.includes(k))
    );

    const analysisTargets = [
      ...focusBoards,
      ...gainers.slice(0, 8),
      ...losers.slice(0, 5),
    ];
    const seen = new Set<string>();
    const uniq = analysisTargets.filter((b) => {
      if (seen.has(b.code)) return false;
      seen.add(b.code);
      return true;
    });

    const analyses = uniq.slice(0, 20).map((b) => {
      const related = matchEtfsForSector(b.name, etfs, 5);
      const isFocus = focusKeys.some((k) => b.name.includes(k));
      return analyzeSector(b, related, isFocus);
    });

    return NextResponse.json({
      ok: true,
      sectors,
      topGainers: gainers.slice(0, 15),
      topLosers: losers.slice(0, 15),
      focusBoards,
      analyses,
      updatedAt: new Date().toISOString(),
      disclaimer:
        "板块分析为规则引擎+公开行情推演，仅供学习研究，不构成投资建议。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
