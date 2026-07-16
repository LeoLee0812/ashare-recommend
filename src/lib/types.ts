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
