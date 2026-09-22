# 普通卡与教练分档重标定验收（2026-09-22）

DeepSeek 实际调用 deepseek-v4-pro 两轮。首稿分布估计与算法不符已退回；二稿脚本已执行，修正字段 sourceOverall → source 及 Python 四舍五入与 JS Math.round 一致。方案经主线程审核后已实施。实际 DeepSeek 提供了方案、插值框架、卡接入草稿、竞技场辅助 API 和两套测试草稿；审核修正了错误字段、路径、缺失的属性平移，以及未真正复用席位算法等问题。开启 thinking 的三次追加请求返回空正文，未采用；最终代码以可运行回归结果验收。

原评分来源：工作区 scripts/bootstrap_lol.py 保留 LOL_manager 源 overall 为 sourceOverall；scripts/finalize_cards.py 旧映射为 s≤72 时 round(48+(s-50)*36/22)，否则 round(84+(s-72)*6/21)。这是已有游戏估计而非官方实力评分。

| 游戏区 | 原金/银/铜 | 现行金/银/铜 | 源金/银阈值 |
|---|---|---|---|
| LPL | 80/22/1 | 25/35/43 | 78/75 |
| LCK | 52/54/16 | 35/30/57 | 77/70 |
| WEST | 31/169/252 | 42/125/285 | 71/66 |

总计 163/245/269 → 102/190/385。固定赛区源锚点三段线性：铜[min,S−1]→[50,71]；银[S,G−1]→[72,83]；金[G,max]→[84,top]。LPL min63/max85/top90，LCK min55/max93/top90，WEST min50/max77/top88。属性每项严格加新旧评分差并截断到1—99。世界原数据不动，ID/等级/数量/头像不动；40彩卡均有独立person，不受影响。

代价：不同游戏赛区的同源分可能映射不同；同一区同源不拆、全局同显示分必同色。Faker旧85来自源76，现行83银（上一版79银）；源模型给他运营95，但对中单运营总评权重仅3%。不因历史名气单独保金。主线程已核准该游戏内分档口径。

## 全部金卡（旧→新）

### LPL (25)

Flandre: 86→85, Tarzan: 87→87, Shanks: 86→84, Hope: 86→85, Kael: 86→86, Bin: 87→87, Knight: 88→90, Viper: 87→88, ON: 86→84, Angel: 86→86, Leave: 86→84, Rookie: 86→85, GALA: 86→85, Croco: 86→84, 1xn: 86→86, Zhuo: 86→85, 369: 86→85, Creme: 86→86, Zika: 86→84, Jiejie: 86→84, Elk: 87→87, Meiko: 86→85, Ale: 86→84, Tian: 86→84, JackeyLove: 86→84

### LCK (35)

Raptor: 85→84, VicLa: 85→84, Diable: 86→85, Kellin: 87→86, DuDu: 87→86, Pyosik: 85→84, Clozer: 86→84, Peter: 86→84, Lucid: 86→85, ShowMaker: 86→85, Smash: 86→85, Career: 85→84, Kiin: 88→88, Canyon: 87→86, Chovy: 90→90, Ruler: 88→87, Duro: 87→86, GIDEON: 85→84, Teddy: 86→85, Zeus: 87→87, Kanavi: 87→86, Zeka: 87→87, Gumayusi: 87→86, Delight: 87→87, Cuzz: 87→86, Bdd: 87→86, Aiming: 88→87, Ucal: 86→84, Kingen: 86→85, Scout: 86→84, Doran: 86→85, Oner: 86→85, Peyz: 88→87, Keria: 88→87, BeryL: 86→84

### WEST (42)

Hena: 84→85, Razork: 82→84, Upset: 85→87, BrokenBlade: 82→84, SkewMond: 85→86, Caps: 85→87, Hans Sama: 84→85, Jackies: 82→84, Jun: 82→84, Canna: 85→86, Yike: 84→85, kyeahoo: 84→85, Caliste: 85→86, Elyoya: 85→86, Jojopyun: 84→85, Supa: 84→85, Rooster: 84→85, Humanoid: 82→84, Thanatos: 84→85, Blaber: 82→84, Zven: 82→84, Vulcan: 84→85, Saint: 84→85, Berserker: 85→88, Morgan: 85→87, Josedeodo: 84→85, Quid: 85→86, CoreJJ: 82→84, Shad0w: 85→86, Kiaya: 84→85, 1Jiang: 82→84, Eddie: 84→85, Bie: 84→85, Tatu: 84→85, xyno: 84→85, Zest: 84→85, Ackerman: 82→84, Rekkles: 85→86, Solokill: 84→85, FoFo: 84→85, TitaN: 84→85, Bwipo: 82→84

## 教练现状

