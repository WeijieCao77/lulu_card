# 知名选手彩卡：单赛季版本验收

2026-09-23。本轮由 DeepSeek v4-pro 三轮生成候选数据及审查意见，审核者实际检索赛事来源、核对人物/战队/位置、纠正加权错误与测试后落地。没有使用现役数据重新派生历史卡，也没有给所有卡统一加分。所有卡的 ID、人物 ID、国籍和已持有卡的等级/重复数保持不变。

“巅峰赛季”是游戏在已证实赛季表现中选择的代表版本，不是赛事官方发布的绝对巅峰或 90–92 分评级。游戏评分与属性是设计数值；官方资料只用于支持年份、位置、个人奖项和比赛表现。每张卡 `peakSeason.evidence` 保存可复查的具体来源，`source` 为赛事背景，`art.source` 为照片出处，二者分开。

|选手|固定赛季/队伍/位置|分数|本次处理与依据|
|---|---|---|---|
|Doublelift|2018 TL 下路|92|Riot 同年报道其春季季后赛 35.3 KDA 与夺冠表现；属性不变。|
|Bjergsen|2017 TSM 中单|92|LoL Esports 官方夏季 MVP 集锦；属性不变。|
|Perkz|2019 G2 下路|92|Riot 确认转下路，G2 官方年终回顾双 LEC 冠军、MSI 冠军、世界赛亚军。仅下路位置及属性，不叠加 2018 中单版本。|
|Rekkles|2018 FNC 下路|92|LoL Esports 官方春季 MVP 集锦；从旧 2020 年份改为 2018，属性不变。|
|Sneaky|2018 C9 下路|91|Riot 回顾 2018 世界赛四强与其比赛经历；属性不变。|
|Jensen|2018 C9 中单|91|同一 Riot 回顾确认该年 C9 中单与四强赛季；属性不变。|
|Xmithie|2019 TL 打野|90|TL 官方春季夺冠报道及 Riot MSI 当季名单；保持团队型属性与 90 分，不因团队奖杯机械加分。|
|Aphromoo|2018 100T 辅助|91（原90）|Riot 明确 2018 春季 MVP 及领导作用。修正旧 2017 CLG 版本，增加意识/团队/沟通等辅助属性，操作与反应不加。|
|Froggen|2014 Alliance 中单|91|ESL 当年季后赛回顾具体记录半决赛表现和决赛小炮/泽拉斯带队取胜。锁定该年，不因生涯影响力叠加 2012 数值。|
|Diamondprox|2013 Gambit 打野|91|ESL 对 Edward 的官方采访确认 2013 IEM 卡托维兹夺冠，另有赛事前瞻确认打野身份及击败 Azubu 双队。不是 Riot 全球总决赛冠军。|
|sOAZ|2017 FNC 上单|90|Riot 回顾当年全球总决赛从小组 0–4 逆袭八强；夏季一阵由 Upcomer 历史名单和 Leaguepedia 当季榜交叉核验（旧官方奖项页未能直达，不冒称已打开）。保留当季数值。|

Froggen 2012、Diamondprox 2012、sOAZ 2015 是可讨论的其他高光版本；本轮在追加同赛季证据后采用上表三个既有年份，不在玩家界面留下“待复核”，也不把不同年份的高光拼成一张卡。

## 数值和玩法边界

- 11 张知名选手依旧 90–92。总分由 1002 变为 1003，均分从 91.091 变为 91.182。其余 29 张冠军/FMVP/IG 彩卡完整对象与旧基线逐字段相等。
- Aphromoo 属性由 `84/85/93/83/89/92/95/90` 改为 `84/85/94/84/89/94/96/91`，依现有辅助权重为 91.38，四舍五入 91。
- Perkz 由中单改为下路，属性 `93/91/88/93/95/92/88/86`，下路加权 91.99，仍为 92。不能占中单免错位惩罚；玩家需把已上阵的该卡移动至下路。本轮没有偷偷调整玩家阵容。
- 属性顺序为操作、反应、意识、发育、关键表现、团队、沟通、指挥。其余九张属性不变。Hall 位置从 1上/2野/4中/3下/1辅变为 1/2/3/4/1；全彩卡为 7/7/12/9/5。
- 单卡战力仍为 `(基础分 + 强化等级) × 100`；Aphromoo 满级由 9500 到 9600。满级 90 分普通金卡仍可与 90 分知名选手卡达到同一单卡战力，这是原先认可的边界。
- 阵容默契和队伍加成没有修改。Aphromoo 改为真实 100T，不能继续凭旧 CLG 身份拿同队加成；Perkz 仍是 G2。实际对战仍通过 `squadPaper`/现有战斗引擎，卡面属性并不各自额外给予一份胜率加成。

## 头像验收

均实抓、逐张看图、Pillow verify/full load；不重绘人脸，只用已有卡面 CSS 裁切。三个新文件合计约 151 KB，单个均低于 100 KB。

- Aphromoo：`hall-aphromoo-2018-42626335040.jpg`，640×427，66,910 bytes。[Riot 官方 2018 LCS 夏季半决赛具名照片](https://www.flickr.com/photos/lolesports/42626335040/)，2018-09-02，白色 100T 队服、单人正脸近景。SHA256 `8cb359be36c39136547fa4910fc403c30af6cd83395005151d002190ab40ff96`。
- Perkz：`hall-perkz-2019.jpg`，768×432，38,868 bytes。[2019-11-09 具名赛事报道](https://www.ingame.de/news/lol-worlds-finale-2019-paris-besten-teams-welt-g2-esports-fpx-funplus-phoenix-13201290.html)，图注指定 G2 下路 Perkz，署名 Riot Games。使用右侧挥手本人，卡框 `79% 25%` 排除左侧队友。SHA256 `3c30c8de71e7393b50aca0859beea54f23ea1290f420f40794be8a4da178b0f5`。
- Froggen：`hall-froggen-2014-alliance.jpg`，800×533，45,481 bytes。[Red Bull 2014 赛季报道](https://www.redbull.com/us-en/lcs-super-week-heads-into-the-off-season)，当前页面迁移日期显示 2017，媒体路径为 2014-08-07，内容讲述 2014 Alliance 夏季赛；图片标题明确 Alliance 的 Froggen；真实本人灰色 Alliance 队服，替换原 2017 Echo Fox 图，不以放大遮队服代替换图。
- Rekkles 配图仍为 2020 FNC 本人肖像，Diamondprox 配图仍为 2018 Gambit 本人肖像；队伍一致，`art.year` 和照片出处保留实际年份；跨年同队肖像的说明留在本审计，玩家 note 只描述当季表现，不把照片年冒充评分赛季。

## 验证

`npx tsx scripts/check_hall_peak_seasons.ts`、`npx tsx scripts/check_worlds_cards.ts`、`npx tsx scripts/check_card_rarity.ts`、`npx tsc -b --pretty false`。

保留旧 `legend-cards-v3.json` 作为独立历史基线，29 张非 Hall 继续与之完整比较；11 张新 Hall 的批准快照为 `hall-cards-peak-v1.json`。新测试另外使用旧快照验证人物身份、九张属性不变和总评分只增加 1，避免仅重新生成快照就声称通过。
