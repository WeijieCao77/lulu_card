# 正式版手机号与短信接入准备（未上线）

当前线上仍为内测规则，手机号入口关闭。本文件记录正式版需要的服务与变量；**不要把真实密钥提交到 Git，也不要在当前 Railway 生产环境提前切换配置或代码**。

## 需要开通什么

1. 注册或登录阿里云账号并完成实名认证。个人开发者可使用 **号码认证服务（PNVS）→ 短信认证**；这与阿里云“短信服务 SMS”是两个产品，API 端点不同。到号码认证控制台开通短信认证并确认余额/套餐可发送。
2. 在阿里云 RAM 建立专用子用户的 AccessKey，只授予 `dypns:SendSmsVerifyCode` 与 `dypns:CheckSmsVerifyCode` 所需权限。可直接使用 [最小权限策略 JSON](aliyun-sms-ram-policy.json) 在 RAM 创建自定义权限策略；阿里云将这两项操作定义为服务级权限，Resource 只能使用 `*`。将 AccessKey ID/Secret 保存在密码管理器，最终只填 Railway Variables，不发在聊天或代码里。
3. 在 **短信认证参数配置**里抄取该账号当前可用的**系统签名**与配套**系统模板 Code**。两者必须成对。不要沿用旧项目的“速通互联验证码”签名：阿里云已公告历史赠送签名在 **2026-08-31** 停止支持。模板编号 `100001` 本身仍可能有效，须以本账号控制台当前显示为准。
4. Railway 正式环境设置 `ALIYUN_SMS_ACCESS_KEY_ID`、`ALIYUN_SMS_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE`。同时设置独立、长期保存的 `PHONE_KEY`、`PHONE_SALT`、`ANALYTICS_TOKEN`，以及 `NODE_ENV=production`。`PHONE_GATE=0`、`PHONE_SMS_DEV=1` 不得保留。切换或重建 `PHONE_KEY`、`PHONE_SALT` 会令既有手机号记录无法匹配或账号 ID 无法解密。
5. 用自己的真实大陆手机号在**隔离的预发布环境**先验收：收码、错误码、到期、绑定、同号第二账号拒绝、换设备手机号找回、服务商故障；再对正式环境进行小范围真实短信验证。海外号码当前只有后台人工审核路径，需要逐人核验，不能当成批量绕过手机号的默认注册方式。

短信认证 API 按运营商送达状态计费。阿里云当前公布的每月前 1000 条按量价为 **0.06 元/条**，短信认证套餐包可选，并非测试的必购项；先查看号码认证服务套餐余量及阿里云账户余额，余额足够时无需额外充值。若余额不足，测试前由账号所有者决定是否少量充值。不要购买独立「短信服务 SMS」的套餐包，两类套餐不能互相抵扣。价格以[阿里云号码认证服务计费页](https://help.aliyun.com/zh/pnvs/product-overview/product-pricing)的实时说明为准。

号码认证控制台与步骤见 [阿里云个人开发者接入指南](https://help.aliyun.com/zh/pnvs/use-cases/sms-verify-for-individual-developers)、[SendSmsVerifyCode 文档](https://help.aliyun.com/zh/pnvs/developer-reference/api-dypnsapi-2017-05-25-sendsmsverifycode) 和 [签名变更公告](https://help.aliyun.com/zh/pnvs/product-overview/sms-authentication-signature-change-notification)。

## 2026-09-23 控制台核对

- 当前账号的「短信认证」显示**已开启**。同一功能页还显示号码认证、图形认证、融合认证为已开启；这些并非噜噜卡目前的接入需求，正式使用前核对其状态与可能的用量。
- 「短信认证参数配置」的赠送签名列表显示六个「通过」的签名，包括 `恒创联众`。赠送模板中「登录/注册模板」的 Code 为 `100001`，内容包含验证码和有效分钟数。可将这组现行系统签名、模板作为接入候选，正式设置变量前再次确认控制台仍可用，并做真实发送测试。
- 用户已在 RAM 创建 `lulucard-sms` 并下载 AccessKey CSV，另存了本地副本；本记录不包含也不读取密钥。已在 RAM 创建自定义策略 `LuluCardSmsVerifyOnly`，控制台源代码核对仅含 `dypns:SendSmsVerifyCode` 和 `dypns:CheckSmsVerifyCode`。用户确认已将该策略绑定到 `lulucard-sms`；本次无法独立复核绑定后的列表（浏览器会话中已无该标签页）。当前没有调用发送接口，也没有产生测试短信费用。下一步是在隔离的预发布环境配置密钥并做真实短信验收，不能直接改当前生产环境。

## 与开瓦包认证机制对照

对照 `WeijieCao77/Val_Manager` 的 `bf8f6df`：两边都使用阿里云**号码认证服务的短信认证 API**（`SendSmsVerifyCode` / `CheckSmsVerifyCode`），大陆手机号发码与验码、每号一分钟一次且每天最多五条、一个手机号一个账号、手机号找回原账号、海外玩家后台人工审核。噜噜卡沿用这些产品规则；正式版要求显式填写当前签名和模板、仅在本地非生产环境允许开发验证码，并严格按阿里云实际 5 分钟有效期处理，不沿用开瓦包的旧默认签名或较宽松的开发回退。这里是同一认证机制，不需要另开阿里云「短信服务 SMS」产品。

## 代码与验收边界

- 正式策略启用后，服务端未验证账号无法执行卡牌操作、杯赛或交易；`PHONE_GATE=0` 不再是正式版绕过开关。一个手机号只能绑定一个账号，一个账号只能绑定一个手机号。同一验证码只能成功完成一次绑定/找回。
- 验证码由 PNVS 动态生成并校验，有效期 5 分钟；本地只保存发送频率与流程状态，不保存短信正文或完整号码。每号至少间隔 60 秒，每日最多 5 条；失败不消耗绑定权。服务端线上既不生成也不返回开发验证码。
- 无短信服务、签名/模板缺失或误设开发模式时，正式版启动或发送必须失败关闭，不能静默放行玩家。启动配置检查仍不能证明短信真实送达。
- 测试：`npx tsx scripts/check_phone.ts`、`npx tsx scripts/check_phone_atomic.ts`、`npx tsx scripts/check_phone_config.ts`、`node scripts/check_formal_phone_gate.mjs`。最后一个脚本在本机临时打包正式策略，运行真实卡牌 API 与手机号 API，不触及当前线上构建。

此处只完成代码准备；正式版规则切换、内测删档、上线部署均需另行确认并执行总发布清单。
