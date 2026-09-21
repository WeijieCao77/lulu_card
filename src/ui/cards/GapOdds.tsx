export function GapOdds({ open = false }: { open?: boolean }) {
  return (
    <details className="tiny muted" open={open} style={{ lineHeight: 1.75 }}>
      <summary>阵容分和比赛胜负</summary>
      <p style={{ margin: '6px 0' }}>
        天梯、好友房、杯赛以双方阵容分决定基础实力，结合单局发挥、交战、经济与资源推进模拟。高分一方更有优势，低分一方也能通过运营赢下比赛。
      </p>
      <p style={{ margin: '6px 0' }}>
        <b>选手升级</b>：每级这张卡评分 +1，阵容分 +0.2；五人都 +5 共 +5 分。<br />
        <b>教练</b>：战术、培养、激励越高，全队加得越多；教练每升一级阵容分 +0.2，+5 共 +1 分。<br />
        <b>默契</b>：每 10 点 +1 分。<b>错位</b>：一人 −1.2 分。<b>没有指挥</b>：−3 分。
      </p>
      <p style={{ margin: '6px 0 0' }}>
        <b>彩卡是纪念卡</b>，评分高，但不保证赢：卡色本身不会额外增加获胜概率。
      </p>
    </details>
  )
}
