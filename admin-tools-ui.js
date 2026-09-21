const toolsHtml = `<div class='panel'>
  <div class='row'>
    <strong>奖励发放历史</strong>
  </div>
  <div class='row'>
    <textarea aria-label='奖励查询对战码' id='grantsWho' rows='2' placeholder='输入对战码或ID，用空格/逗号分隔'></textarea>
  </div>
  <div class='row'>
    <button type='button' id='btnGrants'>查询奖励历史</button>
  </div>
  <div class='row'>
    <div id='grantsResult'></div>
  </div>
</div>

<div class='panel'>
  <div class='row'>
    <strong>重复发奖清理</strong>
  </div>
  <div class='row'>
    <label for='dedupeFrom'>开始时间 ISO</label>
    <input type='text' id='dedupeFrom' placeholder='2026-09-17T00:00:00.000Z'>
  </div>
  <div class='row'>
    <label for='dedupeTo'>结束时间 ISO</label>
    <input type='text' id='dedupeTo' placeholder='2026-09-17T06:00:00.000Z'>
  </div>
  <div class='row'>
    <button type='button' id='btnDedupePreview'>预览重复发奖</button>
  </div>
  <div class='row'>
    <div id='dedupePreviewResult'></div>
  </div>
  <div class='row'>
    <button type='button' id='btnDedupeApply' disabled>确认执行清理</button>
  </div>
  <div class='row'>
    <div id='dedupeApplyResult'></div>
  </div>
</div>

<div class='panel'>
  <div class='row'>
    <strong>天梯异常标记</strong>
  </div>
  <div class='row'>
    <button type='button' id='btnFlagRefresh'>刷新异常名单</button>
  </div>
  <div class='row'>
    <div id='flagList'></div>
  </div>
  <div class='row'>
    <input type='text' aria-label='异常账号对战码' id='flagWho' placeholder='8位对战码'>
  </div>
  <div class='row'>
    <button type='button' id='btnFlagSet'>标记异常</button>
    <button type='button' id='btnFlagClear'>解除标记</button>
  </div>
  <div class='row'>
    <div id='flagActionResult'></div>
  </div>
</div>

<div class='panel'>
  <div class='row'>
    <strong>短信服务状态</strong>
  </div>
  <div class='row'>
    <button type='button' id='btnSmsRefresh'>刷新短信状态</button>
  </div>
  <div class='row'>
    <div id='smsStatus'></div>
  </div>
</div>`;

