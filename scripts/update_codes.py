#!/usr/bin/env python3
"""生成全 A 股代码表，供 ashare-recommend 的选股 API 使用。

为什么要有这个脚本：东方财富的行情列表接口（push2.eastmoney.com/api/qt/clist）
已经把这台东京 VPS 的 IP 封了，一律返回 502，curl_cffi 伪装 TLS 指纹也过不去
（财报类接口 datacenter-web / emweb 不受影响，只封行情列表）。
所以行情改走腾讯 qt.gtimg.cn（东京访问正常，约 0.2 秒），
但腾讯只能按代码查、没有"列出全市场"的接口，代码表就由本脚本用新浪接口生成。

代码表变动很少，一天跑一次足够。新浪那个接口要 80 秒左右，别放在请求链路里。
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta

OUT = "/root/projects/ashare-recommend/data/codes.json"


def main():
    import akshare as ak

    df = ak.stock_zh_a_spot()  # 新浪全 A 快照，代码形如 sh600519 / sz000001 / bj920000

    codes = []
    for _, row in df.iterrows():
        raw = str(row["代码"]).strip().lower()
        if not raw.startswith(("sh", "sz")):
            continue  # 只要沪深，北交所(bj)不纳入选股池，与原东财 fs 参数的口径一致
        pure = raw[2:]
        name = str(row["名称"]).strip()
        if "ST" in name.upper() or "退" in name:
            continue  # 剔除 ST / 退市整理，这类不该出现在推荐里
        # 主板/创业板/科创板：60/00/30/68 开头，其余（配股、优先股等）不要
        if not pure.startswith(("60", "00", "30", "68")):
            continue
        codes.append({"code": pure, "name": name})

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    payload = {
        "updatedAt": (datetime.now(timezone.utc) + timedelta(hours=8)).isoformat(),
        "count": len(codes),
        "codes": codes,
    }
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)
    os.replace(tmp, OUT)
    print(f"✅ 代码表已更新：{len(codes)} 只 → {OUT}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ 代码表更新失败：{type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)
