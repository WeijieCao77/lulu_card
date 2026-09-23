# 内测临时规则与正式上线检查

状态：**内测中，尚未通过正式上线验收**。记录日期：2026-09-21。

## 临时修改台账

| 项目 | 内测 | 正式上线恢复值/要求 | 位置 |
| --- | --- | --- | --- |
| 新账号开局金币 | 100,000 | 3,000（若调整需重新审核经济模型） | release-policy.js |
| 新账号卡包补给 | 试训包、选拔包、十连包各 10 个，另保留 1 个教练包 | 试训包 3、选拔包 1、十连包 0、教练包 1 | release-policy.js / starterPacks |
| 建档公告 | 首次进入游戏弹出删档内测公告，说明补给、临时交易规则、手机号关闭及避免大量小号 | 关闭内测公告并核对正式规则说明 | GateWelcome.tsx / RELEASE_STAGE |
| 注册后交易等待 | 0 天 | 3 天 | release-policy.js / TRADE_DAYS |
| 交易所需抽卡次数 | 0 抽 | 50 抽 | release-policy.js / TRADE_PULLS |
| 一口价上架保护期 | 0 秒，立即成交 | 60 秒，报名抽签 | release-policy.js / MARKET_PROTECT_SEC |
| 手机号验证与绑定 | phoneEnabled=false，绑定/手机号登录入口隐藏，发送/绑定/登录 API 返回 403；PHONE_GATE=0 | 开启验证，配置真实短信服务并测试绑定/找回 | phone-api.js / Railway Variables |
| 建议展示 | 提交立即上榜，无小时/日投稿额度 | 重新评估审核、内容与频率限制；是否恢复由产品决定 | feedback-api.js |

拍卖 2–24 小时结算、最后 10 分钟延时和延时上限没有移除。账号余额不会因更新或重新登录被重置。

防护仍保留：服务端结算及余额/持卡验证、请求幂等、交易托管、重复领取保护、市场风控记录与 A/E 自动处置、后台手动暂停交易、手机绑定代码与账号审核。放开试玩门槛不代表正式环境已安全。

## 切回正式规则

1. 将 release-policy.js 的 RELEASE_STAGE 从 demo 改为 production；前端与服务器共用此配置，必须重新完整构建。
2. 核对 Railway 的实际变量：清除 TRADE_DAYS=0、TRADE_PULLS=0、MARKET_PROTECT_SEC=0 等覆盖，或改为正式值。PHONE_GATE=1；禁止 PHONE_SMS_DEV=1；MARKET_GUARD=ban；MARKET_GUARD_AUTO 至少包含 A,E。
3. 配置真实短信服务，保留现有 PHONE_KEY / PHONE_SALT，不能通过生成新值破坏已绑定身份。后台 ANALYTICS_TOKEN 独立保存。
4. 使用拟上线环境执行 `npm run build` 和 `npm run check:production`。完整构建写入同一个随机构建编号与 release-policy 源码指纹，分别记录在 `dist/release-build.json` 和 `dist-server/release-build.json`。正式服启动时重新核对编号、来源、前端 JS/CSS 与引擎字节哈希，以及打包引擎实际的正式阶段和开局补给。只运行 `vite build` 或 `build:server`、使用旧制品、改完阶段未重建，均不得启动正式服。检查脚本只读配置，不发短信、不改存档；内测状态下应该失败。
5. 人工完成下面清单并记录证据；任何未确认项不得标记为已完成。当前 CI 验证的是 demo，不是正式上线批准。

正式服启动还要求 `NODE_ENV=production`、`PHONE_GATE=1`、`PHONE_SMS_DEV` 不为 `1`、真实 PostgreSQL `DATABASE_URL`、阿里云号码认证短信认证的 `ALIYUN_SMS_ACCESS_KEY_ID`、`ALIYUN_SMS_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE`。模板码以阿里云后台实际取得的值为准，不使用隐式默认值。`ANALYTICS_TOKEN`、`PHONE_KEY`、`PHONE_SALT` 必须各为至少 24 位、三者不同的稳定密钥；已有手机号绑定时绝不能随意更换后两者。正式代码中的交易门槛会把过低环境变量钳制到至少 3 天、50 抽、60 秒，自动风控强制封禁模式及 A/E 规则；仍须核对 Railway 环境变量，不能将内测变量原样视为完成上线配置。

