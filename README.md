# A股/基金智能看板 · Ashare Picks

多因子 A 股推荐 + 板块分析 + ETF/持仓看板（Next.js 全栈）。

## 功能

1. **个股推荐**：上证/深成/创业板 + 四策略五维打分
2. **板块三维分析**：技术 / 消息 / 政策 + 基金视角建议（重点覆盖持仓相关板块）
3. **ETF / 场内基金**：实时行情 + 近 60 日净值/收盘走势图
4. **我的持仓**：浏览器本地添加持仓，每日操作建议 + 组合加权涨跌 + 走势图
5. **实时刷新**：前端 45s / 板块 60s 自动刷新；服务端缓存 15–60s

## 技术

- Next.js App Router + TypeScript + Tailwind + Recharts
- 数据源：东方财富 clist / kline / 基金净值 + 腾讯行情
- API：
  - `GET /api/recommend?strategy=balanced&top=20`
  - `GET /api/stocks?q=茅台` / `?mode=gainers`
  - `GET /api/sectors?type=all|industry|concept`
  - `GET /api/etf?sort=amount|change` / `?q=芯片` / `?code=512480`
  - `GET|POST /api/holdings`（持仓建议 + 走势）

## 本地

```bash
npm install
npm run dev
```

## 部署

- 生产域名：`https://stock.saveme505.help` / `https://ashare.saveme505.help`
- GitHub：`https://github.com/LeoLee0812/ashare-recommend`
- Vercel 已关联 Git：`main` 分支 push 自动生产部署

## 本地自动提交推送

本机服务 `ashare-auto-git.service` 监听源码改动，防抖后自动 `git commit + push`，从而触发 Vercel 部署。

```bash
systemctl status ashare-auto-git
# 手动立即同步一次
/root/projects/ashare-recommend/scripts/auto-git-sync.sh once
# 日志
tail -f /var/log/ashare-auto-git.log
```

## 免责

本站数据仅供学习研究，**不构成任何投资建议**。股市有风险，入市需谨慎。
