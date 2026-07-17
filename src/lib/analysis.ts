import type {
  AdviceAction,
  EtfQuote,
  HoldingAdvice,
  HoldingItem,
  SectorAnalysis,
  SectorBoard,
  StockQuote,
} from "./types";

/** 持仓偏好映射：名称关键词 -> 板块标签 */
const THEME_RULES: Array<{
  tags: string[];
  keywords: string[];
  etfs: string[];
  policy: string[];
  newsBull: string[];
  newsBear: string[];
}> = [
  {
    tags: ["半导体", "芯片", "科创"],
    keywords: ["半导", "芯片", "集成电路", "科创", "存储", "光刻", "设备", "人工智能", "AI"],
    etfs: ["芯片ETF", "半导体ETF", "科创50", "科创芯片"],
    policy: [
      "集成电路关键攻关与国产替代仍是十五五主线",
      "“人工智能+”带动算力芯片需求中长期支撑",
      "资本市场对硬科技包容性提升，但短线不消灭波动",
    ],
    newsBull: ["AI 资本开支", "存储景气", "国产替代订单", "设备材料自主可控"],
    newsBear: ["外盘费城半导杀估值", "中报验证压力", "交易拥挤去杠杆", "新股/大基金发行分流"],
  },
  {
    tags: ["CPO", "光模块", "通信"],
    keywords: ["CPO", "光模块", "光通信", "通信设备", "5G", "算力互联", "通信"],
    etfs: ["通信ETF", "5G ETF", "TMT相关"],
    policy: ["东数西算与算力基建", "数字经济基础设施", "国产算力生态"],
    newsBull: ["800G/1.6T 升级", "云厂商资本开支", "CPO/NPO 渗透"],
    newsBear: ["外盘光通信波动", "量产节奏分歧", "高位获利盘"],
  },
  {
    tags: ["PCB", "电子", "硬件"],
    keywords: ["PCB", "覆铜板", "电子", "硬件", "服务器", "计算机"],
    etfs: ["电子ETF", "信息技术ETF"],
    policy: ["先进制造", "算力硬件自主可控间接受益"],
    newsBull: ["AI 服务器高多层 PCB", "材料提价"],
    newsBear: ["产业链降本", "高位回调", "外盘映射"],
  },
  {
    tags: ["消费", "白酒", "食品饮料"],
    keywords: ["消费", "白酒", "食品", "饮料", "家电", "零售", "免税", "乳业"],
    etfs: ["消费ETF", "白酒ETF", "食品饮料"],
    policy: ["扩大内需与促消费", "提振居民消费信心"],
    newsBull: ["节日催化", "龙头提价/动销修复"],
    newsBear: ["需求复苏节奏", "估值波动"],
  },
  {
    tags: ["宽基", "指数"],
    keywords: ["沪深300", "中证500", "中证A500", "上证50", "创业板", "红利", "中证1000", "全指"],
    etfs: ["沪深300ETF", "中证A500ETF", "创业板ETF", "红利ETF"],
    policy: ["中长期资金入市", "稳信心与慢牛托底"],
    newsBull: ["机构再平衡", "政策托底流动性"],
    newsBear: ["风险偏好下降", "全球波动传导"],
  },
  {
    tags: ["红利", "高股息", "银行", "电力"],
    keywords: ["红利", "高股息", "银行", "电力", "煤运", "公用", "保险", "证券"],
    etfs: ["红利ETF", "银行ETF", "红利低波"],
    policy: ["中特估与股东回报", "高股息配置价值"],
    newsBull: ["科技抽水时资金回流", "股息确定性"],
    newsBear: ["利率预期变化", "经济复苏节奏"],
  },
  {
    tags: ["新能源", "电力", "绿电"],
    keywords: ["新能源", "光伏", "锂电", "绿电", "电力", "风电", "储能", "新能源汽车", "新能源车"],
    etfs: ["新能源车ETF", "光伏ETF", "电力ETF"],
    policy: ["双碳与能源结构转型", "反内卷或改善龙头利润"],
    newsBull: ["装机与电网投资", "电力供需"],
    newsBear: ["产能过剩", "价格战", "政策节奏扰动"],
  },
  {
    tags: ["医药", "创新药"],
    keywords: ["医药", "创新药", "生物", "CXO", "中药", "医疗", "器械"],
    etfs: ["医药ETF", "创新药ETF"],
    policy: ["集采常态化", "创新药审评与支付支持"],
    newsBull: ["管线催化", "海外授权"],
    newsBear: ["估值波动", "政策扰动"],
  },
  {
    tags: ["军工", "国防"],
    keywords: ["军工", "国防", "航空", "航天", "兵器"],
    etfs: ["军工ETF", "国防军工"],
    policy: ["国防现代化与自主可控"],
    newsBull: ["订单与装备升级"],
    newsBear: ["主题波动大", "业绩节奏不确定"],
  },
  {
    tags: ["港股", "QDII", "海外"],
    keywords: ["港股", "QDII", "纳斯达克", "标普", "海外", "美股", "恒生"],
    etfs: ["港股通", "纳指ETF", "QDII"],
    policy: ["跨境资产配置需求"],
    newsBull: ["汇率与外围风险偏好"],
    newsBear: ["汇率波动", "外围政策与估值"],
  },
];

