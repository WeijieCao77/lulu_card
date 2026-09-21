# 噜噜卡 · 猪之家出品

LoL 选手卡牌游戏 Demo。包含抽卡、收藏、阵容羁绊、统一天梯、分级全服杯、交易市场、好友、挑战、小游戏、信箱和管理后台。游戏机制改编自 [Val_Manager](https://github.com/WeijieCao77/Val_Manager)，基础选手模型来自 [LOL_manager](https://github.com/WeijieCao77/LOL_manager)。

## 本地运行

需要 Node.js 22（与部署环境一致）。

```sh
npm ci
npm run build
npm run local
```

打开 <http://127.0.0.1:8088>。本地数据库保存在 `.local-data/lol-cards`，重启保留账号；该目录不会提交到 Git。开发时另开终端运行 `npm run dev -- --port 5173`，访问 <http://127.0.0.1:5173>。

## Railway 部署

1. 在 Railway 从本仓库的 `main` 分支创建服务，Root Directory 保持仓库根目录 `/`。
2. 在同一项目中添加 **PostgreSQL**，给游戏服务添加 `DATABASE_URL` 的数据库引用变量（通常是 `${{Postgres.DATABASE_URL}}`，按实际数据库服务名选择）。
3. 设置游戏服务变量：

| 变量 | 设置 |
| --- | --- |
| `NODE_ENV` | `production` |
| `ANALYTICS_TOKEN` | 自己生成的一段独立随机密钥，用于后台登录 |
| `PHONE_KEY` | 另一段独立随机密钥，至少 24 字符 |
| `PHONE_SALT` | 另一段独立随机密钥，至少 24 字符 |
| `PHONE_GATE` | Demo 设为 `0`，无需配置短信即可试玩 |

可在本地运行以下命令生成一段密钥，运行三次分别填入上述三个密钥变量。不要将生成结果提交到 Git。

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

4. 在游戏服务 Settings 设置 Builder 为 **Dockerfile**（路径 `/Dockerfile`）、Start Command 为 `npm start`、Healthcheck Path 为 `/readyz`、超时 300 秒；重启策略选 On Failure。设置 `PORT=8080`，Networking 域名的 Target Port 也设为 `8080`。
5. 部署后在 Networking 生成域名。游戏路径 `/`，后台路径 `/admin`。确认 `/readyz` 返回 HTTP 200 后再试玩。

仓库的 `railway.json` 保留原版部署设置供对照。Railway 已弃用 Config as Code，新服务不能启用此文件，所以新部署务必按上一步在服务 Settings 配置，不能假设文件自动生效；参见 [Railway 官方说明](https://docs.railway.com/config-as-code)。无需设置 `HOST`，也不要使用本地的 `npm run local` 作为线上启动命令。生产使用 PostgreSQL 保存数据，无需给游戏容器挂本地数据库卷。首次启动自动创建表。

如果域名返回 502，先查看运行日志。`Production phone secrets missing or weak` 表示没有配置稳定的 `PHONE_KEY` / `PHONE_SALT`，即使 Demo 的 `PHONE_GATE=0` 也必须配置。没有 `DATABASE_URL` 时同样无法完成就绪检查。添加数据库后需手动添加游戏服务的引用变量，不会自动连上。

密钥首次配置后保持稳定；已有账号时不要随意更换 `PHONE_KEY` / `PHONE_SALT`。开启手机验证需要另外配置短信服务，参考 `docs/phone-key-rotation.md` 和 `phone-config.js`。GitHub Actions 只进行构建和测试，部署由你连接的 Railway 服务负责，不会触碰原 VAL 项目。

Railway 官方文档：[GitHub / Node 部署](https://docs.railway.com/guides/express)、[PostgreSQL](https://docs.railway.com/databases/postgresql)、[引用变量](https://docs.railway.com/variables)。

## 信箱与后台

- 游戏顶栏、导航下方都有「信箱」入口，包含玩家建议与奖励/交易通知。
- 内测建议提交后立即上榜，无需审核，无每小时或每日投稿额度；支持热门、最新、我的建议及投票。后台可置顶、采纳、标记修复、隐藏、合并重复建议和移除。
- 奖励由服务器结算，进入信箱会收取新邮件；每次最多 100 条。记录最多保留最近 40 条，重复收取不会再次发奖。
- 「后台看板」打开 `/admin`，输入 `ANALYTICS_TOKEN`。支持游玩统计、留存与时长、建议整理、玩家查询、卡牌/卡包/金币发放、奖励记录与重复发奖处理、交易风控、账号审核、短信状态和社区配置。发放内容进入玩家信箱。功能对照见 [后台对照表](docs/admin-parity.md)。
- 本地 `npm run local` 首次生成 `.local-data/admin-token.txt`，可打开此文件复制密钥登录。密钥只存在本机，不会推送；线上请自行设置 Railway 变量。
- 浏览器仅在当前标签页会话中保留后台密钥，请求走 Authorization 头；退出后台会清除它。

## 卡池与玩法

当前内测：新账号开局 100,000 金币；市场无注册天数/抽卡次数门槛，一口价立即成交，拍卖倒计时保留。临时规则集中在 `release-policy.js`；已有账号余额不会重置。正式发布前必须完成 [临时修改台账及上线检查](docs/production-release-checklist.md)，恢复正式配置并执行 `npm run check:production`。

内测暂不开放手机号绑定及手机号登录，前端隐藏入口、服务端拒绝相关请求；请保存账号 ID。名人堂每页 12 张、收藏每页 48 张，减少同时渲染的卡面。[性能检查记录](docs/performance-audit-2026-09-21.md) 包含本地 100/200 人测试及已知限制，尚不能据此保证 Railway 百人同时比赛流畅。

677 位普通选手、114 张教练卡，覆盖 LPL、LCK、LEC、LCS、LCP、CBLOL。40 张彩卡包含 S3–S15 年度卡、S8 IG 六人冠军阵容（Ning FMVP 不重复）、MSI MVP 与 11 张知名选手卡。全部可在名人堂查看。

知名选手：Doublelift、Bjergsen、Perkz、Rekkles、Sneaky、Jensen、Xmithie、Aphromoo、Froggen、Diamondprox、sOAZ。已有 MVP 版本的人不再重复制作生涯版。S3 Faker 为冠军纪念卡；S4–S6 标注赛事 MVP，之后为决赛 MVP。

普通金卡 84–90 分；知名选手彩卡 90–92、冠军成员 90–94、MSI MVP 93–95、S 赛 MVP 94–97。分数是游戏设定，非官方能力评估。缺照片使用文字卡面，照片年份与卡牌代表年份分别标注。名单依据 2026 最近赛事参赛记录整理，不等同于实时转会合同名单。

`src/data/teamLineages.json` 维护 10 组有来源的战队沿革，支持 SKT/T1 等传承羁绊；青训队与主队、转会两端的队伍不会自动合并。彩卡照片、署名与出处保存在 `worldsLegends.json` 及图鉴数据中。

开包支持拖至祭坛、逐张翻牌、全部翻开和彩卡独立演出。开发环境 `/pack-preview.html` 使用固定样例，不消耗账号资源；此页面不进入生产构建。DeepSeek V4 Pro 参与界面、音效、建议界面、后台统计及运营工具，结果经本地整合与验证。

## 验证

```sh
npm run build
npx tsx scripts/check_worlds_cards.ts
npx tsx scripts/check_team_lineage.ts
npx tsx scripts/check_dashboard.ts
npx tsx scripts/check_mailbox.ts
node scripts/check_admin_entry.mjs
node scripts/check_admin_metrics.mjs
```

后台集成测试使用独立内存数据库，验证登录权限、统计查询、后台发奖→信箱到账、重复领取与已读状态，不触碰试玩账号。`scripts` 中保留原版其他审计工具；`check_lol_base.ts` 的原版对照部分需要工作区旁的 `reference-val`，不属于此仓库 CI。

非 Riot Games 官方产品。LoL、战队标志及赛事照片归相应权利人；逐卡来源可在图鉴查看。当前是开发 Demo，后续继续调整数值、体验与卡池。