const toolsScript = String.raw`(function() {
  'use strict';

  function el(id) { return document.getElementById(id); }
  // All dynamic tool values below go through textContent, not HTML.
  function escHtml(s) { return String(s == null ? '' : s); }
  function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function setBusy(btn, busy, busyText) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent;
      btn.textContent = busyText || '处理中...';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.originalLabel || btn.textContent;
      btn.disabled = false;
    }
  }
  function showError(container, msg) {
    if (!container) return;
    clearNode(container);
    var div = document.createElement('div');
    div.className = 'error';
    div.textContent = '错误：' + msg;
    container.appendChild(div);
  }
  function showInfo(container, msg) {
    if (!container) return;
    clearNode(container);
    var div = document.createElement('div');
    div.className = 'info';
    div.textContent = msg;
    container.appendChild(div);
  }

  function apiFetch(url, options) {
    options = options || {};
    options.headers = Object.assign({}, auth(), options.headers || {});
    options.credentials = 'same-origin';
    if (options.body && typeof options.body !== 'string') {
      options.headers = options.headers || {};
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    return fetch(url, options).then(function(res) {
      return res.json().catch(function() { return { ok: false, why: '响应解析失败' }; });
    });
  }

  // 1. Grants history
  var btnGrants = el('btnGrants');
  var grantsWho = el('grantsWho');
  var grantsResult = el('grantsResult');
  btnGrants.addEventListener('click', function() {
    var who = grantsWho.value.trim();
    if (!who) { showError(grantsResult, '请输入对战码或ID列表'); return; }
    setBusy(btnGrants, true);
    showInfo(grantsResult, '查询中...');
    apiFetch('/api/admin/grants', { method: 'POST', body: { who: who } }).then(function(data) {
      setBusy(btnGrants, false);
      if (!data.ok) { showError(grantsResult, data.why || '查询失败'); return; }
      renderGrants(data);
    }).catch(function(err) {
      setBusy(btnGrants, false);
      showError(grantsResult, err.message || '网络错误');
    });
  });

  function renderGrants(data) {
    clearNode(grantsResult);
    if (!data.accounts || !data.accounts.length) {
      showInfo(grantsResult, '没有查询到账号');
      return;
    }
    var container = document.createElement('div');
    data.accounts.forEach(function(acc) {
      var accDiv = document.createElement('div');
      accDiv.className = 'account';
      var header = document.createElement('div');
      header.className = 'account-header';
      var whoText = escHtml(acc.who);
      if (!acc.found) {
        header.textContent = whoText + '：未找到账号';
        accDiv.appendChild(header);
      } else {
        header.textContent = escHtml(acc.name) + '（' + escHtml(acc.code) + '）';
        accDiv.appendChild(header);
        if (!acc.grants || acc.grants.length === 0) {
          var empty = document.createElement('div');
          empty.textContent = '无奖励记录';
          accDiv.appendChild(empty);
        } else {
          var table = document.createElement('table');
          table.className = 'grants-table';
          var thead = document.createElement('thead');
          thead.innerHTML = '<tr><th>日期</th><th>状态</th><th>内容</th><th>附言</th></tr>';
          table.appendChild(thead);
          var tbody = document.createElement('tbody');
          acc.grants.forEach(function(g) {
            var tr = document.createElement('tr');
            var tdDate = document.createElement('td');
            tdDate.textContent = escHtml(g.made || '');
            var tdStatus = document.createElement('td');
            tdStatus.textContent = g.taken ? '已领取' : '未领取';
            var tdContent = document.createElement('td');
            var parts = [];
            if (g.pack) parts.push(escHtml(g.pack) + ' x ' + (g.count || 0));
            if (g.coins) parts.push(g.coins + ' 金币');
            if (g.cardId) parts.push('卡牌 ' + escHtml(g.cardId));
            tdContent.textContent = parts.join('，');
            var tdNote = document.createElement('td');
            tdNote.textContent = escHtml(g.note || '');
            tr.appendChild(tdDate);
            tr.appendChild(tdStatus);
            tr.appendChild(tdContent);
            tr.appendChild(tdNote);
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          accDiv.appendChild(table);
        }
      }
      container.appendChild(accDiv);
    });
    grantsResult.appendChild(container);
  }

  // 2. Grant dedupe
  var dedupeFrom = el('dedupeFrom');
  var dedupeTo = el('dedupeTo');
  var btnDedupePreview = el('btnDedupePreview');
  var btnDedupeApply = el('btnDedupeApply');
  var dedupePreviewResult = el('dedupePreviewResult');
  var dedupeApplyResult = el('dedupeApplyResult');
  var dedupeState = { previewed: false, from: '', to: '', extra: 0 };

  function validateWindow() {
    var from = dedupeFrom.value.trim();
    var to = dedupeTo.value.trim();
    if (!from || !to) return '请填写起止时间';
    var fromDate = new Date(from);
    var toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) return '时间格式无效，请使用ISO格式';
    if (toDate <= fromDate) return '结束时间必须晚于开始时间';
    if (toDate.getTime() - fromDate.getTime() > 6 * 3600 * 1000) return '时间窗口最多6小时';
    return null;
  }

  function updateDedupeApplyState() {
    if (dedupeState.previewed && dedupeState.extra > 0 && dedupeFrom.value.trim() === dedupeState.from && dedupeTo.value.trim() === dedupeState.to) {
      btnDedupeApply.disabled = false;
    } else {
      btnDedupeApply.disabled = true;
      if (dedupeState.previewed) {
        showInfo(dedupeApplyResult, '输入已更改，请重新预览');
      }
    }
  }

  dedupeFrom.addEventListener('input', updateDedupeApplyState);
  dedupeTo.addEventListener('input', updateDedupeApplyState);

  btnDedupePreview.addEventListener('click', function() {
    var err = validateWindow();
    if (err) { showError(dedupePreviewResult, err); return; }
    var from = dedupeFrom.value.trim();
    var to = dedupeTo.value.trim();
    setBusy(btnDedupePreview, true);
    showInfo(dedupePreviewResult, '预览中...');
    apiFetch('/api/admin/grant_dedupe', { method: 'POST', body: { from: from, to: to, apply: false } }).then(function(data) {
      setBusy(btnDedupePreview, false);
      if (!data.ok) { showError(dedupePreviewResult, data.why || '预览失败'); return; }
      dedupeState.previewed = true;
      dedupeState.from = from;
      dedupeState.to = to;
      dedupeState.extra = data.extra || 0;
      updateDedupeApplyState();
      renderDedupePreview(data);
    }).catch(function(err) {
      setBusy(btnDedupePreview, false);
      showError(dedupePreviewResult, err.message || '网络错误');
    });
  });

  function renderDedupePreview(data) {
    clearNode(dedupePreviewResult);
    var div = document.createElement('div');
    var lines = [];
    lines.push('受影响账号数：' + data.accounts);
    lines.push('重复条数：' + data.extra);
    lines.push('扫描行数：' + data.rows);
    lines.push('已领取副本数：' + data.collectedCopies);
    lines.push('类型分布：');
    if (data.contents && Object.keys(data.contents).length) {
      Object.keys(data.contents).forEach(function(k) {
        lines.push('  ' + escHtml(k) + '：' + data.contents[k] + ' 条');
      });
    } else {
      lines.push('  无重复类型');
    }
    var pre = document.createElement('pre');
    pre.textContent = lines.join('\n');
    div.appendChild(pre);
    dedupePreviewResult.appendChild(div);
  }

  btnDedupeApply.addEventListener('click', function() {
    if (btnDedupeApply.disabled) return;
    var err = validateWindow();
    if (err) { showError(dedupeApplyResult, err); return; }
    if (!dedupeState.previewed || dedupeFrom.value.trim() !== dedupeState.from || dedupeTo.value.trim() !== dedupeState.to) {
      showError(dedupeApplyResult, '请先重新预览');
      return;
    }
    var confirmMsg = '确定要删除未领取的重复发奖记录吗？此操作不可撤销，将删除 ' + dedupeState.extra + ' 条重复记录。';
    if (!confirm(confirmMsg)) return;
    setBusy(btnDedupeApply, true);
    showInfo(dedupeApplyResult, '执行中...');
    apiFetch('/api/admin/grant_dedupe', { method: 'POST', body: { from: dedupeState.from, to: dedupeState.to, apply: true } }).then(function(data) {
      setBusy(btnDedupeApply, false);
      if (!data.ok) { showError(dedupeApplyResult, data.why || '执行失败'); return; }
      showInfo(dedupeApplyResult, '清理完成，删除条数：' + data.removed);
      dedupeState.previewed = false;
      updateDedupeApplyState();
      clearNode(dedupePreviewResult);
    }).catch(function(err) {
      setBusy(btnDedupeApply, false);
      showError(dedupeApplyResult, err.message || '网络错误');
    });
  });

  // 3. Flag list and actions
  var btnFlagRefresh = el('btnFlagRefresh');
  var flagList = el('flagList');
  var flagWho = el('flagWho');
  var btnFlagSet = el('btnFlagSet');
  var btnFlagClear = el('btnFlagClear');
  var flagActionResult = el('flagActionResult');

  function loadFlagList() {
    setBusy(btnFlagRefresh, true);
    showInfo(flagList, '加载中...');
    apiFetch('/api/admin/flag', { method: 'GET' }).then(function(data) {
      setBusy(btnFlagRefresh, false);
      if (!data.ok) { showError(flagList, data.why || '获取名单失败'); return; }
      renderFlagList(data.flagged || []);
    }).catch(function(err) {
      setBusy(btnFlagRefresh, false);
      showError(flagList, err.message || '网络错误');
    });
  }

  function renderFlagList(flagged) {
    clearNode(flagList);
    if (!flagged.length) {
      showInfo(flagList, '暂无异常标记');
      return;
    }
    var table = document.createElement('table');
    table.className = 'flag-table';
    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>名称</th><th>对战码</th><th>已赛</th><th>上限</th><th>超出</th></tr>';
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    flagged.forEach(function(f) {
      var tr = document.createElement('tr');
      var tdName = document.createElement('td');
      tdName.textContent = escHtml(f.name || '');
      var tdWho = document.createElement('td');
      tdWho.textContent = escHtml(f.who || '');
      var tdPlayed = document.createElement('td');
      tdPlayed.textContent = f.played;
      var tdCeiling = document.createElement('td');
      tdCeiling.textContent = f.ceiling;
      var tdOver = document.createElement('td');
      tdOver.textContent = f.over;
      tr.appendChild(tdName);
      tr.appendChild(tdWho);
      tr.appendChild(tdPlayed);
      tr.appendChild(tdCeiling);
      tr.appendChild(tdOver);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    flagList.appendChild(table);
  }

  function getFlagWhoError() {
    var who = flagWho.value.trim();
    if (!/^[0-9A-Fa-f]{8}$/.test(who)) return '请输入8位十六进制对战码';
    return null;
  }

  btnFlagSet.addEventListener('click', function() {
    var who = flagWho.value.trim();
    var err = getFlagWhoError();
    if (err) { showError(flagActionResult, err); return; }
    if (!confirm('确定标记该账号为天梯异常？')) return;
    setBusy(btnFlagSet, true);
    apiFetch('/api/admin/flag', { method: 'POST', body: { who: who, clear: false } }).then(function(data) {
      setBusy(btnFlagSet, false);
      if (!data.ok) { showError(flagActionResult, data.why || '标记失败'); return; }
      showInfo(flagActionResult, '已标记：' + escHtml(data.to));
      loadFlagList();
    }).catch(function(err) {
      setBusy(btnFlagSet, false);
      showError(flagActionResult, err.message || '网络错误');
    });
  });

  btnFlagClear.addEventListener('click', function() {
    var who = flagWho.value.trim();
    var err = getFlagWhoError();
    if (err) { showError(flagActionResult, err); return; }
    if (!confirm('确定解除该账号的天梯异常标记？')) return;
    setBusy(btnFlagClear, true);
    apiFetch('/api/admin/flag', { method: 'POST', body: { who: who, clear: true } }).then(function(data) {
      setBusy(btnFlagClear, false);
      if (!data.ok) { showError(flagActionResult, data.why || '解除失败'); return; }
      showInfo(flagActionResult, '已解除：' + escHtml(data.to));
      loadFlagList();
    }).catch(function(err) {
      setBusy(btnFlagClear, false);
      showError(flagActionResult, err.message || '网络错误');
    });
  });

  btnFlagRefresh.addEventListener('click', loadFlagList);

  // 4. SMS status
  var btnSmsRefresh = el('btnSmsRefresh');
  var smsStatus = el('smsStatus');

  function loadSmsStatus() {
    setBusy(btnSmsRefresh, true);
    showInfo(smsStatus, '加载中...');
    apiFetch('/api/admin/sms', { method: 'GET' }).then(function(data) {
      setBusy(btnSmsRefresh, false);
      if (!data.ok) { showError(smsStatus, data.why || '获取状态失败'); return; }
      renderSmsStatus(data);
    }).catch(function(err) {
      setBusy(btnSmsRefresh, false);
      showError(smsStatus, err.message || '网络错误');
    });
  }

  function renderSmsStatus(data) {
    clearNode(smsStatus);
    var div = document.createElement('div');
    var lines = [];
    lines.push('configured: ' + (data.configured ? 'true' : 'false'));
    lines.push('dev: ' + (data.dev ? 'true' : 'false'));
    var stats = data.stats || {};
    lines.push('sent24: ' + (stats.sent24 != null ? stats.sent24 : '-'));
    lines.push('bound24: ' + (stats.bound24 != null ? stats.bound24 : '-'));
    lines.push('bound: ' + (stats.bound != null ? stats.bound : '-'));
    lines.push('last_sent: ' + (stats.last_sent ? escHtml(stats.last_sent) : '-'));
    lines.push('last_bound: ' + (stats.last_bound ? escHtml(stats.last_bound) : '-'));
    var pre = document.createElement('pre');
    pre.textContent = lines.join('\n');
    div.appendChild(pre);
    smsStatus.appendChild(div);
  }

  btnSmsRefresh.addEventListener('click', loadSmsStatus);

  // Initial auto-load read-only data
  loadFlagList();
  loadSmsStatus();
})();`;

export { toolsHtml, toolsScript };