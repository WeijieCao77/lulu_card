export const feedbackAdminScript = String.raw`
(function() {
  // 使用宿主已有的 $, esc, auth
  // 注意：$ = (s) => document.querySelector(s);
  // esc = ...
  // auth = () => ({ 'Authorization': 'Bearer ' + sessionStorage.getItem('token') });

  const countsEl = $('#fbCounts');
  const refreshBtn = $('#fbRefresh');
  const filterEl = $('#fbFilter');
  const messageEl = $('#fbMessage');
  const itemsEl = $('#fbItems');

  let currentFilter = 'public';
  let busy = false;
  let items = [];
  let counts = { pending: 0, shown: 0, total: 0 };

  const stateTextMap = {
    pending: '待审',
    shown: '公开',
    taken: '已采纳',
    fixed: '已修复',
    hidden: '隐藏',
    merged: '已合并'
  };

  function setMessage(msg, isError = false) {
    messageEl.textContent = msg;
    messageEl.style.color = isError ? 'var(--warn)' : 'var(--win)';
  }

  function setBusyState(b) {
    busy = b;
    document.querySelectorAll('#feedback button, #feedback select, #feedback input').forEach(el => el.disabled = b);
    refreshBtn.disabled = b;
  }

  function updateCounts() {
    countsEl.innerHTML = '待审：' + counts.pending + ' / 公开：' + counts.shown + ' / 总计：' + counts.total;
  }

  function applyFilter() {
    currentFilter = filterEl.value;
    renderItems();
  }

  function renderItems() {
    const filtered = currentFilter === 'all' ? items : items.filter(item => {
      if (currentFilter === 'public') return item.state === 'shown' || item.state === 'taken' || item.state === 'fixed';
      if (currentFilter === 'hidden') return item.state === 'hidden';
      if (currentFilter === 'merged') return item.state === 'merged';
      return item.state === 'pending';
    });

    const sortFn = (a, b) => {
      if (currentFilter === 'pending') {
        return a.t - b.t;
      } else if (currentFilter === 'public' || currentFilter === 'all') {
        if (b.pin !== a.pin) return b.pin ? 1 : -1;
        if (b.votes !== a.votes) return b.votes - a.votes;
        return b.t - a.t;
      } else if (currentFilter === 'hidden') {
        return b.t - a.t;
      } else if (currentFilter === 'merged') {
        return b.t - a.t;
      }
      return b.t - a.t;
    };

    filtered.sort(sortFn);

    itemsEl.innerHTML = '';
    if (filtered.length === 0) {
      itemsEl.innerHTML = '<div class="panel">（当前筛选条件下暂无条目）</div>';
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'panel row';
      card.style.display = 'block';
      card.style.marginTop = '12px';
      card.style.overflowWrap = 'anywhere';
      card.dataset.id = item.id;

      const stateText = stateTextMap[item.state] || item.state;

      let html = '';
      html += '<div style="font-size:0.9em; color:var(--muted);">';
      html += '作者：' + esc(item.author) + ' · ID：' + esc(item.id) + ' · 时间：' + new Date(item.t).toLocaleString();
      html += ' · 票数：' + item.votes + ' · 状态：' + stateText;
      if (item.pin) html += ' · <span style="color:var(--warn);">已置顶</span>';
      if (item.duplicate) html += ' · <span style="color:var(--warn);">疑似重复：<a href="#" data-fill-merge="' + esc(item.duplicate) + '">' + esc(item.duplicate) + '</a></span>';
      html += '</div>';
      html += '<div style="margin:0.4em 0;">' + esc(item.text) + '</div>';

      if (item.merge) {
        html += '<div style="font-size:0.9em; border-left:3px solid #ccc; padding-left:0.5em;">';
        if (item.merge.availability === 'missing') {
          html += '合并目标缺失';
        } else if (item.merge.availability === 'private') {
          html += '合并目标为非公开状态';
        } else {
          html += '合并到：ID ' + esc(item.merge.target.id) + '：' + esc(item.merge.target.text) + '（状态：' + (stateTextMap[item.merge.target.state] || item.merge.target.state) + '，票数：' + item.merge.target.votes + '）';
        }
        html += '</div>';
      }

      html += '<div style="margin-top:0.5em;">';
      if (item.state !== 'merged') {
        html += '<input type="text" placeholder="合并目标ID" data-merge-for="' + esc(item.id) + '" style="margin-right:0.5em;">';
      }
      if (item.state === 'pending') {
        html += '<button data-action="show" data-id="' + esc(item.id) + '">展示</button> ';
        html += '<button data-action="hide" data-id="' + esc(item.id) + '">隐藏</button> ';
        html += '<button data-action="merge" data-id="' + esc(item.id) + '">合并到...</button> ';
      } else if (item.state === 'shown') {
        html += '<button data-action="taken" data-id="' + esc(item.id) + '">标为已采纳</button> ';
        html += '<button data-action="fixed" data-id="' + esc(item.id) + '">标为已修复</button> ';
        html += '<button data-action="hide" data-id="' + esc(item.id) + '">隐藏</button> ';
        html += '<button data-action="merge" data-id="' + esc(item.id) + '">合并到...</button> ';
      } else if (item.state === 'taken') {
        html += '<button data-action="show" data-id="' + esc(item.id) + '">恢复展示</button> ';
        html += '<button data-action="fixed" data-id="' + esc(item.id) + '">标为已修复</button> ';
        html += '<button data-action="hide" data-id="' + esc(item.id) + '">隐藏</button> ';
        html += '<button data-action="merge" data-id="' + esc(item.id) + '">合并到...</button> ';
      } else if (item.state === 'fixed') {
        html += '<button data-action="show" data-id="' + esc(item.id) + '">恢复展示</button> ';
        html += '<button data-action="hide" data-id="' + esc(item.id) + '">隐藏</button> ';
        html += '<button data-action="merge" data-id="' + esc(item.id) + '">合并到...</button> ';
      } else if (item.state === 'hidden') {
        html += '<button data-action="show" data-id="' + esc(item.id) + '">展示</button> ';
        html += '<button data-action="pending" data-id="' + esc(item.id) + '">退回待审</button> ';
        html += '<button data-action="merge" data-id="' + esc(item.id) + '">合并到...</button> ';
      } else if (item.state === 'merged') {
        // merged only delete
      }
      if (item.state !== 'merged') {
        if (item.pin) {
          html += '<button data-action="unpin" data-id="' + esc(item.id) + '">取消置顶</button> ';
        } else {
          html += '<button data-action="pin" data-id="' + esc(item.id) + '">置顶</button> ';
        }
      }
      html += '<button data-action="delete" data-id="' + esc(item.id) + '">删除</button>';
      html += '</div>';

      card.innerHTML = html;
      itemsEl.appendChild(card);
    });
  }

  async function loadItems() {
    if (busy) return;
    setBusyState(true);
    setMessage('加载中...');
    try {
      const res = await fetch('/api/admin/feedback', { headers: auth() });
      if (!res.ok) {
        if (res.status === 404) {
          setMessage('管理接口未找到（404）', true);
        } else {
          setMessage('加载失败：HTTP ' + res.status, true);
        }
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        setMessage('加载失败：' + (data.why || '未知错误'), true);
        return;
      }
      counts = data.counts;
      items = data.items;
      updateCounts();
      renderItems();
      setMessage('加载成功');
    } catch (err) {
      setMessage('网络错误：' + err.message, true);
    } finally {
      setBusyState(false);
    }
  }

  async function performAction(action, id, extra) {
    if (busy) return;
    setBusyState(true);
    setMessage('处理中...');
    try {
      const body = { action, id };
      if (extra) Object.assign(body, extra);
      if (action === 'delete' && !confirm('确定要删除此条目吗？此操作不可撤销！')) {
        setMessage('已取消');
        return;
      }
      if (action === 'pin' || action === 'unpin') {
        body.action = 'pin';
        body.on = action === 'pin';
      }
      if (action === 'show' || action === 'hide' || action === 'pending' || action === 'taken' || action === 'fixed') {
        let state;
        if (action === 'show') state = 'shown';
        else if (action === 'hide') state = 'hidden';
        else if (action === 'pending') state = 'pending';
        else if (action === 'taken') state = 'taken';
        else if (action === 'fixed') state = 'fixed';
        body.action = 'state';
        body.state = state;
      }
      const res = await fetch('/api/admin/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({ ok: false, why: '响应解析失败' }));
      if (!res.ok || !data.ok) {
        setMessage('操作失败：' + (data.why || 'HTTP ' + res.status), true);
        return;
      }
      if (data.counts) counts = data.counts;
      if (data.items) items = data.items;
      updateCounts();
      renderItems();
      setMessage('操作成功');
    } catch (err) {
      setMessage('网络错误：' + err.message, true);
    } finally {
      setBusyState(false);
    }
  }

  itemsEl.addEventListener('click', (e) => {
    const target = e.target.closest('button');
    if (target) {
      const action = target.getAttribute('data-action');
      const id = target.getAttribute('data-id');
      if (action && id) {
        if (action === 'merge') {
          const input = target.closest('.row').querySelector('input[data-merge-for]');
          const toId = input ? input.value.trim() : '';
          if (!toId) {
            setMessage('请先填写合并目标ID或点击疑似重复链接', true);
            return;
          }
          if (!confirm('确认将条目 ' + id + ' 合并到 ' + toId + '？')) {
            setMessage('已取消');
            return;
          }
          performAction('merge', id, { to: toId });
        } else {
          performAction(action, id);
        }
      }
      return;
    }
    const fillLink = e.target.closest('a[data-fill-merge]');
    if (fillLink) {
      e.preventDefault();
      const duplicateId = fillLink.getAttribute('data-fill-merge');
      const input = fillLink.closest('.row').querySelector('input[data-merge-for]');
      if (input) {
        input.value = duplicateId;
        setMessage('已填入疑似重复ID：' + duplicateId);
      }
    }
  });

  refreshBtn.addEventListener('click', loadItems);
  filterEl.addEventListener('change', applyFilter);

  loadItems();
})();
`