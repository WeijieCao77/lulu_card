# 噜噜卡 UI、开包与音乐初审（2026-09-28）

## 当前状态

- 本地 `main` 与 `origin/main` 同为 `2b48475`，检查前工作区干净。线上 `/readyz` 为 200，数据库就绪，线上 `/release-build.json` 标记 `production`。但线上策略指纹 `e0c843…` 与当前本地源码和 `dist` 的 `52474e…` 不同，线上 buildId 也不同。线上页面可用，但部署制品并非当前本地构建；需去 Railway 核对部署 commit 和构建时间，不能仅凭 Git 同步认定两边完全相同。
- 线上建档页已是新的峡谷典藏视觉，正式规则开局 10,000 金币、试训包 3、选拔包 1、十连包 0，手机号入口开放。
- 开包已实现卡包拖入祭坛、十张卡背逐张翻开、快速模式、彩卡单独登场、音效与减少动态效果支持。本地 `/pack-preview.html` 可用固定卡检视，不消耗玩家资源。
- 音乐播放器在 `src/ui/MusicPlayer.tsx` 基本完成，支持播放/暂停、上一首/下一首、循环、音量、静音、拖拽吸边、偏好保存、媒体键、移动端缓存与断点播放回退。目前 `src/data/music.ts` 把 `MUSIC_ENABLED` 限定为开发环境，六首 VALORANT 文件只是占位；**线上未启用**。

## UI 优先级建议

1. **先修层级和遮挡。** `.bgm` 的 z-index 为 65，而开包全屏层 `.ritual-stage` 为 60。音乐上线后播放器会浮在开包和彩卡演出之上；在预览中先确定层级规则，再调整。
2. **扩大彩卡主视觉。** 桌面预览中彩卡完整出场时卡面大约只有画面中央一小块，周围光圈远大于人物。可以把卡放大一档，降低持续光束亮度，让选手脸、卡名和荣誉首先被看见；手机端按视口高度限制，避免底部按钮被挤走。
3. **让十连翻牌有节奏。** 现有 5×2 排列规整，但卡背光泽已经直接显示稀有度。可以保留稀有度提示，同时让玩家在金/彩卡翻开时感到差异：短暂聚焦、卡面停顿、相应音效；连续翻牌手势不应被频繁打断。快速模式仍需一步完成。
4. **加强噜噜卡自己的峡谷语言。** 继续用猪之家印章与收藏室设定，加入峡谷地图线条、蓝色能量/河道、战队赛场灯光等抽象元素；避免直接复制炉石、开瓦包或使用 Riot 官方商标当主视觉。
5. **手机端作为验收门槛。** 至少检查 375×667、390×844、小屏横屏、弱网、减少动态效果与浏览器后台恢复；看卡牌能否读清、按钮是否可点、无白屏/卡顿、音频不会盖住抽卡音效。

## 历届 Worlds 官方主题曲目录

这里指年度**歌曲 anthem**，不是同年另出的 orchestral theme。Riot 自己的 2014–2022 歌曲年表确认年度主题曲传统从 2014 年开始；S1–S3 不应硬补一首「官方年度 anthem」。截至本次核查，未找到 2026 年已公布的年度主题曲，不编造。

| 年份 | 主题曲 |
| --- | --- |
| 2014 | Warriors — Imagine Dragons |
| 2015 | Worlds Collide — Nicki Taylor |
| 2016 | Ignite — Zedd |
| 2017 | Legends Never Die — Against The Current |
| 2018 | RISE — The Glitch Mob、Mako、The Word Alive |
| 2019 | Phoenix — Cailin Russo、Chrissy Costanza |
| 2020 | Take Over — Jeremy McKinnon、MAX、Henry |
| 2021 | Burn It All Down — PVRIS |
| 2022 | STAR WALKIN’ — Lil Nas X |
| 2023 | GODS — NewJeans |
| 2024 | Heavy Is The Crown — Linkin Park |
| 2025 | Sacrifice — G.E.M. |

官方核查入口：[Riot 的 2014–2022 歌曲年表](https://lolesports.com/en-US/news/cronolog-a-canciones-worlds-2014-2022)、[2023 GODS](https://www.leagueoflegends.com/en-au/news/media/gods-ft-newjeans/)、[2024 Heavy Is The Crown](https://lolesports.com/en-US/news/2024-worlds-anthem-artist)、[2025 Sacrifice](https://www.leagueoflegends.com/en-au/news/tags/music/)。用户可从这些官方入口试听。

## 音频使用与下一步

用户已明确表示将使用自己拥有版权的二创音乐版本。当前工作区没有这些二创音频，只有六首 VALORANT 占位文件，因此还不能按年份替换歌单或试听。没有从官方视频/流媒体抓取原版音频，也没有把原版放入 `public/music`。在收到二创文件或其下载来源后，按实际文件逐一核对年份、曲名、可播放格式和长度。

拿到二创音源后，先在本地替换 `src/data/music.ts` 的占位歌单和 `public/music` 文件，保留用户主动播放入口；检查文件大小、手机 Safari/安卓浏览器、缓存失效、媒体键、连续开包时的音量压低。完成真机验收后再决定是否把 `MUSIC_ENABLED` 打开；本次不改线上播放器开关。
