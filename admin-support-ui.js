/** The owner's desk for the 赛事应援墙 (support-api.js). Uses the dashboard's own $, esc and auth. */
export const supportAdminHtml = `<div class="panel" id="support"><h2>赛事应援墙</h2>
<div class="row"><span id="swCounts">加载中…</span><button id="swRefresh">刷新</button></div>
<p class="why">玩家留言一律先进「待审核」，点「通过」才公开；已公开的可以「撤下」。每次操作都会记录。</p>
<div class="row"><label>赛事名称 <input id="swTitle" maxlength="40" style="width:220px"></label>
<label><input type="checkbox" id="swEnabled"> 接受新留言</label><button id="swSave">保存设置</button></div>
<div class="row"><select id="swStatus" aria-label="留言状态" style="width:160px"><option value="pending" selected>待审核</option><option value="approved">已公开</option><option value="rejected">未通过 / 已撤下</option></select></div>
<p id="swMessage" role="status"></p><div id="swItems"></div></div>`

export const supportAdminScript = String.raw`
(function() {
  const countsEl = $('#swCounts'), itemsEl = $('#swItems'), msgEl = $('#swMessage'), statusEl = $('#swStatus')
  const titleEl = $('#swTitle'), enabledEl = $('#swEnabled')
  if (!itemsEl) return
  const CN = { pending: '待审核', approved: '已公开', rejected: '未通过' }
  async function load() {
    msgEl.textContent = ''
    try {
      const r = await fetch('/api/admin/support?status=' + statusEl.value, { headers: auth() })
      const j = await r.json()
      if (!j.ok) throw new Error(j.why || ('HTTP ' + r.status))
      const c = Object.fromEntries((j.counts || []).map(x => [x.status, x.count]))
      countsEl.textContent = '待审核 ' + (c.pending || 0) + ' · 已公开 ' + (c.approved || 0) + ' · 未通过 ' + (c.rejected || 0)
      titleEl.value = j.config.title; enabledEl.checked = !!j.config.enabled
      itemsEl.innerHTML = j.rows.length ? j.rows.map(row => {
        const acts = row.status === 'pending'
          ? '<button data-sw="approved" data-id="' + esc(row.id) + '" data-from="pending">通过</button> <button data-sw="rejected" data-id="' + esc(row.id) + '" data-from="pending">不通过</button>'
          : row.status === 'approved'
            ? '<button data-sw="rejected" data-id="' + esc(row.id) + '" data-from="approved">撤下</button>'
            : '<button data-sw="approved" data-id="' + esc(row.id) + '" data-from="rejected">改为通过</button>'
        return '<div class="fb-item" style="border-top:1px solid var(--line);padding:8px 0">'
          + '<b>致 ' + esc(row.target) + '</b> · ' + esc(row.author) + ' · ' + new Date(row.created).toLocaleString('zh-CN') + ' · ' + CN[row.status]
          + '<div style="margin:6px 0;white-space:pre-wrap">' + esc(row.body) + '</div>'
          + (row.reason ? '<div class="dim">说明：' + esc(row.reason) + '</div>' : '')
          + '<input placeholder="审核说明（可选，玩家能看到）" data-reason="' + esc(row.id) + '" style="width:260px"> ' + acts + '</div>'
      }).join('') : '<p class="dim">这里没有留言。</p>'
    } catch (e) { msgEl.textContent = '读不到：' + e.message }
  }
  async function post(body) {
    const r = await fetch('/api/admin/support', { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({ ok: false }))
    if (!j.ok) throw new Error(j.why || ('HTTP ' + r.status))
    return j
  }
  itemsEl.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-sw]')
    if (!b) return
    const reason = (itemsEl.querySelector('input[data-reason="' + b.dataset.id + '"]') || {}).value || ''
    b.disabled = true
    try { await post({ action: 'review', id: b.dataset.id, status: b.dataset.sw, expected: b.dataset.from, reason }); msgEl.textContent = '已处理'; await load() }
    catch (err) { msgEl.textContent = '没成：' + err.message; b.disabled = false }
  })
  $('#swSave').addEventListener('click', async () => {
    try { await post({ action: 'config', title: titleEl.value, enabled: enabledEl.checked }); msgEl.textContent = '设置已保存'; await load() }
    catch (err) { msgEl.textContent = '没成：' + err.message }
  })
  $('#swRefresh').addEventListener('click', load)
  statusEl.addEventListener('change', load)
  load()
})();
`
