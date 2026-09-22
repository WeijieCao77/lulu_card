# 竞技对手缺人修复验收（2026-09-22）

`card_check.ts` 真正跑比赛时发现 UP/T13 只有 sasi、Climber、Saber、Xiaoxia 四人，LoL 模拟器按五人制拒绝继续。盘点还发现 OMG、KDC、S、ZYB、SKE 有人数或位置缺口。

主要实现经 DeepSeek V4 Pro 两轮生成，审核修正了缓存初始化、最大本队位置匹配、替补排序及测试中的人物身份判断。修复范围为 `arena.ts` 构造的临时竞技世界，未修改 `world.json`、真实队籍或卡牌所属队伍。

- 先用位置匹配尽可能保留本队真实普通卡；五名选手必须是五个不同 person。
- 空位优先同赛区自由选手，再同赛区其他队；按与球队评分差距及稳定 ID 排序。必要时才跨赛区，不使用彩卡或虚构人物。
- 替补克隆独立 ID `AS:队伍ID:原选手ID`，战报名标注“临时替补”，供体队伍不丢失成员。原队 ID 保留，旧天梯待打对手仍可结算。
- 每队名单在模块载入时预计算；每场只克隆临时对象。
- 不给玩家自己的缺人或重复卡组补人。杯赛继续使用现有真实卡组与错位规则；旧杯赛不足五人球队由原有 `repairCup` 路径迁移为可用对手。

本版缺口补位：OMG 辅助 Niket；UP 下路 LP；KDC 上单 Mihile、下路 Cypher、辅助 Ghost；S 下路 Meech、辅助 Breezy；ZYB 打野 Boukada；SKE 中单 JimieN。以上仅为游戏模拟的临时补位，不是现实转会或官方阵容声明。

## 验证

- 新增 `scripts/check_arena_rosters.ts`：101 个世界对手均实际完成 BO1；每队五位置、五个独立真人普通卡；97 个杯赛卡组均可构造五人队伍。
- UP 保留原四人且恰好补一名下路；使用已存 `pending.club=T13` 通过 `runAction('ladder')` 真正打完，待打记录正常结算。
- 含 UP 的旧杯赛路径通过 `repairCup` 后可 `runAction('cup_play')`。
- 原始 `WORLD_TEAMS`、`WORLD_PLAYERS` 全量序列化前后相等。
- 本队原本覆盖五个位置的队伍无额外替补。
- `scripts/check_ladder_pin.ts` 原有对手锁定测试全部通过。
- `npm run typecheck` 通过；新增阵容回归已纳入 GitHub workflow 与统一审计清单。
