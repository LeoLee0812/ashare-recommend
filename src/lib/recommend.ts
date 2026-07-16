import type {
  RecommendItem,
  StockQuote,
  StrategyKey,
  StrategyMeta,
} from "./types";

export const STRATEGIES: StrategyMeta[] = [
  {
    key: "balanced",
    name: "均衡精选",
    desc: "动量 + 资金活跃 + 估值平衡，适合日常观察",
  },
  {
    key: "momentum",
    name: "强势动量",
    desc: "侧重涨幅与量能放大，捕捉短线强势股",
  },
  {
    key: "value",
    name: "低估稳健",
    desc: "侧重合理 PE/PB、市值与波动可控",
  },
  {
    key: "hot",
    name: "热度资金",
    desc: "侧重成交额、换手率与量比，资金关注度高",
  },
];

const WEIGHTS: Record<
  StrategyKey,
  {
    momentum: number;
    volume: number;
    valuation: number;
    activity: number;
    stability: number;
  }
> = {
  balanced: {
    momentum: 0.28,
    volume: 0.22,
    valuation: 0.18,
    activity: 0.18,
    stability: 0.14,
  },
  momentum: {
    momentum: 0.45,
    volume: 0.25,
    valuation: 0.05,
    activity: 0.2,
    stability: 0.05,
  },
  value: {
    momentum: 0.1,
    volume: 0.1,
    valuation: 0.4,
    activity: 0.1,
    stability: 0.3,
  },
  hot: {
    momentum: 0.2,
    volume: 0.35,
    valuation: 0.05,
    activity: 0.35,
    stability: 0.05,
  },
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/** 百分位打分：值越大分越高 */
function scoreHigher(values: number[], v: number): number {
  if (!values.length) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return clamp((lo / sorted.length) * 100);
}

/** 百分位打分：值越小分越高（如估值） */
function scoreLower(values: number[], v: number): number {
  return 100 - scoreHigher(values, v);
}

function isLimitUp(s: StockQuote): boolean {
  // 简易：主板约 10%，创业/科创 20%
  const thr =
    s.code.startsWith("3") || s.code.startsWith("68") ? 19.5 : 9.5;
  return s.changePercent >= thr;
}

function isLimitDown(s: StockQuote): boolean {
  const thr =
    s.code.startsWith("3") || s.code.startsWith("68") ? -19.5 : -9.5;
  return s.changePercent <= thr;
}

function buildTags(s: StockQuote, factors: RecommendItem["factorScores"]): string[] {
  const tags: string[] = [];
  if (isLimitUp(s)) tags.push("涨停");
  if (s.changePercent >= 5 && !isLimitUp(s)) tags.push("大涨");
  if (s.volumeRatio >= 2) tags.push("放量");
  if (s.turnover >= 8) tags.push("高换手");
  if (s.pe > 0 && s.pe < 20) tags.push("低估值");
  if (s.totalMV >= 1e11) tags.push("大盘股");
  else if (s.totalMV > 0 && s.totalMV < 5e9) tags.push("小盘股");
  if (factors.momentum >= 80) tags.push("强动量");
  if (factors.activity >= 80) tags.push("资金热");
  if (factors.stability >= 75) tags.push("相对稳健");
  if (s.market === "SH" && s.code.startsWith("68")) tags.push("科创板");
  if (s.code.startsWith("3")) tags.push("创业板");
  return tags.slice(0, 5);
}

function buildReasons(
  s: StockQuote,
  factors: RecommendItem["factorScores"],
  strategy: StrategyKey
): string[] {
  const reasons: string[] = [];
  if (factors.momentum >= 70) {
    reasons.push(
      `涨幅 ${s.changePercent.toFixed(2)}%，动量得分 ${factors.momentum.toFixed(0)}`
    );
  }
  if (factors.volume >= 70) {
    const yi = s.amount / 1e8;
    reasons.push(
      `成交额约 ${yi.toFixed(2)} 亿，资金活跃度得分 ${factors.volume.toFixed(0)}`
    );
  }
  if (factors.activity >= 70) {
    reasons.push(
      `换手 ${s.turnover.toFixed(2)}% / 量比 ${s.volumeRatio.toFixed(2)}，热度得分 ${factors.activity.toFixed(0)}`
    );
  }
  if (factors.valuation >= 65 && s.pe > 0) {
    reasons.push(
      `动态市盈率 ${s.pe.toFixed(1)}，估值得分 ${factors.valuation.toFixed(0)}`
    );
  }
  if (factors.stability >= 65) {
    reasons.push(
      `振幅 ${s.amplitude.toFixed(2)}%，稳定性得分 ${factors.stability.toFixed(0)}`
    );
  }
  if (!reasons.length) {
    reasons.push(`综合评分靠前，策略：${strategy}`);
  }
  return reasons.slice(0, 4);
}

/**
 * 多因子推荐
 * 硬过滤：价格有效、非涨跌停极端（可配置）、有成交
 */
export function recommendStocks(
  stocks: StockQuote[],
  strategy: StrategyKey = "balanced",
  topN = 20
): RecommendItem[] {
  const pool = stocks.filter((s) => {
    if (s.price <= 0 || s.amount <= 0) return false;
    // 排除一字板/极端跌停，可观察性差
    if (isLimitUp(s) && s.amplitude < 0.5) return false;
    if (isLimitDown(s)) return false;
    // 排除无意义估值极端（pe 负数留给 value 策略可放宽，这里统一过滤巨亏）
    if (s.pe < -100) return false;
    return true;
  });

  if (!pool.length) return [];

  const changes = pool.map((s) => s.changePercent);
  const amounts = pool.map((s) => s.amount);
  const turnovers = pool.map((s) => s.turnover);
  const volRatios = pool.map((s) => s.volumeRatio);
  const amplitudes = pool.map((s) => s.amplitude);
  // 估值：仅正 PE 参与
  const pePos = pool.map((s) => (s.pe > 0 ? s.pe : NaN)).filter((x) => !Number.isNaN(x));
  const pbPos = pool.map((s) => (s.pb > 0 ? s.pb : NaN)).filter((x) => !Number.isNaN(x));
  const mvs = pool.map((s) => s.totalMV).filter((x) => x > 0);

  const w = WEIGHTS[strategy] || WEIGHTS.balanced;

  const scored: RecommendItem[] = pool.map((s) => {
    // 动量：涨幅 + 微弱偏向不追高（距日内高点）
    const momRaw = scoreHigher(changes, s.changePercent);
    const pullback =
      s.high > 0 ? clamp(100 - ((s.high - s.price) / s.high) * 400, 40, 100) : 70;
    const momentum = clamp(momRaw * 0.85 + pullback * 0.15);

    // 资金：成交额
    const volume = scoreHigher(amounts, s.amount);

    // 估值：正 PE/PB 越低越好；负 PE 给中等偏低
    let valuation = 50;
    if (s.pe > 0 && pePos.length) {
      const peScore = scoreLower(pePos, s.pe);
      const pbScore =
        s.pb > 0 && pbPos.length ? scoreLower(pbPos, s.pb) : peScore;
      valuation = clamp(peScore * 0.7 + pbScore * 0.3);
    } else if (s.pe <= 0) {
      valuation = 35;
    }

    // 活跃：换手 + 量比
    const tScore = scoreHigher(turnovers, s.turnover);
    const vrScore = scoreHigher(volRatios, s.volumeRatio);
    const activity = clamp(tScore * 0.55 + vrScore * 0.45);

    // 稳定：振幅越低越稳；市值越大略加分
    const ampScore = scoreLower(amplitudes, s.amplitude);
    const mvScore =
      s.totalMV > 0 && mvs.length ? scoreHigher(mvs, s.totalMV) : 50;
    const stability = clamp(ampScore * 0.65 + mvScore * 0.35);

    const factorScores = { momentum, volume, valuation, activity, stability };
    const score = clamp(
      momentum * w.momentum +
        volume * w.volume +
        valuation * w.valuation +
        activity * w.activity +
        stability * w.stability
    );

    return {
      ...s,
      score: Math.round(score * 10) / 10,
      rank: 0,
      tags: [],
      reasons: [],
      factorScores: {
        momentum: Math.round(momentum * 10) / 10,
        volume: Math.round(volume * 10) / 10,
        valuation: Math.round(valuation * 10) / 10,
        activity: Math.round(activity * 10) / 10,
        stability: Math.round(stability * 10) / 10,
      },
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topN).map((item, i) => {
    const tags = buildTags(item, item.factorScores);
    const reasons = buildReasons(item, item.factorScores, strategy);
    return { ...item, rank: i + 1, tags, reasons };
  });
}

export function summarizeMarket(stocks: StockQuote[]) {
  let up = 0;
  let down = 0;
  let flat = 0;
  let limitUp = 0;
  let limitDown = 0;
  for (const s of stocks) {
    if (s.changePercent > 0.01) up++;
    else if (s.changePercent < -0.01) down++;
    else flat++;
    if (isLimitUp(s)) limitUp++;
    if (isLimitDown(s)) limitDown++;
  }
  return {
    upCount: up,
    downCount: down,
    flatCount: flat,
    limitUp,
    limitDown,
    total: stocks.length,
  };
}

/** 判断是否交易时段（北京时间，粗略） */
export function isTradingTime(date = new Date()): boolean {
  // 转 Asia/Shanghai
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const wd = map.weekday;
  if (["Sat", "Sun"].includes(wd)) return false;
  const h = Number(map.hour);
  const m = Number(map.minute);
  const mins = h * 60 + m;
  // 9:15-11:30, 13:00-15:00
  return (
    (mins >= 9 * 60 + 15 && mins <= 11 * 60 + 30) ||
    (mins >= 13 * 60 && mins <= 15 * 60)
  );
}
