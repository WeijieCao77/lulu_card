/**
 * How a card's 评分 is worked out, in players' words (owner, 2026-09-27: many players question the numbers).
 * The model itself is scripts/lol_rating/build_lol_ratings.py; keep the two in step.
 * `open` shows it expanded (图鉴); otherwise it is one line that opens (card detail).
 */
export default function RatingExplainer({ open = false }: { open?: boolean }) {
  return (
    <details className="rating-explainer" open={open}>
      <summary>评分怎么算？</summary>
      <ul>
        <li><b>近一年最重要</b>：用 2016–2026 年的职业比赛逐场数据，<b>2026 年占 50%</b>，其余 50% 分给往年，越早占比越小（每早两年减半）。只算选手真正打过比赛的年份，缺的年份不拖分。</li>
        <li><b>大赛更有分量</b>：同样一场比赛，<b>世界赛 &gt; MSI &gt; 季后赛 &gt; 常规赛</b>（分别按 2.5 / 2 / 1.5 / 1 倍计）。</li>
        <li><b>赛区强度</b>：按近三年国际赛的交手结果校准，强赛区的数据含金量更高。</li>
        <li><b>荣誉少量加分</b>：世界赛冠军、亚军和 MSI 冠军有加分，越早的越少，最多 +3。</li>
        <li><b>统一公式</b>：所有选手都用同一套由 AI 设计的公式统一计算，没有针对任何人手动调分。</li>
        <li><b>金银铜</b>：在各赛区内部按评分排名划分；同为金卡，各赛区都在 84–90 之间。比赛太少的选手会标「数据不足，估算」。</li>
        <li><b>教练</b>：总评 = 战术 × 0.45 + 培养 × 0.3 + 激励 × 0.25，三项按本赛季带队表现估算。执教拿过世界赛、MSI 或顶级联赛冠军的教练有<b>履历底分</b>（世界冠军最重，助教身份减半），取两者较高。和选手卡一样，普通卡最高 90，金卡 84 起、银卡 72 起。</li>
      </ul>
      <p>评分是游戏内的数值，不代表官方评价。</p>
    </details>
  )
}