114张普通教练不包含彩卡。原 LPL 3/11/3、LCK 8/12/0、欧美 20/38/16、未归属 3 铜。采用 DeepSeek 候选 A：金线保持78、银线68→72，不改评分或属性；现 LPL 3/8/6、LCK 8/5/7、欧美 20/22/32、未归属 3 铜，共31金35银48铜。没有使用选手84/72分界。

## 存档审核

交易卡、库存均以卡ID引用，等级及重复数保持；当前市场最低价由实时card.rarity核对，但旧价格/旧交换资格需后端复核。杯赛需区分报名和已开赛：报名资格按新稀有度复核，已开赛保留归档引擎和既有快照，不可中途对一边重标。BALANCE_VERSION=3管理胜率曲线，本轮不改曲线；另设 CARD_BALANCE_VERSION 管理评分池。


## 竞技场与资产联动

- 普通卡世界数据原样保留，cardRarity.ts 在卡构造阶段转换；CARD_BALANCE_VERSION=5 仅标识该数据方案，胜率曲线 BALANCE_VERSION=3 不变。
- 101 个电脑对手复用玩家 seatSquad 完整流程，含新卡属性、默契、教练与数值压缩；原队员 ID、实际临时替补标签不变。arenaOpponentRating 返回当前真实5卡与教练的 squadPaper，用于比赛、奖励与界面；替补相近强度选择也使用新普通卡平均值。
- 杯赛 CUP_TEAMS 自动读取新卡数据。天梯分段使用新 CUP_TEAMS 评分排序，各段实际 arenaOpponentRating 均分通过单调上升回归。
- 资产保存的 ID、level、dupes 不改。旧市场交换稀有度与全服杯报名快照由主线程/交易模块负责迁移；本子任务不改数据库。

## 已完成验证

- scripts/check_card_rarity.ts：677张逐卡8属性、颜色阈值、精确三区分布、114教练、全部三区×3金属×5位置池非空、固定锚点与单调性、非法/缺源回退。真实存档迁移由三区兼容与市场回归覆盖；没有以JSON roundtrip充当迁移验收。
- 40张彩卡与修改前独立 JSON 快照逐字段 deepEqual（包括头像、角色、属性、版本元数据）；并非只比较数量或评分。
- scripts/check_arena_card_scale.ts：101队同阵容作为玩家/电脑时全部attrs和overall精确相等、电脑paper分一致、真实五人/教练；原始WORLD_PLAYERS/WORLD_TEAMS未改变；天梯新评分分段平均单调。
- scripts/check_arena_rosters.ts：101队实际开赛、97杯赛、旧UP pending和旧cup修复通过。
- scripts/check_worlds_cards.ts：40彩卡真实身份/图片/保证抽取/区域池/彩卡阵容实赛，更新已合并的欧美包以及新金银铜数量后通过。
- npm run typecheck 通过。


## v5：LCK 金卡比例高于 LPL（2026-09-22）

用户明确要求普通金卡比例为 LCK > LPL > 欧美。DeepSeek 实际完成候选统计脚本及最小规则/测试补丁，审核者执行并修正脚本铜段50起点与冗余测试写法。DeepSeek纯文案把源76的Faker错误列入升金名单且估算人数错误，该文字已拒绝；以下仅使用真实数据脚本结果。

| LCK源金线 | 金/银/铜 | 金占比 |
|---|---|---|
| 80（v4） | 23/42/57 | 18.85% |
| 79 | 25/40/57 | 20.49% |
| 78 | 30/35/57 | 24.59% |
| 77（采用） | 35/30/57 | 28.69% |
| 76 | 40/25/57 | 32.79% |

现行金比例：LCK 35/122=28.69% > LPL 25/103=24.27% > 欧美42/452=9.29%。77方案留出明确差距，银卡30、铜卡57仍覆盖五位置。只改LCK源金线80→77以及卡数据版本4→5；共同显示金84、银72不动。LCK金/银段随原有插值公式重算属性，铜段不动；Faker源76为83银，无姓名特判。

新增12金：Diable、Smash（83→85）；Clozer、Peter、Ucal、Scout、BeryL（82→84）；Raptor、VicLa、Pyosik、Career、GIDEON（81→84）。

验证：从HEAD隔离导入旧cards/cardRarity构造并逐字段deepEqual，555张非LCK普通卡、114教练、40彩卡、57张LCK铜卡全部原样（包括undefined属性）。新版与既有彩卡fixture完整快照相等；精确总数/锚点/三大区金比例不等式/五位置各色池通过；101队玩家/电脑同尺度、旧UP与杯赛回归，以及typecheck通过。没有改原始世界数据、资产ID、等级、重复数、头像或任何照片。
