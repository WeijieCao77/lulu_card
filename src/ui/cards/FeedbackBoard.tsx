import { useCallback, useEffect, useRef, useState } from 'react';
import { useCards } from './ctx';
import './feedback.css';
import { RELEASE_STAGE } from '../../../release-policy.js';

/** The formal mailbox is val_player's: the owner reads a letter before it goes on the board. */
const FORMAL = RELEASE_STAGE !== 'demo';

interface FeedbackItem {
  id: string;
  t: number;
  text: string;
  state: 'pending' | 'shown' | 'taken' | 'fixed' | 'hidden' | 'merged';
  pin: boolean;
  votes: number;
  mine: boolean;
  voted: boolean;
  merge?: {
    availability: 'public' | 'private' | 'missing';
    target?: {
      id: string;
      text: string;
      state: string;
      votes: number;
    };
  };
}

interface ListResponse {
  ok: boolean;
  max?: number;
  min?: number;
  full?: boolean;
  items?: FeedbackItem[];
  mine?: FeedbackItem[];
  created?: string;
}

interface ApiError {
  ok: boolean;
  why?: string;
}

type Tab = 'hot' | 'new' | 'mine';

const API_BASE = '/api/feedback';
const TIMEOUT_MS = 8000;
const RATE_LIMIT_MS = 5000;

export default function FeedbackBoard() {
  const ctx = useCards();
  const [tab, setTab] = useState<Tab>('hot');
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [mine, setMine] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [full, setFull] = useState(false);
  const [maxChars, setMaxChars] = useState(FORMAL ? 200 : 2000);
  const [minChars, setMinChars] = useState(FORMAL ? 4 : 1);
  const [voting, setVoting] = useState(false);
  const listSeqRef = useRef(0);
  const lastListTimeRef = useRef(0);
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const textRef = useRef<HTMLTextAreaElement>(null);

  const accountId = ctx.g.id;
  const cloud = !!ctx.cloud;

  const call = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const controller = new AbortController();
    controllersRef.current.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        const data: ApiError = await res.json().catch(() => ({ ok: false }));
        throw new Error(data.why || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as T & { ok: boolean; why?: string };
      if (!data.ok) throw new Error(data.why || '请求失败');
      return data as T;
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        if (timedOut) {
          throw new Error('请求超时，请稍后重试');
        }
        throw e;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
      controllersRef.current.delete(controller);
    }
  }, []);

  const fetchList = useCallback(async (force = false) => {
    if (!cloud) {
      setLoading(false);
      setError('当前离线，建议箱不可用');
      return;
    }
    const now = Date.now();
    if (!force && now - lastListTimeRef.current < RATE_LIMIT_MS) return;
    const seq = ++listSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const data = await call<ListResponse>('/list', { accountId });
      if (seq !== listSeqRef.current) return;
      setItems(data.items || []);
      setMine(data.mine || []);
      setFull(!!data.full);
      if (data.max) setMaxChars(data.max);
      if (data.min) setMinChars(data.min);
      lastListTimeRef.current = Date.now();
    } catch (e: unknown) {
      if (seq !== listSeqRef.current) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : '加载失败，请稍后重试');
    } finally {
      if (seq === listSeqRef.current) {
        setLoading(false);
      }
    }
  }, [call, accountId, cloud]);

  useEffect(() => {
    fetchList(true);
    return () => {
      ++listSeqRef.current;
      controllersRef.current.forEach(controller => controller.abort());
      controllersRef.current.clear();
    };
  }, [fetchList]);

  const submitSuggestion = async () => {
    if (sending || !cloud) return;
    const trimmed = text.trim();
    const codePoints = [...trimmed].length;
    if (codePoints < minChars || codePoints > maxChars) {
      setError(!FORMAL ? `请写下建议，最多 ${maxChars} 字。`
        : codePoints < minChars ? `太短了，至少 ${minChars} 个字，把想说的说清楚。`
          : `一条最多 ${maxChars} 个字，长了就分两条。`);
      return;
    }
    setSending(true);
    setError('');
    try {
      const data = await call<ListResponse & ApiError>('/new', { accountId, text: trimmed });
      setText('');
      setNotice(FORMAL ? '收到了。作者看过之后才会展示到榜上——在「我的」里能看到它到哪一步了。' : '已提交，已出现在建议榜。');
      setTab('mine');
      ++listSeqRef.current;
      setItems(data.items || []);
      setMine(data.mine || []);
      setFull(!!data.full);
      setLoading(false);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // unmount/abort, ignore
      } else {
        setError(e instanceof Error ? e.message : '投稿失败，请稍后重试');
      }
    } finally {
      setSending(false);
    }
  };

  const vote = async (id: string, on: boolean) => {
    if (voting || !cloud) return;
    setVoting(true);
    setError('');
    try {
      const data = await call<ListResponse>('/vote', { accountId, id, on });
      ++listSeqRef.current;
      setItems(data.items || []);
      setMine(data.mine || []);
      setLoading(false);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // unmount, ignore
      } else {
        setError(e instanceof Error ? e.message : '投票失败，请稍后重试');
      }
    } finally {
      setVoting(false);
    }
  };

  const displayedItems = tab === 'mine' ? mine : items;
  const sortedItems = tab === 'new' ? [...displayedItems].sort((a, b) => b.t - a.t) : displayedItems;

  return (
    <div className="feedback-board">
      <div className="feedback-header">
        <h2>玩家建议信箱</h2>
        <p className="note">{FORMAL
          ? '想让游戏变成什么样？一条说一件事。作者先看过才会展示到榜上，在这之前只有你自己看得见。'
          : '内测版建议提交后立即上榜。给好点子点赞，一起完善噜噜卡。'}</p>
        <div className="tabs">
          <button className={tab === 'hot' ? 'active' : ''} onClick={() => setTab('hot')}>最热</button>
          <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>最新</button>
          <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>我的</button>
        </div>
      </div>

      <div className="feedback-compose">
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={maxChars * 2} aria-label="建议内容"
          placeholder={FORMAL ? '比如：市场能不能按位置筛选卡牌？' : '写下你的建议或遇到的问题（最多2000字）'}
          rows={3}
          disabled={!cloud}
        />
        <div className="compose-footer">
          <span className="char-count">{FORMAL
            ? (maxChars - [...text].length >= 0 ? `还能写 ${maxChars - [...text].length} 个字` : `超了 ${[...text].length - maxChars} 个字`)
            : `${[...text].length}/${maxChars}`}</span>
          <button onClick={submitSuggestion} disabled={sending || full || !cloud}>
            {sending ? (FORMAL ? '正在发…' : '提交中...') : (FORMAL ? '发给作者' : '提交')}
          </button>
        </div>
        {full && <p className="error">信箱已满，暂时无法投稿。</p>}
      </div>

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}

      <div className="feedback-list">
        {loading && <div className="loading">加载中...</div>}
        {!loading && sortedItems.length === 0 && <div className="empty">{!FORMAL ? '暂无建议'
          : tab === 'mine' ? '你还没写过。上面写一条，作者看过就会展示到榜上。' : '榜上还是空的，第一条就写给你了。'}</div>}
        {!loading && sortedItems.map((item) => (
          <FeedbackCard key={item.id} item={item} onVote={vote} disabled={voting || !cloud} />
        ))}
      </div>

      {FORMAL && <p className="note">一个账号一条一票，可以收回。作者照着赞多的往下改；改好了这条会写「已修复」。</p>}
      <div className="feedback-actions">
        <button onClick={() => fetchList(true)} disabled={loading || sending || voting || !cloud}>刷新</button>
      </div>
    </div>
  );
}

