# 赛区拆分 v8（2026-09-27）

其他 拆成 LEC、LCS、其他（LCP + CBLOL）。每个赛区按本赛区选手的原始评分单独分档（`src/engine/cardRarity.ts` REGION_PARAMS，CARD_BALANCE_VERSION 8）。

| 赛区 | 人数 | 金 | 银 | 铜 | 金卡占比 | 原始分门槛（金 / 银） |
|---|---|---|---|---|---|---|
| LCK | 122 | 22 | 41 | 59 | 18.0% | 80 / 70（不变） |
| LPL | 103 | 14 | 29 | 60 | 13.6% | 79 / 76（不变） |
| LEC | 127 | 16 | 32 | 79 | 12.6% | 72 / 67 |
| LCS | 108 | 11 | 30 | 67 | 10.2% | 72 / 63 |
| 其他 | 217 | 16 | 59 | 142 | 7.4% | 71 / 66（与原其他相同） |

合计 79 金 / 191 银 / 407 铜（原 85 / 191 / 401）。

评分区间所有赛区相同：金 84–90、银 72–83、铜 50–71。LEC、LCS、其他的上限由 88 提到 90（REGION_PARAMS top），金卡均分 LPL 85.3、LCK 85.6、LEC 85.7、LCS 85.7、其他 85.6——同为金卡，外赛区不吃亏。

卡包：LEC 包（emea）、LCS 包（ame）重新上架，2600 金币，基础出金 5%、出银 8%，至少一张银卡（与其他包相同；按 LPL/LCK 的 8%/38%，单张 LCS 金卡会比单张铜卡更容易出）。彩卡只出本赛区：LPL 13、LCK 15、LEC 6、LCS 6；其他包没有彩卡，不出彩卡、不推进彩卡保底。

每周折扣：全服统一，每周一个赛区包八折，周一 0 点（北京时间）轮换，LPL → LCK → LEC → LCS → 其他，2026-09-28 那周起是 LPL（之前也算 LPL）。

## 逐卡颜色变化（22 张：升 5，降 17）

| 选手 | 战队 | 联赛 | 位置 | 旧 | 新 |
|---|---|---|---|---|---|
| Quad | FLY | LCS | 中单 | 金 84 | 银 83 |
| huhi | SEN | LCS | 辅助 | 金 84 | 银 83 |
| DARKWINGS | SEN | LCS | 中单 | 铜 71 | 银 75 |
| Zinie | SR | LCS | 中单 | 铜 71 | 银 75 |
| Tactical | C9 | LCS | 下路 | 铜 71 | 银 75 |
| Lyonz | DSG | LCS | 辅助 | 铜 70 | 银 73 |
| Zamudo | None | LCS | 上单 | 铜 68 | 银 72 |
| Razork | FNC | LEC | 打野 | 金 84 | 银 83 |
| Jackies | GX | LEC | 中单 | 金 84 | 银 83 |
| Jojopyun | MKOI | LEC | 中单 | 金 84 | 银 83 |
| Larssen | None | LEC | 中单 | 金 84 | 银 83 |
| Jopa | SK | LEC | 下路 | 银 72 | 铜 71 |
| Paduck | SHFT | LEC | 下路 | 银 72 | 铜 71 |
| Stend | SHFT | LEC | 辅助 | 银 72 | 铜 71 |
| Vetheo | None | LEC | 中单 | 银 72 | 铜 71 |
| Closer | None | LEC | 打野 | 银 72 | 铜 71 |
| Hype | TH | LEC | 下路 | 银 72 | 铜 71 |
| Way | TH | LEC | 辅助 | 银 72 | 铜 71 |
| Keduii | JL | LEC | 下路 | 银 72 | 铜 71 |
| Mersa | JL | LEC | 辅助 | 银 72 | 铜 71 |
| Exofeng | SC | LEC | 下路 | 银 72 | 铜 71 |
| Yakkey | VITB | LEC | 下路 | 银 72 | 铜 71 |