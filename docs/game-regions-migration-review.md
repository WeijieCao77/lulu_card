# 三大游戏赛区迁移审查（2026-09-22）

本轮用户明确授权把游戏分类合为 LPL、LCK、欧美；原 LEC/LCS/LCP/CBLOL 全部归入“欧美”。这覆盖之前六区独立卡包/收集的设计决定。现实联赛、国籍与俱乐部信息没有改写：`types.Region`、`card.region` 和队伍元数据仍保留原六联赛，`gameRegionOf` 只负责游戏分组。

## 实现和兼容

- `gameRegions.ts` 公开 `GameRegion = LPL | LCK | WEST`、`GAME_REGIONS`、`GAME_REGION_CN`、`gameRegionOf(raw)`；`gacha.Series/SERIES` 使用同一分组。
- 开放赛区包是 `cn/pac/west`。欧美包含四个原联赛的普通选手与对应彩卡，不包含教练。价格 2,600，每周自选八折 2,080，三张、至少一张银卡，参数与现有 LPL/LCK 包一致。没有重复叠加推荐折扣。
- 旧 `ame/emea/lcp/cblol` 定义只用于读取历史；货架、概率表与后台新赠送列表不再提供它们。旧客户端打开这些包会提示刷新，不会偷偷替换卡池扣费。金币购买 `west` 仍需服务器核对 `expectedPrice`；旧页面、跨周过期价格或伪造低价均在改种子/扣资源前拒绝。
- `migrateGacha` 中将四种旧包库存与已有 `west` 数量相加，删除旧包键；再次迁移不再增加。非赛区库存不改，合法整数数量不设置新的任意上限。
- `series` 的真实存储是已领取连续档数，不是列表。欧美保留四个旧区及已有 WEST 的最高已领取档，删除四个旧键；历史奖励不追回，已领同档不能再领。例：旧区分别领 1/3/2/4 档，合并后为 4；补齐欧美后只领第五档 15,000 金币和一个十连包。
- 旧每周选择映射 WEST，保留服务器所在上海日历的原周一键，本周不能借改版换成 LPL/LCK。旧客户端新选择、奖励动作只接受三个正式分类。
- 旧未领取官方赠包邮件在领取时转为等量 `west`，本次邮件显示“欧美包”；已经保存的历史消息文本不重写。
- 原 LCP/CBLOL 包过去不出彩卡、不累计彩卡保底；转换后统一按欧美包规则出彩卡并累计共用保底。没有追补历史抽数，也没有重置现有保底。
- 选手卡 ID、等级、重复数、升级备用卡、已有市场报价和杯赛快照不属于赛区迁移。普通卡数值/颜色更新的资格及已挂单处理另见主线程和数值审查，不能从此文推断这些都未变化。
- 市场筛选通过 `readFilter/matchesFilter` 从当前 `ALL_CARDS` 生成卡 ID 集合，数据库货架再用 ID 过滤；没有需要迁移的赛区摘要列。旧六区筛选参数归并为三区，未知值不会意外变成全量匹配。
- 后台赠送提供 `west`，历史日志名称仍保留旧包说明；禁用首尔包的原有业务规则未解除。

## 数值同步

天梯机器人分段池由 `CUP_TEAMS` 的新普通卡阵容评分排序，仍取与 `WORLD_TEAMS` 的交集，不改写现实队伍元数据；同分以 ID 稳定排序。天梯胜利奖励的对手 strength 改为 `arenaOpponentRating` 的新阵容评分加难度修正；普通卡数值与竞技场能力、界面显示由本轮数值/界面工作配套完成。

## DeepSeek 分工与审核

实际调用 DeepSeek v4-pro 进行了设计、引擎精确补丁、后台与禁用包断言、迁移回归初稿和天梯排序最小修改。审核拒绝/修正了其保留六区 Series 的错误方案、漏接迁移/导入、把原 pool 传入三区函数、存档循环依赖、错误的测试夹具 ID、同对象幂等比较、每次重置相同种子的抽样，以及把伪造客户端状态直接当服务端状态的测试。只保留与当前源码相符且经过执行验证的实现；未采用没有证据的推测性漏洞描述。

## 已执行验证

- `npm run typecheck`：通过（界面三区代码与普通卡新数值已接入）。
- `npx tsx scripts/card_check.ts`：完整脚本退出 0，日志无 FAIL/Error；覆盖所有开放包保底、停用包拒绝无消费、60 天天梯模拟与杯赛等原有检查。
- `npx tsx scripts/check_arena_card_scale.ts`：独立复验通过，101 个对手与天梯分段平均评分递增检查。
- `npx tsx scripts/check_card_rarity.ts`、`npx tsx scripts/check_swap_regrade.ts`：独立复验通过。
- `npx tsx scripts/check_authority.ts`：通过；真实 API/PGlite 验证资源权威、市场收信幂等及旧存档保留。
- `npx tsx scripts/check_fullset.ts`：通过；40 张彩卡与 791 张普通选手/教练图鉴检查。
- `npx tsx scripts/check_weekly_series.ts`：通过；原周边界/价差/服务端权威断言保留。
- `npx tsx scripts/check_series.ts`：通过；每个游戏区 4,000 个包，三个分类的池范围、银卡保底、集齐、五档奖励仅发一次及周轮换。
- `npx tsx scripts/check_mythic_floor.ts`：通过；旧 LCP/CBLOL 包明确拒绝且不消费，迁移后沿用原保底计数，改用欧美包兑现彩卡保底。
- `npx tsx scripts/check_pack_rng.ts 150`：通过；三类新赛区包与普通包连续开包检查。
- `npx tsx scripts/check_game_regions.ts`：通过；旧库存总 35 包、真实卡等级/重复/备用卡保留、全状态二次迁移幂等、合并奖励只发未领末档、旧周锁、旧包两种支付无消费、四类旧邮件、新三区普通/彩卡保底、WEST 四个原联赛均抽到、市场匹配、客户端伪造和过期价格拒绝。

本轮 `check_game_regions`、`check_swap_regrade`、`check_card_rarity`、`check_arena_card_scale` 已加入 GitHub Actions 和审计清单；`check_series` 同步进入 CI，审计抽样改为已通过的每区 4,000 包，以满足该脚本实际包含的集齐断言。

这些是源码和自动化验收，不代表真机触摸、线上旧账号迁移或部署已经执行。上线前由主线程完成完整构建、集成回归和实际浏览器检查。
