# 三大游戏赛区默契验收（2026-09-22）

用户要求欧美卡牌全部计为同一游戏赛区。实际调用 deepseek-v4-pro，由 DeepSeek 输出同区 helper、三处卡牌默契局部补丁与真实数据回归脚本。审核保留生产补丁，修正测试遗漏的 coach:null、重复同人夹具、循环计数和必须覆盖全部六对/十二组的断言，补全东亚跨区排除与彩卡样例。

## 实施范围

- gameRegions.ts 新增 sameGameRegion：双方都必须映射到有效游戏赛区。LEC/LCS/LCP/CBLOL/WEST 统一 WEST；LPL、LCK 各自独立；未知值、null、undefined 即使相等也不连。
- cards.ts 玩家链接和教练 sameRegion 总加成、coachLinks 明细三处统一使用该 helper。
- 原玩家优先级与权重保持：同俱乐部/队伍传承3 > 同国籍2 > 同游戏赛区1，不叠加玩家链接。
- 教练保留原公式：同队人数×2 + 曾执教人数 + 同区人数；明细 value 与总 coachBonus 同步。同队/传承与历史执教优先级不改。
- 真实 card.region 元数据、国籍、卡牌评分/属性/头像不改。
- 检索 arena、lolMatch、bonds、cupTeams 未发现额外独立地域默契；arena 从 chemistry 读取结果。arena 中原 region 比较仅用于真实临时替补优先选择，不在本次范围，没有改动。
- 全服杯继续使用原有归档引擎机制，未重构或更改已开赛记录。

## 验收

scripts/check_region_chemistry.ts 已通过：

- 6种原欧美赛区两两组合，使用真实异国、异队人物验证 region/1。
- 12种跨原欧美赛区教练→选手组合，coachBonus=1、coachLinks value=1且why=region。
- LPL/LCK彼此隔离，以及8种LPL或LCK→原欧美赛区的真实异国异队选手和教练排除。
- 同队3优先于国籍及赛区，同国籍2优先于赛区；不是重复同人的伪夹具。
- undefined、null、空串、未知字符串、大小写/空白错误、布尔、NaN、数字、对象和数组均不能因映射结果相同而形成链接。
- Doublelift与Caps两张历史彩卡跨原联赛同样得到region/1；卡牌与教练完整元数据无副作用。

check_team_lineage（含SKT/T1与教练传承）和 check_arena_card_scale（101队玩家/电脑同属性与纸面分、天梯分段）均通过。主线程负责UI说明、CI/audit接入与最终发布。


补充审查：使用 HEAD 的旧 cards.ts 隔离构造与当前构造逐字段 deepEqual，全部677普通卡、40彩卡、114教练元数据相同。额外的 scripts/check_coach_identity.ts 在第21行失败（实际LYON、夹具预期WOL）；再使用HEAD原测试与HEAD旧cards隔离复跑，得到同一行同一失败。这是残留VAL教练身份夹具，与本次地域默契无关；未更改真实战队数据或扩大修复范围。

主线程验收：生产构建、新赛区默契回归、全服杯归档、杯赛报名和40彩卡检查通过。浏览器卡组页确认三大区默契说明已显示。补充的全量教练属性穷举 `check_coach_values.ts` 完成普通低分与高分两组后主动停止：它还包含旧版未培养阵容哈希与已下架s24卡夹具，超出本次地区默契改动范围；不记为全套通过。本轮直接覆盖教练地区加成的12组跨联赛回归与101队同尺度回归已通过。