function FeedbackCard({ item, onVote, disabled }: { item: FeedbackItem; onVote: (id: string, on: boolean) => void; disabled?: boolean }) {
  const statusLabel = (state: FeedbackItem['state']) => {
    switch (state) {
      case 'pending': return '待审核';
      case 'shown': return '已展示';
      case 'taken': return '已采纳';
      case 'fixed': return '已修复';
      case 'hidden': return FORMAL ? '未展示' : '已隐藏';
      case 'merged': return '已合并';
      default: return state;
    }
  };

  return (
    <div className={`feedback-item ${item.pin ? 'pinned' : ''} ${item.voted ? 'voted' : ''}`}>
      {item.pin && <div className="pin-badge">置顶</div>}
      <div className="item-header">
        <span className="time">{new Date(item.t).toLocaleDateString()}</span>
        <span className={`status status-${item.state}`}>{statusLabel(item.state)}</span>
      </div>
      <div className="item-text">{item.text}</div>
      {item.state === 'merged' && item.merge && (
        <div className={`merge-box merge-${item.merge.availability}`}>
          {item.merge.availability === 'public' && item.merge.target ? (
            <>
              <div className="merge-target-text">{item.merge.target.text}</div>
              <div className="merge-target-state">状态：{statusLabel(item.merge.target.state as FeedbackItem['state'])}，票数：{item.merge.target.votes}</div>
            </>
          ) : item.merge.availability === 'private' ? (
            <div>已合并至其他建议（内容未公开）</div>
          ) : (
            <div>已合并至其他建议（目标不存在）</div>
          )}
        </div>
      )}
      <div className="item-footer">
        <button
          className={`vote-button ${item.voted ? 'voted' : ''}`}
          onClick={() => onVote(item.id, !item.voted)}
          disabled={disabled || (item.state !== 'shown' && item.state !== 'taken' && item.state !== 'fixed')}
        >
          {item.voted ? '👍 已赞' : '👍 点赞'} ({item.votes})
        </button>
        {item.mine && <span className="mine-badge">我的</span>}
      </div>
    </div>
  );
}
