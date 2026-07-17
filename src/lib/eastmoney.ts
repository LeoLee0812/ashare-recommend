import iconv from "iconv-lite";
import type { EtfQuote, NavPoint, SectorBoard, StockQuote } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function decodeMaybeGbk(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  try {
    return iconv.decode(Buffer.from(u8), "gbk");
  } catch {
    return new TextDecoder("utf-8").decode(u8);
  }
}

const FIELDS =
  "f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f10,f15,f16,f17,f18,f20,f21,f23";

// 沪深A股（不含北交所，降低噪声）
const FS_HS_A = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23";
// 场内 ETF
const FS_ETF = "b:MK0021,b:MK0022,b:MK0023,b:MK0024";

const EM_HOSTS = [
  "https://push2.eastmoney.com",
  "https://push2delay.eastmoney.com",
  "https://82.push2.eastmoney.com",
  "https://79.push2.eastmoney.com",
];

interface EastmoneyDiff {
  f12: string;
  f14: string;
  f2: number | string;
  f3: number | string;
  f4: number | string;
  f5: number | string;
  f6: number | string;
  f7: number | string;
  f8: number | string;
  f9: number | string;
  f10: number | string;
  f15: number | string;
  f16: number | string;
  f17: number | string;
  f18: number | string;
  f20: number | string;
  f21: number | string;
  f23: number | string;
  f104?: number | string;
  f105?: number | string;
  f106?: number | string;
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "-" || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function detectMarket(code: string): "SH" | "SZ" | "BJ" {
  if (code.startsWith("6") || code.startsWith("9") || code.startsWith("5"))
    return "SH";
  if (code.startsWith("0") || code.startsWith("3") || code.startsWith("1"))
    return "SZ";
  return "BJ";
}

function mapDiff(d: EastmoneyDiff): StockQuote | null {
  const code = String(d.f12 || "").trim();
  const name = String(d.f14 || "").trim();
  if (!code || !name) return null;
  if (/ST|退|N\s|C\s/i.test(name)) return null;
  const price = num(d.f2);
  if (price <= 0) return null;
  return {
    code,
    name,
    price,
    changePercent: num(d.f3),
    changeAmount: num(d.f4),
    volume: num(d.f5),
    amount: num(d.f6),
    amplitude: num(d.f7),
    turnover: num(d.f8),
    pe: num(d.f9),
    volumeRatio: num(d.f10),
    high: num(d.f15),
    low: num(d.f16),
    open: num(d.f17),
    prevClose: num(d.f18),
    totalMV: num(d.f20),
    circMV: num(d.f21),
    pb: num(d.f23),
    market: detectMarket(code),
  };
}

function mapEtf(d: EastmoneyDiff): EtfQuote | null {
  const code = String(d.f12 || "").trim();
  const name = String(d.f14 || "").trim();
  if (!code || !name) return null;
  const price = num(d.f2);
  if (price <= 0) return null;
  const market = detectMarket(code) === "SH" ? "SH" : "SZ";
  return {
    code,
    name,
    price,
    changePercent: num(d.f3),
    changeAmount: num(d.f4),
    volume: num(d.f5),
    amount: num(d.f6),
    turnover: num(d.f8),
    high: num(d.f15),
    low: num(d.f16),
    open: num(d.f17),
    prevClose: num(d.f18),
    totalMV: num(d.f20) || undefined,
    market,
  };
}

function mapBoard(
  d: EastmoneyDiff,
  type: "industry" | "concept"
): SectorBoard | null {
  const code = String(d.f12 || "").trim();
  const name = String(d.f14 || "").trim();
  if (!code || !name) return null;
  return {
    code,
    name,
    price: num(d.f2),
    changePercent: num(d.f3),
    changeAmount: num(d.f4),
    amount: num(d.f6),
    upCount: d.f104 !== undefined ? num(d.f104) : undefined,
    downCount: d.f105 !== undefined ? num(d.f105) : undefined,
    type,
  };
}

async function fetchClist(params: {
  fs: string;
  fid?: string;
  pn?: number;
  pz?: number;
  fields?: string;
  po?: string;
}): Promise<{ total: number; diff: EastmoneyDiff[] }> {
  const qs = new URLSearchParams({
    pn: String(params.pn || 1),
    pz: String(params.pz || 100),
    po: params.po || "1",
    np: "1",
    fltt: "2",
    invt: "2",
    fid: params.fid || "f6",
    fs: params.fs,
    fields: params.fields || FIELDS,
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
  });

  let lastErr: unknown;
  for (const host of EM_HOSTS) {
    try {
      const res = await fetch(`${host}/api/qt/clist/get?${qs}`, {
        headers: {
          "User-Agent": UA,
          Referer: "https://quote.eastmoney.com/center/gridlist.html",
          Accept: "application/json, text/plain, */*",
        },
        next: { revalidate: 30 },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} from ${host}`);
        continue;
      }
      const json = await res.json();
      if (json?.rc !== 0 || !json?.data) {
        lastErr = new Error(`bad rc from ${host}`);
        continue;
      }
      return {
        total: num(json.data.total),
        diff: (json.data.diff || []) as EastmoneyDiff[],
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("eastmoney clist failed");
}

async function fetchPage(
  pn: number,
  pz: number,
  fid = "f6"
): Promise<{ total: number; list: StockQuote[] }> {
  const { total, diff } = await fetchClist({ fs: FS_HS_A, fid, pn, pz });
  const list = diff.map(mapDiff).filter((x): x is StockQuote => x !== null);
  return { total, list };
}

/** 拉取全市场（分页，默认最多 1000 只按成交额排序，足够做推荐） */
export async function fetchMarketStocks(
  maxCount = 800
): Promise<StockQuote[]> {
  const pageSize = 100;
  const first = await fetchPage(1, pageSize, "f6");
  const stocks = [...first.list];
  const pages = Math.min(
    Math.ceil(Math.min(first.total, maxCount) / pageSize),
    Math.ceil(maxCount / pageSize)
  );

  if (pages > 1) {
    const tasks: Promise<{ list: StockQuote[] }>[] = [];
    for (let pn = 2; pn <= pages; pn++) {
      tasks.push(fetchPage(pn, pageSize, "f6"));
    }
    const rest = await Promise.all(tasks);
    for (const r of rest) stocks.push(...r.list);
  }

  const map = new Map<string, StockQuote>();
  for (const s of stocks) {
    if (!map.has(s.code)) map.set(s.code, s);
  }
  return Array.from(map.values());
}

/** 按涨跌幅榜拉取 */
export async function fetchGainers(limit = 50): Promise<StockQuote[]> {
  const { list } = await fetchPage(1, Math.min(limit, 100), "f3");
  return list.slice(0, limit);
}

/** 腾讯指数 */
export async function fetchIndices(): Promise<{
  sh: { name: string; price: number; changePercent: number };
  sz: { name: string; price: number; changePercent: number };
  cyb: { name: string; price: number; changePercent: number };
}> {
  const res = await fetch(
    "https://qt.gtimg.cn/q=sh000001,sz399001,sz399006",
    {
      headers: { "User-Agent": UA },
      next: { revalidate: 15 },
    }
  );
  const text = decodeMaybeGbk(await res.arrayBuffer());

  const parseLine = (line: string) => {
    const m = line.match(/="([^"]*)"/);
    if (!m) return { name: "-", price: 0, changePercent: 0 };
    const p = m[1].split("~");
    return {
      name: p[1] || "-",
      price: num(p[3]),
      changePercent: num(p[32]),
    };
  };

  const lines = text.split("\n").filter(Boolean);
  return {
    sh: parseLine(lines[0] || ""),
    sz: parseLine(lines[1] || ""),
    cyb: parseLine(lines[2] || ""),
  };
}

/** 单只股票/ETF 查询（腾讯） */
export async function fetchQuoteByCode(
  code: string
): Promise<StockQuote | null> {
  const pure = code.replace(/^(sh|sz|bj)/i, "");
  const market =
    pure.startsWith("6") || pure.startsWith("9") || pure.startsWith("5")
      ? "sh"
      : pure.startsWith("0") || pure.startsWith("3") || pure.startsWith("1")
        ? "sz"
        : "bj";
  const symbol = `${market}${pure}`;

  const res = await fetch(`https://qt.gtimg.cn/q=${symbol}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 10 },
  });
  const text = decodeMaybeGbk(await res.arrayBuffer());
  const m = text.match(/="([^"]*)"/);
  if (!m || !m[1] || m[1].length < 10) return null;
  const p = m[1].split("~");
  const price = num(p[3]);
  if (price <= 0) return null;
  const prev = num(p[4]);
  const high = num(p[33]);
  const low = num(p[34]);
  const amplitude =
    prev > 0 && high > 0 && low > 0 ? ((high - low) / prev) * 100 : 0;
  return {
    code: pure,
    name: p[1] || pure,
    price,
    prevClose: prev,
    open: num(p[5]),
    volume: num(p[6]),
    changeAmount: num(p[31]),
    changePercent: num(p[32]),
    high,
    low,
    amount: num(p[37]) * 10000,
    pe: num(p[39]) || num(p[38]),
    volumeRatio: num(p[49]) || 0,
    amplitude,
    turnover: num(p[38]) || 0,
    totalMV: num(p[45]) * 1e8 || 0,
    circMV: num(p[44]) * 1e8 || 0,
    pb: num(p[46]) || 0,
    market: market.toUpperCase() as "SH" | "SZ" | "BJ",
  };
}

/** 批量腾讯行情 */
export async function fetchQuotesByCodes(
  codes: string[]
): Promise<StockQuote[]> {
  if (!codes.length) return [];
  const symbols = codes.map((c) => {
    const pure = c.replace(/^(sh|sz|bj)/i, "");
    const m =
      pure.startsWith("6") || pure.startsWith("9") || pure.startsWith("5")
        ? "sh"
        : pure.startsWith("0") || pure.startsWith("3") || pure.startsWith("1")
          ? "sz"
          : "bj";
    return `${m}${pure}`;
  });
  // 腾讯一次不宜过多
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 40) {
    chunks.push(symbols.slice(i, i + 40));
  }
  const out: StockQuote[] = [];
  for (const chunk of chunks) {
    const res = await fetch(`https://qt.gtimg.cn/q=${chunk.join(",")}`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 10 },
    });
    const text = decodeMaybeGbk(await res.arrayBuffer());
    for (const line of text.split("\n")) {
      const m = line.match(/v_([a-z]{2})(\d{6})="([^"]*)"/i);
      if (!m || !m[3] || m[3].length < 10) continue;
      const pure = m[2];
      const market = m[1].toUpperCase() as "SH" | "SZ" | "BJ";
      const p = m[3].split("~");
      const price = num(p[3]);
      if (price <= 0) continue;
      const prev = num(p[4]);
      const high = num(p[33]);
      const low = num(p[34]);
      out.push({
        code: pure,
        name: p[1] || pure,
        price,
        prevClose: prev,
        open: num(p[5]),
        volume: num(p[6]),
        changeAmount: num(p[31]),
        changePercent: num(p[32]),
        high,
        low,
        amount: num(p[37]) * 10000,
        pe: num(p[39]) || num(p[38]),
        volumeRatio: num(p[49]) || 0,
        amplitude:
          prev > 0 && high > 0 && low > 0 ? ((high - low) / prev) * 100 : 0,
        turnover: num(p[38]) || 0,
        totalMV: num(p[45]) * 1e8 || 0,
        circMV: num(p[44]) * 1e8 || 0,
        pb: num(p[46]) || 0,
        market,
      });
    }
  }
  return out;
}

