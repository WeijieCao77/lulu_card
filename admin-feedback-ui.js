/** /admin 给作者写信: every private letter, newest first; mark, reply, delete (feedback-api.js). */
export const feedbackAdminScript = String.raw`
(function() {
  // uses the host page's $, esc and auth
  const countsEl = $('#fbCounts');
  const refreshBtn = $('#fbRefresh');
  const filterEl = $('#fbFilter');
  const messageEl = $('#fbMessage');
  const itemsEl = $('#fbItems');

  let busy = false;
  let items = [];
  let counts = { pending: 0, replied: 0, total: 0 };

  const stateText = { pending: '未读', read: '已读', taken: '已采纳', fixed: '已修复', hidden: '不处理', merged: '旧合并回执' };

  function setMessage(msg, isError) {
    messageEl.textContent = msg;
    messageEl.style.color = isError ? 'var(--warn)' : 'var(--win)';
  }
  function setBusy(b) {
    busy = b;
    document.querySelectorAll('#feedback button, #feedback select, #feedback textarea').forEach(el => el.disabled = b);
  }
  function updateCounts() {
    countsEl.textContent = '未读：' + counts.pending + ' / 已回复：' + counts.replied + ' / 总计：' + counts.total;
  }

  function render() {
    const f = filterEl.value;
    const list = items.filter(item =>
      f === 'all' ? true : f === 'replied' ? !!item.reply : f === 'handled' ? item.state !== 'pending' : item.state === 'pending');
    if (f === 'pending') list.sort((a, b) => a.t - b.t); // oldest unread first
    itemsEl.innerHTML = '';
    if (!list.length) { itemsEl.innerHTML = '<div class="panel">（没有符合条件的来信）</div>'; return; }
    for (const item of list) {
      const card = document.createElement('div');
      card.className = 'panel row';
      card.style.display = 'block';
      card.style.marginTop = '12px';
      card.style.overflowWrap = 'anywhere';
      card.dataset.id = item.id;
      let html = '<div style="font-size:0.9em;color:var(--muted);">';
      html += '来信人：' + (item.authorName ? '<b>' + esc(item.authorName) + '</b> #' + esc(item.authorTag) + '（' + esc(item.author) + '）' : esc(item.author)) + ' · ' + new Date(item.t).toLocaleString() + ' · 状态：<b>' + (stateText[item.state] || esc(item.state)) + '</b>';
      if (item.reply) html += ' · ' + (item.replySeen ? '玩家已看回复' : '<span style="color:var(--warn);">玩家还没看回复</span>');
      html += '</div>';
      html += '<div style="margin:0.5em 0;white-space:pre-wrap;">' + esc(item.text) + '</div>';
      if (item.state !== 'merged') {
        html += '<textarea data-reply-for="' + esc(item.id) + '" rows="3" maxlength="1000" placeholder="回复内容（只有这位玩家看得到）" style="width:100%;box-sizing:border-box;">' + esc(item.reply ? item.reply.text : '') + '</textarea>';
        html += '<div style="margin-top:0.4em;">';
        html += '<button data-action="reply" data-id="' + esc(item.id) + '">' + (item.reply ? '更新回复' : '回复') + '</button> ';
        if (item.reply) html += '<button data-action="unreply" data-id="' + esc(item.id) + '">撤回回复</button> ';
        for (const [s, label] of [['read', '标为已读'], ['taken', '已采纳'], ['fixed', '已修复'], ['hidden', '不处理'], ['pending', '标为未读']]) {
          if (item.state !== s) html += '<button data-action="state" data-state="' + s + '" data-id="' + esc(item.id) + '">' + label + '</button> ';
        }
      } else html += '<div style="margin-top:0.4em;">';
      html += '<button data-action="delete" data-id="' + esc(item.id) + '">删除</button></div>';
      card.innerHTML = html;
      itemsEl.appendChild(card);
    }
  }

  async function request(method, body) {
    if (busy) return;
    setBusy(true);
    setMessage(method === 'GET' ? '加载中...' : '处理中...');
    try {
      const res = await fetch('/api/admin/feedback', method === 'GET' ? { headers: auth() }
        : { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({ ok: false, why: '响应解析失败' }));
      if (!res.ok || !data.ok) { setMessage('失败：' + (data.why || 'HTTP ' + res.status), true); return; }
      counts = data.counts; items = data.items;
      updateCounts(); render();
      setMessage(method === 'GET' ? '已加载' : '已完成');
    } catch (err) {
      setMessage('网络错误：' + err.message, true);
    } finally { setBusy(false); }
  }

  itemsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const action = btn.getAttribute('data-action');
    if (!id || !action) return;
    if (action === 'delete') {
      if (confirm('确定删除这封来信吗？不可撤销。')) request('POST', { action: 'delete', id });
    } else if (action === 'state') {
      request('POST', { action: 'state', id, state: btn.getAttribute('data-state') });
    } else if (action === 'reply') {
      const text = itemsEl.querySelector('textarea[data-reply-for="' + id + '"]').value.trim();
      if (!text) { setMessage('先写回复内容', true); return; }
      request('POST', { action: 'reply', id, text });
    } else if (action === 'unreply') {
      if (confirm('撤回这条回复？玩家将看不到它。')) request('POST', { action: 'reply', id, text: '' });
    }
  });
  refreshBtn.addEventListener('click', () => request('GET'));
  filterEl.addEventListener('change', render);
  request('GET');
})();
`