/** 由基金名称 / 东财主题推断板块标签（支付宝基金添加时用） */
export function inferSectorTags(
  name: string,
  extra: string[] = [],
  max = 4
): string[] {
  const themes = matchThemes(name, extra);
  const tags: string[] = [];
  for (const t of themes) {
    for (const tag of t.tags) {
      if (!tags.includes(tag)) tags.push(tag);
    }
  }
  // 东财主题原文也并入（消费、白酒等）
  for (const e of extra) {
    const clean = String(e || "").trim();
    if (clean && !tags.includes(clean)) tags.push(clean);
  }
  return tags.slice(0, max);
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function matchThemes(name: string, extraTags: string[] = []) {
  const text = `${name} ${extraTags.join(" ")}`.toLowerCase();
  const hit = THEME_RULES.filter((r) =>
    r.keywords.some((k) => text.includes(k.toLowerCase()) || name.includes(k))
  );
  return hit.length ? hit : [];
}

function actionByChange(
  chg: number,
  pnl?: number
): { action: AdviceAction; confidence: number; horizon: string } {
  // 基金视角：不追高、急跌不梭哈
  if (chg <= -4) {
    return {
      action: pnl !== undefined && pnl < -12 ? "止损观察" : "分批建仓",
      confidence: 58,
      horizon: "1–2 周观察窗",
    };
  }
  if (chg <= -2) {
    return { action: "观望", confidence: 55, horizon: "数日" };
  }
  if (chg >= 4) {
    return {
      action: pnl !== undefined && pnl > 25 ? "止盈" : "减仓",
      confidence: 60,
      horizon: "短线",
    };
  }
  if (chg >= 2) {
    return { action: "持有", confidence: 52, horizon: "短线" };
  }
  return { action: "持有", confidence: 50, horizon: "波段" };
}

/** 根据板块涨跌 + 主题规则生成三维分析 */
export function analyzeSector(
  board: SectorBoard,
  relatedEtfs: EtfQuote[] = [],
  focus = false
): SectorAnalysis {
  const themes = matchThemes(board.name);
  const chg = board.changePercent;
  const techScore = clamp(50 + chg * 6 + (board.amount > 5e9 ? 5 : 0));
  const position =
    chg >= 3
      ? "强势放量区，注意追高风险"
      : chg >= 0
        ? "相对强势/修复区"
        : chg >= -3
          ? "弱势整理区"
          : "深调去杠杆区";

  const techSignals: string[] = [];
  if (chg <= -3) techSignals.push("短线跌幅偏大，波动率抬升");
  if (chg >= 3) techSignals.push("短线涨幅偏大，谨防获利回吐");
  if (board.amount >= 1e10) techSignals.push("成交额居前，资金关注度高");
  if (board.amount > 0 && board.amount < 1e9)
    techSignals.push("成交偏清淡，趋势信号可信度一般");
  if (!techSignals.length) techSignals.push("涨跌中性，观察能否放量突破/止跌");

  const newsBull = themes.flatMap((t) => t.newsBull).slice(0, 4);
  const newsBear = themes.flatMap((t) => t.newsBear).slice(0, 4);
  const policy = themes.flatMap((t) => t.policy).slice(0, 4);

  const newsScore = clamp(
    55 +
      (newsBull.length - newsBear.length) * 4 +
      (chg > 0 ? 5 : chg < -3 ? -8 : -2)
  );
  const policyScore = themes.length
    ? clamp(62 + (focus ? 8 : 0) + (chg < -3 ? 3 : 0))
    : 50;

  const fundAct = actionByChange(chg);
  // 持仓焦点板块：偏防守
  let action = fundAct.action;
  if (focus && chg <= -2 && action === "分批建仓") action = "观望";
  if (focus && chg >= 3) action = "减仓";

  const etfNames = relatedEtfs.slice(0, 5).map((e) => e.name);
  if (!etfNames.length) {
    for (const t of themes) etfNames.push(...t.etfs.slice(0, 2));
  }

  return {
    code: board.code,
    name: board.name,
    changePercent: board.changePercent,
    amount: board.amount,
    technical: {
      summary: `${board.name} 现 ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%，技术面定性：${position}。`,
      position,
      signals: techSignals,
      score: Math.round(techScore),
    },
    news: {
      summary: themes.length
        ? `主题映射：${themes.map((t) => t.tags[0]).join(" / ")}。短线定价权多在情绪与外盘，中线看订单与中报。`
        : "暂无强主题映射，按行业自身景气与资金轮动处理。",
      catalysts: newsBull.length ? newsBull : ["行业自身景气修复", "资金轮动回流"],
      risks: newsBear.length ? newsBear : ["宏观风险偏好下降", "获利盘压力"],
      score: Math.round(newsScore),
    },
    policy: {
      summary: policy.length
        ? "政策中长期偏支持产业趋势，但不保证短线不回调。"
        : "无特别强政策催化，更多跟随大盘风险偏好。",
      supports: policy.length
        ? policy
        : ["稳增长与活跃资本市场的一般性托底"],
      score: Math.round(policyScore),
    },
    fundView: {
      relatedEtfs: Array.from(new Set(etfNames)).slice(0, 6),
      action,
      confidence: fundAct.confidence + (focus ? 5 : 0),
      comment: focus
        ? "持仓相关板块：优先控波动，忌一把梭抄底或追高。"
        : "非核心持仓：可作对照，轮动观察即可。",
    },
    updatedAt: new Date().toISOString(),
  };
}

/** 从持仓金额/收益推导成本与盈亏% */
export function deriveHoldingMetrics(h: HoldingItem, price?: number) {
  const amount =
    h.amount !== undefined && Number.isFinite(h.amount) ? Number(h.amount) : undefined;
  const profit =
    h.profit !== undefined && Number.isFinite(h.profit) ? Number(h.profit) : undefined;

  let costAmount: number | undefined;
  let pnlPct: number | undefined;
  let cost: number | undefined = h.cost;

  if (amount !== undefined && profit !== undefined) {
    costAmount = amount - profit;
    if (costAmount > 0) {
      pnlPct = (profit / costAmount) * 100;
    } else if (costAmount === 0 && profit !== 0) {
      pnlPct = profit > 0 ? 100 : -100;
    }
  } else if (price && h.cost && h.cost > 0) {
    // 兼容旧数据：仅有成本净值
    pnlPct = ((price - h.cost) / h.cost) * 100;
    cost = h.cost;
  }

  // 有现价时，可由金额/收益反推单位成本净值
  if (price && price > 0 && amount !== undefined && amount > 0 && profit !== undefined) {
    const shares = amount / price;
    if (shares > 0) {
      cost = (amount - profit) / shares;
    }
  }

  return { amount, profit, costAmount, pnlPct, cost };
}

/** 按持仓金额自动计算仓位占比%（无金额则保留原 weight） */
export function fillHoldingWeights(holdings: HoldingItem[]): HoldingItem[] {
  const totalAmount = holdings.reduce((sum, h) => {
    const a = h.amount;
    return sum + (a !== undefined && Number.isFinite(a) && a > 0 ? a : 0);
  }, 0);

  if (totalAmount <= 0) return holdings;

  return holdings.map((h) => {
    const a = h.amount;
    if (a === undefined || !Number.isFinite(a) || a <= 0) return h;
    return {
      ...h,
      weight: Math.round((a / totalAmount) * 1000) / 10, // 1 位小数
    };
  });
}

/** 持仓操作建议 */
export function buildHoldingAdvices(
  holdings: HoldingItem[],
  quotes: Map<string, StockQuote | EtfQuote>,
  sectorMap: Map<string, SectorBoard>
): HoldingAdvice[] {
  const weighted = fillHoldingWeights(holdings);

  return weighted.map((h) => {
    const q = quotes.get(h.code);
    const price = q?.price;
    const chg = q?.changePercent ?? 0;
    const name = q?.name || h.name;
    const metrics = deriveHoldingMetrics(h, price);
    const pnlPct = metrics.pnlPct;
    const weight = h.weight;

    const sectorTags =
      h.sectorTags && h.sectorTags.length
        ? h.sectorTags
        : inferSectorTags(name);
    const themes = matchThemes(name, sectorTags);
    // 关联板块涨跌辅助
    let sectorChg = chg;
    if (sectorTags.length) {
      for (const [, b] of sectorMap) {
        if (sectorTags.some((t) => b.name.includes(t))) {
          sectorChg = b.changePercent;
          break;
        }
      }
    }

    const base = actionByChange(chg, pnlPct);
    let action = base.action;
    const reasons: string[] = [];

    if (sectorTags.length) {
      reasons.push(`所属板块：${sectorTags.join(" / ")}`);
    }

    if (q) {
      reasons.push(
        `现价/净值 ${price?.toFixed(3)}，今日 ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`
      );
    } else {
      reasons.push("暂未取到实时行情/估值，建议稍后刷新");
    }
    if (metrics.amount !== undefined) {
      reasons.push(
        `持仓金额 ${fmtMoney(metrics.amount)}` +
          (metrics.profit !== undefined
            ? `，持有收益 ${fmtMoneySigned(metrics.profit)}`
            : "")
      );
    }
    if (pnlPct !== undefined) {
      reasons.push(`相对成本盈亏约 ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`);
    }
    if (Math.abs(sectorChg - chg) > 1.5) {
      reasons.push(`关联板块涨跌约 ${sectorChg.toFixed(2)}%，注意个基/ETF 弹性差异`);
    }

    // 主题特判：科技高位去拥挤
    const isTech = themes.some((t) =>
      t.tags.some((x) => ["半导体", "芯片", "CPO", "PCB", "电子"].includes(x))
    );
    if (isTech) {
      if (chg <= -3) {
        action = "观望";
        reasons.push("科技/算力链仍处去拥挤段，急跌后优先等波动收敛再分批");
      } else if (chg >= 3) {
        action = "减仓";
        reasons.push("科技反弹中注意高位回吐，浮盈较大可考虑降波动");
      } else {
        reasons.push("科技主题：中长期逻辑可在，短线忌满仓博弈");
      }
    }

    const isBroad = themes.some((t) =>
      t.tags.some((x) => ["宽基", "指数", "红利"].includes(x))
    );
    if (isBroad && Math.abs(chg) < 2) {
      action = "持有";
      reasons.push("宽基/红利波动相对可控，适合作底仓或缓冲仓");
    }

    // 仓位权重提示（金额推导或手填）
    if ((weight || 0) >= 40 && (chg <= -2 || (pnlPct || 0) < -8)) {
      reasons.push("单基仓位偏重，回撤时优先考虑降集中度");
      if (action === "分批建仓") action = "观望";
    }
    if ((weight || 0) >= 30 && chg >= 3 && (pnlPct || 0) > 20) {
      action = "止盈";
      reasons.push("高仓位+高浮盈，建议部分止盈锁定收益");
    }

    if (!reasons.length) reasons.push("维持纪律，按计划分批，不赌单日反转");

    const risk =
      isTech && chg < 0
        ? "高波动成长主题，外盘与中报验证扰动大"
        : Math.abs(chg) >= 3
          ? "当日波动偏大，注意流动性与冲击成本"
          : "常规波动，控制杠杆与集中度即可";

    return {
      code: h.code,
      name,
      action,
      confidence: clamp(base.confidence + (q ? 5 : -10)),
      horizon: base.horizon,
      reasons: reasons.slice(0, 6),
      risk,
      price,
      changePercent: chg,
      pnlPct,
      amount: metrics.amount,
      profit: metrics.profit,
      costAmount: metrics.costAmount,
      weight,
      sectorTags,
      fundType: h.fundType,
    };
  });
}

function fmtMoney(n: number) {
  if (Math.abs(n) >= 10000) return `${(n / 10000).toFixed(2)}万`;
  return `${n.toFixed(2)}元`;
}

function fmtMoneySigned(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtMoney(n)}`;
}

/** 从 ETF 列表里给板块匹配相关 ETF */
export function matchEtfsForSector(
  sectorName: string,
  etfs: EtfQuote[],
  limit = 6
): EtfQuote[] {
  const keys = sectorName.replace(/(概念|行业|板块)/g, "").split("");
  // 简单：名称包含板块关键词
  const scored = etfs
    .map((e) => {
      let s = 0;
      if (e.name.includes(sectorName)) s += 10;
      for (const t of THEME_RULES) {
        if (t.keywords.some((k) => sectorName.includes(k))) {
          if (t.keywords.some((k) => e.name.includes(k))) s += 5;
          if (t.etfs.some((k) => e.name.includes(k.replace("ETF", "")))) s += 3;
        }
      }
      // 字符重叠弱匹配
      const hit = keys.filter((ch) => e.name.includes(ch)).length;
      s += Math.min(3, hit / 4);
      return { e, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.e.amount - a.e.amount);
  return scored.slice(0, limit).map((x) => x.e);
}

/** 默认观察持仓（赵德涛近期焦点，可被用户覆盖；示例金额仅作演示） */
export const DEFAULT_WATCH_HOLDINGS: HoldingItem[] = [
  {
    code: "512480",
    name: "半导体ETF",
    type: "etf",
    amount: 30000,
    profit: 0,
    weight: 30,
    sectorTags: ["半导体", "芯片"],
  },
  {
    code: "588000",
    name: "科创50ETF",
    type: "etf",
    amount: 20000,
    profit: 0,
    weight: 20,
    sectorTags: ["科创", "半导体"],
  },
  {
    code: "515050",
    name: "5G通信ETF",
    type: "etf",
    amount: 15000,
    profit: 0,
    weight: 15,
    sectorTags: ["通信", "CPO"],
  },
  {
    code: "510300",
    name: "沪深300ETF",
    type: "etf",
    amount: 25000,
    profit: 0,
    weight: 25,
    sectorTags: ["宽基", "指数"],
  },
  {
    code: "510880",
    name: "红利ETF",
    type: "etf",
    amount: 10000,
    profit: 0,
    weight: 10,
    sectorTags: ["红利", "高股息"],
  },
];
