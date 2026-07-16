# A股智能推荐 · Ashare Picks

多因子 A 股推荐看板（前后端一体，Next.js）。

## 功能

- 市场概览：上证 / 深成 / 创业板 + 涨跌家数
- 四套策略：均衡精选 / 强势动量 / 低估稳健 / 热度资金
- 五维打分：动量、资金、估值、热度、稳健 + 可解释推荐理由
- 搜索个股（代码 / 名称）
- 免责声明：仅供学习研究，不构成投资建议

## 技术

- Next.js App Router + TypeScript + Tailwind
- 数据源：东方财富 clist 公开接口 + 腾讯指数/个股
- API：
  - `GET /api/recommend?strategy=balanced&top=20`
  - `GET /api/stocks?q=茅台` / `?mode=gainers`

## 本地

```bash
npm install
npm run dev
```

## 部署

- 生产域名：`https://ashare.saveme505.help` / `https://stock.saveme505.help`
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
