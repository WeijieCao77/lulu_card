import { useCallback, useEffect, useRef, useState } from 'react';
import { useCards } from './ctx';
import './feedback.css';
import { RELEASE_STAGE } from '../../../release-policy.js';

/**
 * 给作者写信 — private letters to the author (owner, 2026-09-28: no public board, no votes, no ranking;
 * nobody but the writer and the author ever sees a letter). The author reads them in /admin and may reply;
 * the reply shows under the writer's own letter, and a notice lands in 奖励与交易通知.
 */
const FORMAL = RELEASE_STAGE !== 'demo';

interface Letter {
  id: string;
  t: number;
  text: string;
  state: 'pending' | 'read' | 'taken' | 'fixed' | 'hidden' | 'merged';
  reply?: { text: string; t: number };
  replyNew?: boolean;
}

interface ListResponse {
  ok: boolean;
  max?: number;
  min?: number;
  full?: boolean;
  mine?: Letter[];
  created?: string;
  why?: string;
}

const API_BASE = '/api/feedback';
const TIMEOUT_MS = 8000;

const STATE_CN: Record<Letter['state'], string> = {
  pending: '作者还没看', read: '作者已读', taken: '已采纳', fixed: '已修复', hidden: '作者已读', merged: '作者已读',
};

export default function FeedbackBoard() {
  const ctx = useCards();
  const [mine, setMine] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [full, setFull] = useState(false);
  const [maxChars, setMaxChars] = useState(FORMAL ? 500 : 2000);
  const [minChars, setMinChars] = useState(FORMAL ? 4 : 1);
  const controllers = useRef<Set<AbortController>>(new Set());
  const seq = useRef(0);

  const accountId = ctx.g.id;
  const cloud = !!ctx.cloud;

  const call = useCallback(async (path: string, body: unknown): Promise<ListResponse> => {
    const controller = new AbortController();
    controllers.current.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({ ok: false }))) as ListResponse;
      if (!res.ok || !data.ok) throw new Error(data.why || `HTTP ${res.status}`);
      return data;
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError' && timedOut) throw new Error('请求超时，请稍后重试');
      throw e;
    } finally {
      clearTimeout(timeout);
      controllers.current.delete(controller);
    }
  }, []);

  const take = (data: ListResponse) => {
    setMine(data.mine || []);
    setFull(!!data.full);
    if (data.max) setMaxChars(data.max);
    if (data.min) setMinChars(data.min);
  };

  const load = useCallback(async () => {
    if (!cloud) { setLoading(false); setError('当前离线，信箱不可用'); return; }
    const n = ++seq.current;
    setLoading(true);
    setError('');
    try {
      const data = await call('/list', { accountId });
      if (n === seq.current) take(data);
    } catch (e: unknown) {
      if (n !== seq.current || (e instanceof DOMException && e.name === 'AbortError')) return;
      setError(e instanceof Error ? e.message : '加载失败，请稍后重试');
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [call, accountId, cloud]);

  useEffect(() => {
    void load();
    return () => { ++seq.current; controllers.current.forEach((c) => c.abort()); controllers.current.clear(); };
  }, [load]);

  const send = async () => {
    if (sending || !cloud) return;
    const trimmed = text.trim();
    const n = [...trimmed].length;
    if (n < minChars || n > maxChars) {
      setError(n < minChars ? `太短了，至少 ${minChars} 个字，把想说的说清楚。` : `一封最多 ${maxChars} 个字，长了就分两封。`);
      return;
    }
    setSending(true);
    setError('');
    try {
      const data = await call('/new', { accountId, text: trimmed });
      setText('');
      setNotice('收到了。这封信只有你和作者看得到；作者回复后，信箱里会有提醒。');
      ++seq.current;
      take(data);
      setLoading(false);
    } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : '发送失败，请稍后重试');
    } finally {
      setSending(false);
    }
  };

  const left = maxChars - [...text].length;
  return (
    <div className="feedback-board">
      <div className="feedback-header">
        <h2>给作者写信</h2>
        <p className="note">bug、建议、想法都可以写。<b>信只有你和作者看得到</b>，不公开、不上榜；作者看过会标出来，也可能直接回复你。</p>
      </div>

      <div className="feedback-compose">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={maxChars * 2} aria-label="来信内容"
          placeholder="比如：市场能不能按位置筛选卡牌？"
          rows={4}
          disabled={!cloud}
        />
        <div className="compose-footer">
          <span className="char-count">{left >= 0 ? `还能写 ${left} 个字` : `超了 ${-left} 个字`}</span>
          <button onClick={() => void send()} disabled={sending || full || !cloud}>{sending ? '正在发…' : '发给作者'}</button>
        </div>
        {full && <p className="error">信箱满了，暂时写不了，过两天再来。</p>}
      </div>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      <h3 style={{ margin: '18px 0 8px' }}>我的来信</h3>
      <div className="feedback-list">
        {loading && <div className="loading">加载中...</div>}
        {!loading && mine.length === 0 && <div className="empty">你还没写过信。</div>}
        {!loading && mine.map((m) => (
          <div key={m.id} className={`feedback-item${m.replyNew ? ' pinned' : ''}`}>
            <div className="item-header">
              <span className="time">{new Date(m.t).toLocaleDateString()}</span>
              <span className={`status status-${m.state}`}>{STATE_CN[m.state] ?? m.state}</span>
            </div>
            <div className="item-text">{m.text}</div>
            {m.reply && (
              <div className="merge-box merge-public">
                <div className="merge-target-state">{m.replyNew ? '🆕 ' : ''}作者回复 · {new Date(m.reply.t).toLocaleDateString()}</div>
                <div className="merge-target-text" style={{ whiteSpace: 'pre-wrap' }}>{m.reply.text}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="feedback-actions">
        <button onClick={() => void load()} disabled={loading || sending || !cloud}>刷新</button>
      </div>
    </div>
  );
}
