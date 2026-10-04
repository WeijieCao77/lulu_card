# S16 世界赛卡 · 每日更新说明

世界赛期间（2026-10-15 → 11-14）每个比赛日打完后做一次。整个过程 5 分钟左右。

## 0. 只做一次：导出普通卡先验

```
npx tsx scripts/s16_base_export.ts
```

生成 `scripts/s16_base.json`（85 名选手的普通卡评分和八项属性）。**名单（`src/data/s16.json`）或普通卡数值改过之后要重跑一次**，平时不用。

## 1. 下载最新的 OE 数据

Oracle's Elixir 的比赛数据在它的 Google Drive 公开文件夹里：

- 入口：<https://oracleselixir.com/tools/downloads>
- 文件夹：<https://drive.google.com/drive/folders/1gLSw0RLjBbtaNy0dgnGQDAZOHIgCe-HH>

下载 `2026_LoL_esports_match_data_from_OraclesElixir.csv`，改名为 `2026_OE.csv`，覆盖到：

```
C:\Users\15967\OneDrive\桌面\lol选手\data\oracleselixir\2026_OE.csv
```

OE 通常比赛后几小时到 1–2 天更新。脚本第一行会打印「文件里最新的一局」，看一眼是不是已经到了昨天。

## 2. 先试跑（不写文件）

在 `game-echo` 目录下：

```
python scripts/s16_ratings.py --oe "../../lol选手/data/oracleselixir/2026_OE.csv" --stage-dates "playin:A..B,swiss:A..B,ko:A..B,final:2026-11-14" --dry-run
```

- `--stage-dates`：把 A、B 换成官方赛程的日期（北京时间）。入围赛、瑞士轮 ×1，`ko`（八强/四强）×1.5，`final` ×2。赛程没定之前可以先不写，所有局按 ×1。
- 开幕日默认读 `src/data/s16.json` 的 `meta.start`（2026-10-15），不用写 `--since`。
- 比赛日按北京时间划分（`--tz 8`，默认）。

看输出里这几处：

| 输出 | 要做什么 |
|---|---|
| 「X 局，Y 个比赛日，Z 名选手已亮相」 | 局数对得上昨天的实际场次 |
| 「对不上名单的世界赛选手」 | 是替补上场了（名单要补人），还是名字拼法不同（在脚本顶部 `ALIASES` 里加一行 `"oe里的名字小写去空格": "名单里的ign"`） |
| 「名字对上了、队伍对不上」 | 同名的另一个人或者换队了，人工确认 |
| 表格 | 每人：局数、普通卡、世界赛表现分、新评分、比上次涨跌、金银铜 |

还没开赛或 OE 还没更新时，会显示「还没有世界赛数据——不改任何东西」，这是正常的。

## 3. 正式写入

去掉 `--dry-run` 再跑一次，结果写进 `src/data/s16Ratings.json`。同一天重跑多少次都没关系，卡面上的 ↑↓ 不会被抹掉。

**决赛后最后一次**加上冠军和 FMVP：

```
python scripts/s16_ratings.py --oe "../../lol选手/data/oracleselixir/2026_OE.csv" --stage-dates "..." --champion T18 --fmvp Chovy
```

`--champion` 填俱乐部 id（`src/data/s16.json` 里 `teams[].club`，如 GEN = T18、T1 = T24、BLG = T2），冠军队每人 +2（封顶 90）；`--fmvp` 填 ign（大小写要和名单一致），他的卡会变成彩卡。

## 4. 发布（交给主 agent / 站长）

只改了 `src/data/s16Ratings.json` 一个文件。发布前：

1. 在 `src/data/changelog.ts` 加一行（例如「S16 世界赛卡更新到 10-18：XX 局」），和数据放在同一个提交里。
2. 跑 `.github/workflows/railway.yml` 里的全套 check（`npm run build` 加后面那串 `npx tsx scripts/check_*.ts`）。
3. 提交、推送、部署。

## 算法一览

1. 每局每人取：KDA（取对数，压掉 15/0/10 的极端局）、参团率、分均伤害、伤害占比、15 分钟经济差/补刀差/经验差、分均视野、胜负。
2. 每项和本届世界赛**同位置**的全部对局比，算 z 分（截在 ±3），按位置加权（视野对打野/辅助权重高，伤害对上中下权重高），再标准化成「单局表现分」。
3. 选手的世界赛 z = 单局表现分的加权平均（入围/瑞士 ×1，八强/四强 ×1.5，决赛 ×2）。
4. 世界赛评分 = 80 + 12z（夹在 55–90）；和普通卡混合：w = 局数/(局数+2)，1 局占 1/3，5 局占 0.71。
5. 冠军 +2，封顶 90。金属按已亮相选手排名：前 25% 金、再 35% 银、其余铜（同分取更好的档）。
6. 八项属性 = 普通卡属性 + (新评分 − 普通卡评分)，夹在 1–99。

原案是 80 换成 78、12 换成 6；用 2025 世界赛回测后发现太平（全场挤在 71–84），改成现在的数。回测报告：`../S16世界赛系列/backtest_2025.md`。可调的数都在 `s16_ratings.py` 顶部 `tunables` 一节。
