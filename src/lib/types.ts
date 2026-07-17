/** A股股票基础行情 */
export interface StockQuote {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number; // 手
  amount: number; // 元
  turnover: number; // 换手率 %
  pe: number; // 市盈率（动态）
  pb: number; // 市净率
  high: number;
  low: number;
  open: number;
  prevClose: number;
  totalMV: number; // 总市值 元
  circMV: number; // 流通市值 元
  amplitude: number; // 振幅 %
  volumeRatio: number; // 量比
  market: "SH" | "SZ" | "BJ";
}

/** 推荐结果 */
export interface RecommendItem extends StockQuote {
  score: number;
  rank: number;
  tags: string[];
  reasons: string[];
  factorScores: {
    momentum: number;
    volume: number;
    valuation: number;
    activity: number;
    stability: number;
  };
}

/** 市场概览 */
export interface MarketOverview {
  shIndex: { name: string; price: number; changePercent: number };
  szIndex: { name: string; price: number; changePercent: number };
  cybIndex: { name: string; price: number; changePercent: number };
  upCount: number;
  downCount: number;
  flatCount: number;
  limitUp: number;
  limitDown: number;
  total: number;
  updatedAt: string;
  trading: boolean;
}

export type StrategyKey = "balanced" | "momentum" | "value" | "hot";

export interface StrategyMeta {
  key: StrategyKey;
  name: string;
  desc: string;
}

/** 板块（行业/概念） */
export interface SectorBoard {
  code: string; // BKxxxx
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  amount: number;
  upCount?: number;
  downCount?: number;
  leadStock?: string;
  type: "industry" | "concept";
}

/** ETF / 场内基金 */
export interface EtfQuote {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  amount: number;
  turnover: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  market: "SH" | "SZ";
  totalMV?: number;
}

/** K线 / 净值点 */
export interface NavPoint {
  date: string;
  open?: number;
  close: number;
  high?: number;
  low?: number;
  volume?: number;
  amount?: number;
  changePercent?: number;
  nav?: number; // 单位净值（若有）
  accNav?: number; // 累计净值
}

/** 支付宝/场外基金 + 场内 ETF 统一检索结果 */
export interface FundInfo {
  code: string;
  name: string;
  /** 产品类型：股票型 / 混合型 / 指数型 / ETF 等 */
  fundType?: string;
  /** 基金公司 */
  company?: string;
  /** 最新单位净值 */
  nav?: number;
  /** 净值日期 */
  navDate?: string;
  /** 盘中估值净值 */
  estimateNav?: number;
  /** 估值涨跌幅 % */
  estimateChangePercent?: number;
  /** 东财主题/板块（如 消费、白酒、半导体） */
  themes?: string[];
  /** 归一化板块标签（用于展示与建议） */
  sectorTags?: string[];
  /** 来源类别 */
  category?: "fund" | "etf" | "other";
}

/** 持仓条目（前端 localStorage + API 建议） */
export interface HoldingItem {
  code: string;
  name: string;
  type: "etf" | "fund" | "stock" | "sector";
  /** 持仓金额（元，当前市值）——主录入方式 */
  amount?: number;
  /** 持有收益（元，累计浮盈/浮亏）——主录入方式 */
  profit?: number;
  shares?: number; // 份额（可选）
  cost?: number; // 成本净值/价（可由金额+收益反推）
  weight?: number; // 仓位占比 %（可由金额自动计算）
  note?: string;
  sectorTags?: string[]; // 关联板块标签
  /** 基金类型文案（股票型/混合型/ETF 等） */
  fundType?: string;
}

export type AdviceAction = "加仓" | "减仓" | "持有" | "观望" | "分批建仓" | "止盈" | "止损观察";

export interface HoldingAdvice {
  code: string;
  name: string;
  action: AdviceAction;
  confidence: number; // 0-100
  horizon: string;
  reasons: string[];
  risk: string;
  price?: number;
  changePercent?: number;
  pnlPct?: number; // 相对成本盈亏%
  /** 持仓金额（元） */
  amount?: number;
  /** 持有收益（元） */
  profit?: number;
  /** 成本金额 = 持仓金额 - 收益 */
  costAmount?: number;
  /** 仓位占比 %（按金额加权） */
  weight?: number;
  /** 板块标签 */
  sectorTags?: string[];
  /** 基金类型 */
  fundType?: string;
}

/** 板块三维分析 */
export interface SectorAnalysis {
  code: string;
  name: string;
  changePercent: number;
  amount: number;
  technical: {
    summary: string;
    position: string;
    signals: string[];
    score: number;
  };
  news: {
    summary: string;
    catalysts: string[];
    risks: string[];
    score: number;
  };
  policy: {
    summary: string;
    supports: string[];
    score: number;
  };
  fundView: {
    relatedEtfs: string[];
    action: AdviceAction;
    confidence: number;
    comment: string;
  };
  updatedAt: string;
}
