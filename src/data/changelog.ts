/**
 * What changed, in the words of someone playing it.
 *
 * Not a commit log. Every line here is something a player can see happen in
 * front of them, written from their side of the screen — a fix says what was
 * going wrong, not which function was wrong. Anything that only mattered to
 * the code does not belong in this file at all.
 *
 * Newest first. `kind` colours the line: 新增 is a thing that was not there
 * before, 调整 changes how something already works, 修复 is a bug the group
 * ran into — and most of these were reported there, which is worth showing.
 */
export type ChangeKind = '新增' | '调整' | '修复'

export interface ChangeEntry {
  /** YYYY-MM-DD, as it will be shown */
  date: string
  title: string
  changes: { kind: ChangeKind; text: string }[]
  /**
   * Shown first whatever its date. The list stays in date order here so
   * LATEST — what re-lights the dot on the button — is still the newest
   * entry, not the pinned one.
   */
  pinned?: boolean
}

export const CHANGELOG: ChangeEntry[] = [{
  date: '2026-09-22', title: '开包提速·教练入册', changes: [
    { kind: '调整', text: '快速开包会记住设备偏好，普通卡直接揭晓，彩卡保留独立特效；全揭晓后继续下一包沿用原支付方式。' },
    { kind: '新增', text: '教练图鉴收录114张，可搜索名字、队伍或筛选赛区。' },
    { kind: '新增', text: '每周可自选一个赛区享8折，选定后本周不可更换，下周重新选择，折扣不叠加。' },
    { kind: '调整', text: '支持彩卡的卡包保底统一为最迟第1200张必出，保留已有进度，十连计10张。' },
    { kind: '调整', text: '查看概率时计算在后台进行，页面仍可自由操作。' },
    { kind: '调整', text: '位置小游戏金银铜奖励改为400/250/100金币，金银仍送位置包；每日第一次金或银另送1选拔包，每日共5次有奖励机会，挑战奖励保留。' },
    { kind: '新增', text: '补上11张头像，其中6张选手、5张教练，缺图会继续补齐。' },
  ],
}, {
  date: '2026-09-21', title: '猪之家标识 · 首页入口', changes: [
    { kind: '新增', text: '点击游玩界面左上角噜噜卡标识即可返回首页；账号仍保留，点击“继续游玩”即可回到当前进度。' },
    { kind: '新增', text: '浏览器标签页使用专属蓝金卡牌与猪之家小猪图标。' },
  ],
}, {
  date: '2026-09-21', title: '收藏之旅 · 内测补给', changes: [
    { kind: '调整', text: '全新蓝金建档与登录界面，使用猪之家纹章及典藏卡框；建档后可复制保存账号 ID。' },
    { kind: '新增', text: '新账号获得 100,000 金币，试训包、选拔包、十连包各 10 个，另保留 1 个教练包。' },
    { kind: '新增', text: '建档首次进入游戏展示内测公告：正式上线会清除所有内测数据；当前交易等待限制暂时取消、手机绑定暂不开放，请避免大量创建小号。' },
  ],
}, {
  date: '2026-09-21', title: '内测试玩规则', changes: [
    { kind: '调整', text: '新账号开局获得 100,000 金币，已有账号余额不重置。' },
    { kind: '调整', text: '内测交易市场取消注册天数、抽卡次数门槛及一口价等待，拍卖按原倒计时结算。' },
    { kind: '调整', text: '内测暂不开放手机号绑定与手机号登录，请保存账号 ID。' },
    { kind: '调整', text: '名人堂和收藏支持分页，减少同时加载的卡面；收藏可翻页查看全部卡牌。' },
  ],
}, {
  date: '2026-09-21', title: '峡谷典藏 · 四十张彩卡', changes: [
    { kind: '新增', text: '峡谷信箱支持给作者提建议、点赞和查看处理进度，奖励与交易通知单独查看。' },
    { kind: '新增', text: '新增 Doublelift、Bjergsen、Perkz 等十一位知名选手，彩卡池共四十张；LCS 包可抽取北美彩卡。' },
    { kind: '新增', text: '队伍羁绊支持历史沿革，SKT / T1、SSG / Gen.G、DWG / DK 等可继承同队默契，卡组页可查看映射。' },
    { kind: '调整', text: '全新海克斯蓝金界面与猪之家纹章；Caps 卡面聚焦本人。' },
    { kind: '调整', text: '卡包可拖入海克斯祭坛解封，再任选顺序翻面；彩卡触发专属登场光效，多张彩卡依次展示。' },
    { kind: '新增', text: '手机可轻点翻牌或滑过多张卡背连续揭晓，卡桌随屏幕调整，已翻开的卡可点击放大。支持全部翻开、跳过动画及减少动态效果。' },
    { kind: '新增', text: '噜噜卡专属猪之家封印与卡背，金银铜和彩卡采用不同揭晓光效、音效。' },
  ],
}, {
  date: '2026-09-21', title: '统一天梯 · 四类全服杯', changes: [
    { kind: '调整', text: '天梯统一排名，所有卡色均可参赛，沿用原公开赛的段位与战绩。' },
    { kind: '调整', text: '金卡赛、银卡赛、铜卡赛和名人堂赛移至全服杯，各自报名、对阵、发奖与统计冠军。参赛卡色限制在报名和开赛时检查，教练也受金银铜上限限制。' },
    { kind: '调整', text: '移除组队杯，保留俱乐部杯。' },
  ],
}, {
  date: '2026-09-21', title: '名人堂 · 29 张彩卡与数值分层', changes: [
    { kind: '新增', text: '名人堂共 29 张彩卡：13 张历届 S 赛卡、IG 新增五位冠军成员（含 Duke）、11 张 MSI MVP。Ning 沿用已有 FMVP 卡。' },
    { kind: '新增', text: '名人堂增加分类和选手搜索，可免费预览卡面、八项能力、分层定位与照片来源。' },
    { kind: '调整', text: '普通名人堂只收录未获 S 赛或 MSI 冠军的知名选手，撤下五张冠军选手的普通名人堂版，已有赛事卡保留。' },
    { kind: '调整', text: '普通选手金卡最高 90，彩卡按知名选手、冠军成员、MSI MVP、S 赛 MVP 分布于 90—97；S8 Ning 与 S9 Tian 调整为 96，分项保留个人特点，强化机制不变。' },
    { kind: '调整', text: '试训、选拔、十连及 LPL / LCK / LEC 包加入彩卡，沿用原版概率和保底。开放名人堂天梯与全图鉴彩卡包奖励。' },
  ],
}, {
  date: '2026-09-21', title: '噜噜卡 · 2026 基础卡池', changes: [
    { kind: '新增', text: 'LPL、LCK、LEC、LCS、LCP、CBLOL 六大赛区的真实选手与教练卡。' },
    { kind: '新增', text: '沿用开瓦包的抽卡、金卡保底、签到、收藏、强化、分解与卡组机制。当前只开放金、银、铜卡。' },
    { kind: '调整', text: '本次先开放基础卡包。世界赛专题卡包与征途稍后制作；开放天梯、杯赛、交易市场、每日挑战、位置小游戏与好友。' },
  ],
}]
export const LATEST = CHANGELOG[0]?.date ?? ''