/** ETF 列表 */
export async function fetchEtfList(opts?: {
  sort?: "amount" | "change";
  limit?: number;
}): Promise<EtfQuote[]> {
  const sort = opts?.sort || "amount";
  const limit = Math.min(200, opts?.limit || 80);
  const fid = sort === "change" ? "f3" : "f6";
  const pageSize = 100;
  const pages = Math.ceil(limit / pageSize);
  const all: EtfQuote[] = [];
  for (let pn = 1; pn <= pages; pn++) {
    const { diff } = await fetchClist({
      fs: FS_ETF,
      fid,
      pn,
      pz: pageSize,
      fields: "f12,f14,f2,f3,f4,f5,f6,f8,f15,f16,f17,f18,f20",
    });
    for (const d of diff) {
      const e = mapEtf(d);
      if (e) all.push(e);
    }
  }
  // 过滤货币ETF噪声可选：保留，前端可标
  const map = new Map<string, EtfQuote>();
  for (const e of all) if (!map.has(e.code)) map.set(e.code, e);
  return Array.from(map.values()).slice(0, limit);
}

/** 行业 / 概念板块 */
export async function fetchSectors(
  type: "industry" | "concept" | "all" = "all",
  limit = 40
): Promise<SectorBoard[]> {
  const tasks: Promise<SectorBoard[]>[] = [];
  if (type === "industry" || type === "all") {
    tasks.push(
      fetchClist({
        fs: "m:90+t:2+f:!50",
        fid: "f3",
        pn: 1,
        pz: Math.min(100, limit),
        fields: "f12,f14,f2,f3,f4,f6,f104,f105,f106",
      }).then(({ diff }) =>
        diff
          .map((d) => mapBoard(d, "industry"))
          .filter((x): x is SectorBoard => x !== null)
      )
    );
  }
  if (type === "concept" || type === "all") {
    tasks.push(
      fetchClist({
        fs: "m:90+t:3+f:!50",
        fid: "f3",
        pn: 1,
        pz: Math.min(100, limit),
        fields: "f12,f14,f2,f3,f4,f6,f104,f105,f106",
      }).then(({ diff }) =>
        diff
          .map((d) => mapBoard(d, "concept"))
          .filter((x): x is SectorBoard => x !== null)
      )
    );
  }
  // 跌幅榜（行业）补充弱板块视角
  if (type === "industry" || type === "all") {
    tasks.push(
      fetchClist({
        fs: "m:90+t:2+f:!50",
        fid: "f3",
        pn: 1,
        pz: 15,
        po: "0",
        fields: "f12,f14,f2,f3,f4,f6,f104,f105,f106",
      }).then(({ diff }) =>
        diff
          .map((d) => mapBoard(d, "industry"))
          .filter((x): x is SectorBoard => x !== null)
      )
    );
  }

  const parts = await Promise.all(tasks);
  const map = new Map<string, SectorBoard>();
  for (const list of parts) {
    for (const b of list) {
      if (!map.has(b.code)) map.set(b.code, b);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)
  );
}

