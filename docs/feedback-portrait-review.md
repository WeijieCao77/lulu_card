# 玩家反馈：头像补充验收（2026-09-22）

本轮由 DeepSeek V4 Pro 提供候选研究方案、暂存脚本及可复现下载工具；审核者负责真实网页核查、身份核对、图片查看、否决错误候选及受限入库。只修改照片和照片映射，不改变阵容、位置、评分或已有彩卡。

## 本轮结果

- 新增 **6 名选手**：Shogun、fNb、UmTi、Malrang、Spica、Niles。
- 新增 **5 名教练**：Pockus、SSONG、Homme、Mafa、WarHorse。
- 11 张本地 WebP 合计 **102,700 字节（约 100.3 KiB）**，最大 320×400，不在游戏中请求外部图床。
- 按上轮相同缺失名单口径，仍有 **63 名选手、43 名已命名教练**待核实，另有 **TBD** 占位不能配真人头像。没有把无法确认的头像当成已完成。
- 全部来源、身份证据、文件校验值和剩余名单见 [机器可读审计](portrait-audit-20260922.json)。

## 审核发现

旧脚本把“来源当前角色与卡牌位置不同”直接视为错人，会漏掉转位置或退役后的选手。核查发现 [Spica](https://liquipedia.net/leagueoflegends/Spica) 和 [Malrang](https://lol.fandom.com/wiki/Malrang) 本人转过辅助；[UmTi](https://lol.fandom.com/wiki/UmTi) 成为解说；[fNb](https://lol.fandom.com/wiki/FNb) 与 [Niles](https://lol.fandom.com/wiki/Niles_(Aiden_Tidwell)) 的来源身份也已发生变化。因此本轮对这些明确姓名、国家/队伍及历史身份对应的案例单独放行，不放宽所有同名人物的匹配规则。

[Pockus 的人物页](https://lol.fandom.com/wiki/Pockus)明确列出其兼任选手与主教练，允许教练卡使用本人比赛照。SSONG 使用 [Inven 本人离队报道](https://www.invenglobal.com/articles/1194/coach-ssong-leaves-longzhu-gaming)中的照片。Homme 从 [Worlds 2023 采访](https://www.oneesports.gg/league-of-legends/jdg-coach-homme-worlds-2023/)的群像改选以本人为主体的近照；Mafa 从 [iG 教练采访](https://www.invenglobal.com/articles/6731/igs-2-coaches-becoming-legends-in-6-months-head-coach-kim-and-coach-mafa-on-rebuilding-the-team)中选择 Mafa 本人的单人近照，排除同文中的 Kim。WarHorse 使用 [CNA 2026-09-14 采访](https://focustaiwan.tw/sports/202609140016)明确署名的本人照片。

拒绝的候选包括：将教练 Doran 直接当作 T1 选手 Doran；Artemis、Spawn、Striker、Endless 等未核对的同名选手；WarHorse 原候选双人远景；Daeny 戴口罩远景。没有采用模型猜出的图片地址。Leaguepedia / Liquipedia 的直接请求及部分其他站点返回 403 时均停止该请求，没有绕过访问限制。

## 验收记录

1. 逐张查看两份候选图集及 WarHorse 补充图，结合原网页标题、图注、真实姓名/队伍证据复核。
2. 11 个入库文件都通过 PIL 图像解码、尺寸和 SHA-256 校验，版本号与内容一致。
3. 自动比较 HEAD：所有既有选手/教练映射均保持一致，所有彩卡照片记录保持一致，GALA、Caps、Perkz 没有回退。
4. `scripts/stage_reviewed_portraits_v2.py` 仅重新暂存本轮已审查源，不能自动覆盖游戏资产；后续新增候选仍须单独审查。
5. 本轮不声称完成全部头像；剩余优先继续寻找明确单人照片和可核实真实姓名，避免为了凑数量用错人。