阿里云侧需要开通「号码认证服务」的短信认证能力，为服务创建具备最小权限的 AccessKey，确认签名和 `SendSmsVerifyCode` / `CheckSmsVerifyCode` 可用、有可用余额或额度。将变量只配置在 Railway 的正式环境，先用自己的真实手机完成发送、错误码、过期、重复提交、绑定和登录找回测试。不要把 AccessKey、验证码或手机号明文写进仓库及验收报告。

## 性能与容量验收（正式发布前）

- [ ] 真实 Android / iPhone 真机测试：低内存设备、弱网、卡池长列表、连续开包/彩卡演出、后台恢复、屏幕旋转；检查 JS 堆、图片解码与 GPU 内存、长任务及白屏崩溃。桌面缩窄窗口不能替代真机。
- [ ] 在匹配 Railway CPU/内存/连接池配置的隔离环境执行 100/200/300 在线用户持续测试和集中开包/比赛写入测试；记录 p50/p95/p99、5xx/429、队列、事件循环、CPU、应用与数据库 RSS。
- [ ] 同一 Wi-Fi/校园网/运营商 NAT 下 100 个账号，验证 IP 限流不误伤；不能简单关闭防刷来获得好看数据。
- [ ] 持续至少 30 分钟的内存稳定性测试及峰值后恢复；混入杯赛结算、市场退款、统计汇总，验证无资金/奖励重复或遗失。
- [ ] 测试图片和静态资源缓存、首次加载量、网络往返延迟、慢请求超时、数据库索引/连接等待、Worker 队列与拒绝处理。
- [ ] 审阅 docs/performance-audit-2026-09-21.md 的已知限制；本地短压测不能当成 Railway 百人上线保证。

## 正式发布前必须重新审查

- [ ] 拉取并记录 **当时最新** WeijieCao77/Val_Manager（开瓦包）commit；逐项比较 cards-api.js、market-api.js、market-guard.js、phone-api.js、progress.js、请求幂等与客户端校验，不能只依赖本次移植时的版本。
- [ ] 手机号防小号：未验证账号服务端拒绝受限操作；同手机号绑定规则、重复绑定/并发绑定、解绑撤回、登录找回、海外人工审核及撤回均验证；不能只隐藏前端按钮。
- [ ] 短信防刷：真实验证码有效期、尝试次数、发送频率、失败处理与重放拒绝；验证短信真实可达。生产接口不能返回开发验证码。
- [ ] 服务端防作弊：伪造金币/卡牌/抽数/体力、非法卡包/卡号、重复请求、并发扣款、小游戏成绩、比赛结果、时间伪造、旧客户端存档均不能绕过服务端权威状态。
- [ ] 市场防脚本：恢复 60 秒抽签，抽签公平性与并发报名、失败退款、重复收件、最后时刻竞价、结算任务重试均验证。
- [ ] 市场防小号：恢复 3 天 + 50 抽，买卖和好友换卡双方都执行；检查 A/E 自动封禁、B/C/D 观察、手动暂停/解除、关联账号与交易证据。
- [ ] 用隔离数据库运行适用的 check_authority、check_card_integrity、check_idempotency、check_market、check_market_protect、check_market_guard、check_market_limits、check_phone、check_phone_atomic 与 PostgreSQL 并发审计。正式市场测试需设 TRADE_DAYS=3、TRADE_PULLS=50、MARKET_PROTECT_SEC=60；只在测试进程关闭手机门槛。
- [ ] 按已公布的删档内测政策，正式上线时清除内测账号、金币、卡牌、交易记录及排行，不继承到正式服。2026-09-21 用户已确定此规则；本次仅添加公告，未执行清档。正式发布时核对清档范围、环境、备份与恢复方案，再执行对应发布步骤，不能只恢复新手奖励就视为清档完成。
- [ ] 验证线上运行的是正式构建，数据库备份/回滚、稳定密钥、后台权限与日志、健康检查、资源引用和域名都通过。

验收记录：日期、审查者、开瓦包参考 commit、噜噜卡 commit、实际变量名与是否合规（不写密钥值）、测试结果、尚未解决问题。当前以上项目均未签署。
