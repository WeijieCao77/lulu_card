import { useEffect, useState } from 'react'
import { useCards } from '../ctx'
import { Modal } from '../../common'
import { ECHO_QUIZ_COUNT, echoQuizDone } from '../../../engine/echoQuiz'
import type { EchoQuizView } from '../../../engine/echoQuiz'

const LETTERS = ['A', 'B', 'C', 'D']

/**
 * 峡谷回响问答 (engine/echoQuiz.ts): five questions once, one answer each, a 峡谷回响包 for every right one.
 * The questions come from the server, which keeps the answers until each one has been given.
 */
export default function EchoQuiz({ onClose }: { onClose: () => void }) {
  const { act, toast } = useCards()
  const [qs, setQs] = useState<EchoQuizView[] | null>(null)
  const [won, setWon] = useState(0)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    void act('echo_quiz').then((r) => {
      if (!r.ok) { setFailed(r.why ?? '问答没打开，稍后再试。'); return }
      const out = r.result as { questions: EchoQuizView[]; won: number }
      setQs(out.questions); setWon(out.won)
    })
  }, [act])

  const answer = async (i: number, pick: number) => {
    if (busy || !qs || qs[i].pick != null) return
    setBusy(true)
    try {
      const r = await act('echo_quiz_answer', { i, pick })
      if (!r.ok) { toast(r.why ?? '没提交上，稍后再试。'); return }
      const out = r.result as { questions: EchoQuizView[]; correct: boolean; won: number }
      setQs(out.questions); setWon(out.won)
      toast(out.correct ? '答对了！+1 峡谷回响包' : '答错了，这题没有奖励。')
    } finally {
      setBusy(false)
    }
  }

  const done = !!qs && echoQuizDone({ ids: [], order: [], picks: qs.map((q) => q.pick), won })
  return (
    <Modal title="峡谷回响 · 老将问答" onClose={onClose} onBgClose={() => {}}>
      <p className="tiny faint" style={{ marginTop: 0, lineHeight: 1.7 }}>
        共 {ECHO_QUIZ_COUNT} 道题，每人只能答一次，每题只能选一次。每答对一题送 1 个峡谷回响包（三张卡），放进卡包里。
      </p>
      {failed && <p className="small neg">{failed}</p>}
      {!qs && !failed && <p className="small muted">正在出题……</p>}
      {qs && <div className="echo-quiz">
        {qs.map((q, i) => (
          <div key={i} className="echo-quiz-q">
            <div className="small"><b>{i + 1}.</b> {q.q}</div>
            <div className="echo-quiz-opts">
              {q.options.map((o, k) => {
                const state = q.pick == null ? '' : k === q.right ? ' eq-right' : k === q.pick ? ' eq-wrong' : ' eq-dim'
                return (
                  <button key={k} className={`sm echo-quiz-opt${state}`} disabled={busy || q.pick != null} onClick={() => void answer(i, k)}>
                    {LETTERS[k]}. {o}{state === ' eq-right' ? ' ✓' : state === ' eq-wrong' ? ' ✗' : ''}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <p className="small" style={{ margin: 0 }}>
          {done ? <>问答结束：答对 <b>{won}</b> 题，获得 <b>{won}</b> 个峡谷回响包，去卡包里打开吧。</>
            : <>已答对 {won} 题 · 还剩 {qs.filter((q) => q.pick == null).length} 题</>}
        </p>
      </div>}
      <style>{`
        .echo-quiz{display:flex;flex-direction:column;gap:16px}
        .echo-quiz-q{display:flex;flex-direction:column;gap:8px}
        .echo-quiz-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
        .echo-quiz-opt{width:100%;text-align:left;white-space:normal;line-height:1.4}
        .echo-quiz .echo-quiz-opt.eq-right:disabled,.echo-quiz-opt.eq-right{border-color:#4fbf8b;color:#4fbf8b;opacity:1}
        .echo-quiz .echo-quiz-opt.eq-wrong:disabled,.echo-quiz-opt.eq-wrong{border-color:#e0675e;color:#e0675e;opacity:1}
        .echo-quiz-opt.eq-dim{opacity:.45}
        @media (max-width:520px){.echo-quiz-opts{grid-template-columns:1fr}}
      `}</style>
    </Modal>
  )
}