/** 板块成分股 */
export async function fetchBoardConstituents(
  boardCode: string,
  limit = 30
): Promise<StockQuote[]> {
  const code = boardCode.toUpperCase().startsWith("BK")
    ? boardCode.toUpperCase()
    : boardCode;
  const { diff } = await fetchClist({
    fs: `b:${code}+f:!50`,
    fid: "f3",
    pn: 1,
    pz: Math.min(100, limit),
    fields: FIELDS,
  });
  return diff.map(mapDiff).filter((x): x is StockQuote => x !== null).slice(0, limit);
}

function toSecid(code: string): string {
  const pure = code.replace(/^(sh|sz|bj)/i, "");
  if (pure.startsWith("6") || pure.startsWith("5") || pure.startsWith("9"))
    return `1.${pure}`;
  if (pure.startsWith("0") || pure.startsWith("3") || pure.startsWith("1"))
    return `0.${pure}`;
  // 板块指数 BK
  if (pure.toUpperCase().startsWith("BK")) return `90.${pure.toUpperCase()}`;
  return `1.${pure}`;
}

/** 日K / 净值走势（东财 kline） */
export async function fetchKline(
  code: string,
  limit = 60,
  klt: 101 | 102 | 103 = 101
): Promise<NavPoint[]> {
  const secid = toSecid(code);
  const qs = new URLSearchParams({
    secid,
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58",
    klt: String(klt),
    fqt: "1",
    end: "20500101",
    lmt: String(Math.min(250, Math.max(5, limit))),
  });
  const hosts = [
    "https://push2his.eastmoney.com",
    "https://push2delay.eastmoney.com",
  ];
  let lastErr: unknown;
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/qt/stock/kline/get?${qs}`, {
        headers: {
          "User-Agent": UA,
          Referer: "https://quote.eastmoney.com/",
        },
        next: { revalidate: 60 },
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      const klines: string[] = json?.data?.klines || [];
      return klines.map((line) => {
        const [date, open, close, high, low, volume, amount, amp] =
          line.split(",");
        const o = num(open);
        const c = num(close);
        return {
          date,
          open: o,
          close: c,
          high: num(high),
          low: num(low),
          volume: num(volume),
          amount: num(amount),
          changePercent: o > 0 ? ((c - o) / o) * 100 : num(amp),
          nav: c,
        } as NavPoint;
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("kline fetch failed");
}

/** 场内基金单位净值历史（东财 f10） */
export async function fetchFundNavHistory(
  code: string,
  pageSize = 60
): Promise<NavPoint[]> {
  const pure = code.replace(/^(sh|sz)/i, "");
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${pure}&pageIndex=1&pageSize=${Math.min(
    100,
    pageSize
  )}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Referer: "https://fundf10.eastmoney.com/",
    },
    next: { revalidate: 120 },
  });
  if (!res.ok) throw new Error(`fund nav HTTP ${res.status}`);
  const json = await res.json();
  const list = json?.Data?.LSJZList || [];
  return (list as Array<Record<string, string>>)
    .map((row) => ({
      date: row.FSRQ,
      close: num(row.DWJZ),
      nav: num(row.DWJZ),
      accNav: num(row.LJJZ),
      changePercent: num(row.JZZZL),
    }))
    .filter((x: NavPoint) => x.date && (x.nav || 0) > 0)
    .reverse();
}

/** 搜索 ETF/基金（从 ETF 列表 + 名称） */
export async function searchEtfs(keyword: string): Promise<EtfQuote[]> {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  const list = await fetchEtfList({ sort: "amount", limit: 200 });
  return list
    .filter(
      (e) =>
        e.code.includes(kw) ||
        e.name.toLowerCase().includes(kw) ||
        e.name.includes(keyword.trim())
    )
    .slice(0, 30);
}
