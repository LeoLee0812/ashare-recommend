import iconv from "iconv-lite";
import type { StockQuote } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function decodeMaybeGbk(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  // 腾讯/新浪接口常见 GBK；若已是 UTF-8 也能尽量读
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

interface EastmoneyDiff {
  f12: string; // code
  f14: string; // name
  f2: number | string; // price
  f3: number | string; // change %
  f4: number | string; // change amount
  f5: number | string; // volume
  f6: number | string; // amount
  f7: number | string; // amplitude
  f8: number | string; // turnover
  f9: number | string; // pe
  f10: number | string; // volume ratio
  f15: number | string; // high
  f16: number | string; // low
  f17: number | string; // open
  f18: number | string; // prev close
  f20: number | string; // total MV
  f21: number | string; // circ MV
  f23: number | string; // pb
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "-" || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function detectMarket(code: string): "SH" | "SZ" | "BJ" {
  if (code.startsWith("6") || code.startsWith("9")) return "SH";
  if (code.startsWith("0") || code.startsWith("3")) return "SZ";
  return "BJ";
}

function mapDiff(d: EastmoneyDiff): StockQuote | null {
  const code = String(d.f12 || "").trim();
  const name = String(d.f14 || "").trim();
  if (!code || !name) return null;

  // 过滤 ST / *ST / 退市整理
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

async function fetchPage(
  pn: number,
  pz: number,
  fid = "f6"
): Promise<{ total: number; list: StockQuote[] }> {
  const hosts = [
    "https://82.push2.eastmoney.com",
    "https://push2.eastmoney.com",
    "https://79.push2.eastmoney.com",
  ];

  const qs = new URLSearchParams({
    pn: String(pn),
    pz: String(pz),
    po: "1",
    np: "1",
    fltt: "2",
    invt: "2",
    fid,
    fs: FS_HS_A,
    fields: FIELDS,
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
  });

  let lastErr: unknown;
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/api/qt/clist/get?${qs}`, {
        headers: {
          "User-Agent": UA,
          Referer: "https://quote.eastmoney.com/center/gridlist.html",
          Accept: "application/json, text/plain, */*",
        },
        // 服务端缓存 60s，避免频繁打源
        next: { revalidate: 60 },
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
      const total = num(json.data.total);
      const diff: EastmoneyDiff[] = json.data.diff || [];
      const list = diff
        .map(mapDiff)
        .filter((x): x is StockQuote => x !== null);
      return { total, list };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("eastmoney fetch failed");
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

  // 去重
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
      next: { revalidate: 30 },
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

/** 单只股票查询（腾讯） */
export async function fetchQuoteByCode(
  code: string
): Promise<StockQuote | null> {
  const pure = code.replace(/^(sh|sz|bj)/i, "");
  const market =
    pure.startsWith("6") || pure.startsWith("9")
      ? "sh"
      : pure.startsWith("0") || pure.startsWith("3")
        ? "sz"
        : "bj";
  const symbol = `${market}${pure}`;

  const res = await fetch(`https://qt.gtimg.cn/q=${symbol}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 15 },
  });
  const text = decodeMaybeGbk(await res.arrayBuffer());
  const m = text.match(/="([^"]*)"/);
  if (!m || !m[1] || m[1].length < 10) return null;
  const p = m[1].split("~");
  // 腾讯字段: 1 name, 2 code, 3 price, 4 prev, 5 open, 6 volume手,
  // 31 change amount, 32 change%, 33 high, 34 low, 36 turnover?, 37 amount万,
  // 38 PE, 43 amplitude?, 44 circMV亿, 45 totalMV亿, 46 PB, 49 volumeRatio
  const price = num(p[3]);
  if (price <= 0) return null;
  const prev = num(p[4]);
  const high = num(p[33]);
  const low = num(p[34]);
  const amplitude =
    prev > 0 && high > 0 && low > 0
      ? ((high - low) / prev) * 100
      : 0;
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
    amount: num(p[37]) * 10000, // 万 -> 元
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
