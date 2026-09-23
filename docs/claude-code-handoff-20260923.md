# 噜噜卡：交给 Claude Code 的工作交接（2026-09-23）

## 请先遵守的边界

- 用户正在准备**正式版**，但明确要求**先不要推送或上线**。可以继续在本地实现、审查、测试、提交到本地分支；不要 `git push`、合并到 `main`、改动 Railway 线上变量、部署或清空内测数据，直到用户明确通知。
- 线上仍是可玩的内测版。不能为了验收直接把现有 Railway 服务切到正式规则，也不能拿线上玩家数据库运行破坏性测试。
- 用户希望大工作量的研究、初稿和验证尽量交给 DeepSeek，Claude Code 负责筛选、修正和最终验收。不要向 DeepSeek 或任何日志发送 AccessKey、管理员口令、手机号、验证码、数据库连接串等秘密。
- 这是游戏项目，用户最关心玩家实际体验、手机号防小号、防脚本/作弊、市场公平、手机端性能与正式版安全；不要仅凭构建成功宣称可以上线。

## 仓库与当前状态

- 工作目录：`C:\Users\15967\OneDrive\桌面\撸撸卡\game`
- Git remote：`https://github.com/WeijieCao77/lulu_card.git`
- 当前本地分支：`release-prep-2026`，最新提交 `238a96e`；截至本交接，工作区干净，比 `origin/main` (`296d094`) 多 11 个本地提交，均未推送。
- `release-policy.js` 的 `RELEASE_STAGE` **仍为 `demo`**。正式规则已经写在同一文件的 `production` 策略中，但还没切换，也没有发布。
- 重要入口：`docs/production-release-checklist.md` 是正式上线总清单；`docs/phone-release-setup-20260923.md` 是阿里云短信与手机号验收记录；`docs/performance-audit-2026-09-21.md` 是容量风险记录。
- 项目为 React/Vite 前端与 Node 服务端，PostgreSQL 为正式持久化数据库；`npm run build` 构建前后端。不要只跑 `vite build` 就认为正式制品可用。

## 本轮已完成、已有证据

1. 阿里云**号码认证服务的短信认证**已经开通。专用 RAM 用户有最小权限策略，仅允许 `dypns:SendSmsVerifyCode` 和 `dypns:CheckSmsVerifyCode`。用户先在阿里云 OpenAPI 门户实际发送、核验成功；随后本地脚本用专用 RAM AccessKey 调用游戏使用的 `sendVerify`/`checkVerify`，真实手机收码与核验均成功。详情在 `docs/phone-release-setup-20260923.md`。这只证明短信接口可用，**尚未证明正式环境完整建档/绑定/找回链路**。
2. `phone-api.js` 具备手机号绑定、同号限一个账号、手机号找回、发送频率/试错限制、后台人工验证路径；正式规则下未验证账号由服务端拦住。`phone-config.js` 校验正式环境缺失/弱密钥及禁止开发验证码。`src/ui/cards/PhoneGate.tsx` 是玩家入口。
3. 最新审查修复了：阿里云校验接口故障与错码分开处理；服务商故障不消耗本地五次试错次数；找回前重新核对绑定记录、解密结果和账号，坏记录不吞验证码；正式版建档文案与手机号找回规则一致。DeepSeek 提供了第一轮代码审查，人工复核后只采纳可证实的问题。最新提交 `238a96e`。
4. 2026-09-23 本地通过：
   - `npx tsx scripts/check_phone.ts`
   - `npx tsx scripts/check_phone_atomic.ts`
   - `npx tsx scripts/check_phone_config.ts`
   - `node scripts/check_formal_phone_gate.mjs`
   - `npx tsc --noEmit`
   - `npm run build`
   正式策略测试是在本地临时打包 `production` 规则，隔离数据库测试未验证拦截、绑定、手机号找回、错码、重放和同号第二账号拒绝；**不改变当前 `demo` 开关**。

## 推荐给 Claude Code 的下一轮工作顺序

1. **先核对本地状态和风险边界。** 阅读上述三个文档、`release-policy.js`、`phone-config.js`、`phone-api.js`、`scripts/check_formal_phone_gate.mjs`，运行 `git status`；不要读取或输出本地秘密文件内容。当前文档中的“已通过”与“待验收”要保持区分。
2. **做正式版代码审查与补强。** 按总清单重点查服务端权威状态、防刷短信、伪造请求、交易并发与抽签、防小号；与当时最新的 Val_Manager/开瓦包仓库做逐项对照，记录参考 commit。先写出可复现的问题，再做修复。可以用 DeepSeek 承担独立审查和初稿，但所有结论需由 Claude Code 重现或证实。
3. **建立隔离的预发布验收。** 使用独立 PostgreSQL、独立环境变量和测试账号；只在预发布环境走真实建档、收码、错码、过期、绑定、第二账号拒绝、换浏览器/设备手机号找回、短信服务故障。真实短信会计费，控制测试次数。绝不复用线上玩家库。`scripts/smoke_aliyun_sms.ps1` 只验短信 API，不代替整链路。
4. **验收手机端与容量。** 真机 Android/iPhone 与桌面浏览器，覆盖登录、收码、卡包动画、挑战图片、卡库长列表、杯赛和市场；在与 Railway 规格接近的隔离环境测 100/200/300 并发、内存、数据库连接池、错误率和尾延迟。详细检查项见总清单。
5. **形成可审核的正式发布候选。** 在不动线上 demo 的条件下整理未完成项、测试证据与回滚/备份方案。用户通知上线后，才执行正式策略切换、完整构建、`npm run check:production`、内测删档和发布。删档会失去玩家数据，必须先核对范围、备份和用户既定公告。

## 正式版关键差异与配置提醒

- 内测：10 万金币，试训/选拔/十连包各 10 个，交易无需注册天数与抽数门槛，手机号关闭；拍卖正常倒计时仍在。正式策略：3 千金币、试训 3/选拔 1/十连 0/教练 1，交易 3 天 + 50 抽，一口价保护 60 秒，必须手机号验证。修改前可与用户再核对经济数值，但不要自行改变已确定的上线边界。
- 正式服需要真实 PostgreSQL，以及稳定、相互独立的 `ANALYTICS_TOKEN`、`PHONE_KEY`、`PHONE_SALT` 和阿里云短信四个环境变量。`PHONE_KEY`/`PHONE_SALT` 一经用于绑定不得随意更换；不要在文档、终端输出或聊天中显示其值。
- 当前本地 `.local-data/` 为忽略目录，可能含敏感运行配置或临时审查文件；不要提交、打印或复制其内容。不要把测试验证码、完整手机号写入文档。
- `npm run check:production` 在当前 demo 阶段预期**不通过**，不是当前代码失败；正式切换时必须通过，并核对 `dist` 与 `dist-server` 是同一正式构建。

## 交付方式

每轮向用户报告：具体改了什么、哪些检查真正跑过、还缺什么证据、有没有触及线上。完成准备工作后停在本地可审查状态，等待用户明确的上线通知。
