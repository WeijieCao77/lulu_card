export const overviewScript = String.raw`
let luluDays = 30;
function luluTable(headers, rows) {
  return table(headers, rows.map(row => Array.isArray(row) ? '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>' : row));
}
function luluOverview(d, h) {
  luluDays = d.days || 30;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const devices = d.devices || [];
  const referrers = d.referrers || [];
  const screens = d.screens || [];
  const errors = d.errors || [];
  const history = d.history || {};
  const totals = history.totals || {};
  const days = history.days || [];
  const storage = d.storage || {};

  let html = '<p class="muted">新增、留存及在线时长基于仍保留的原始事件；持久化历史汇总单独展示。设备数不等于真实人数。</p><div id="lulu-live">加载实时统计…</div><div class="grid">';

  html += panel('收藏库与账号', table(['指标','数值'], h.collRows));
  html += panel('卡包统计', table(['卡包','开出','人数','金卡','重复/包'], h.packRows));
  html += panel('每日挑战', table(['题型','人数','解开率','平均次数'], h.chRows));
  html += panel('天梯与杯赛', table(['模式','场次','人数','胜率'], h.matchRows));
  // Device table
  html += panel('设备访问', luluTable(['设备', '访客数'], devices.map(r => [esc(r.device), String(r.visitors)])));

  // Referrer table
  html += panel('来源统计', luluTable(['来源', '访客数'], referrers.map(r => [esc(r.ref), String(r.visitors)])));

  // Screen widths table
  html += panel('访问页面', luluTable(['页面', '次数'], screens.map(r => [esc(r.screen), String(r.n)])));

  // Errors table
  html += panel('错误统计', luluTable(['错误消息', '访客数', '次数'], errors.map(r => [esc(r.msg), String(r.visitors), String(r.n)])));

  // Storage info
  html += panel('存储状态', '<ul>' +
    '<li>行数: ' + esc(storage.rows) + '</li>' +
    '<li>字节: ' + esc(storage.bytes) + '</li>' +
    '<li>最大行数: ' + esc(storage.maxRows) + '</li>' +
    '<li>最大字节: ' + esc(storage.maxBytes) + '</li>' +
    '<li>最旧记录: ' + esc(storage.oldest) + '</li>' +
    '<li>拒绝写入: ' + (storage.refusing ? '是' : '否') + '</li>' +
    '</ul>');

  // History totals and daily table
  html += panel('历史总计', '<ul>' +
    '<li>玩家总数: ' + esc(totals.players) + '</li>' +
    '<li>7天活跃: ' + esc(totals.active7) + '</li>' +
    '</ul>');
  html += panel('每日历史', luluTable(['日期', '访客', '新访客', '会话', '抽卡', '活跃分钟'], days.map(day => [
    esc(day.day),
    String(day.visitors),
    String(day.new_visitors),
    String(day.sessions),
    String(day.card_pulls),
    String(day.active_min)
  ])));

  // Live placeholder
  html += '</div><div id="lulu-db"><p class="muted">加载数据库健康数据…</p></div>';

  // Queue refresh
  queueMicrotask(() => {
    refreshLive(d);
    refreshDatabaseHealth();
  });

  return html;
}

function refreshDatabaseHealth() {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dbDiv = $('#lulu-db');
  if (!dbDiv) return;
  fetch('/api/admin/db', { headers: auth() })
    .then((r) => {
      if (!r.ok) throw new Error('数据库 HTTP ' + r.status);
      return r.json();
    })
    .then((health) => {
      if (!health.ok) throw new Error('数据库健康数据不可用');
      const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      let html = '<div class="grid">';
      if (health.unavailable.includes('database') || health.unavailable.includes('tables')) html += '<p class="muted">部分数据库统计暂时不可用。</p>';
      if (health.database) {
        const mb = Math.round(health.database.sizeBytes / 1048576);
        html += panel('数据库大小', '<ul><li>' + mb + ' MB</li></ul>');
      }
      if (health.available.includes('tables') && health.tables.length > 0) {
        const rows = health.tables.slice(0, 20).map((t) => [
          esc(t.name),
          Math.round(t.totalBytes / 1048576) + ' MB',
          (t.heapBytes / 1048576).toFixed(2) + ' MB',
          (t.indexBytes / 1048576).toFixed(2) + ' MB',
          (t.toastBytes / 1048576).toFixed(2) + ' MB',
          t.liveRows !== null ? String(t.liveRows) : '—',
          t.deadRows !== null ? String(t.deadRows) : '—'
        ]);
        html += panel('表统计（前20）', luluTable(['表名', '总大小', '数据', '索引', 'TOAST等', '活行估计', '死行估计'], rows));
      }
      if (health.wal) {
        html += panel('WAL', '<ul><li>' + Math.round(health.wal.totalBytes / 1048576) + ' MB / ' + health.wal.fileCount + ' 文件</li></ul>');
      } else if (health.unavailable.includes('wal')) {
        html += panel('WAL', '<ul><li class="muted">WAL 统计不可用</li></ul>');
      }
      if (health.available.includes('requests') && health.requests) {
        html += panel('最近72小时请求 · UTC日期', luluTable(['日期', '数量'], health.requests.map((r) => [esc(r.day), String(r.count)])));
      }
      html += '<p class="muted">只读统计；不代表磁盘剩余配额。删除记录后的空间由数据库维护回收。数据最多缓存60秒。</p><button class="sm" onclick="refreshDatabaseHealth()">刷新数据库统计</button></div>';
      dbDiv.innerHTML = html;
    })
    .catch((err) => {
      if (dbDiv) dbDiv.innerHTML = '<p class="error">加载数据库健康数据失败: ' + esc(err.message) + '</p>';
    });
}

function refreshLive(d) {
  // Use a global request counter to avoid stale responses
  if (!window.__luluReqId) window.__luluReqId = 0;
  const reqId = ++window.__luluReqId;
  const days = d.days || 30; // default to 14 days if not provided

  Promise.all([
    fetch('/api/admin/overview?days=' + days, { headers: auth() }).then(r => { if (!r.ok) throw new Error('统计 HTTP '+r.status); return r.json() }),
    fetch('/api/admin/perf', { headers: auth() }).then(r => { if (!r.ok) throw new Error('性能 HTTP '+r.status); return r.json() })
  ]).then(([metrics, perf]) => {
    if (reqId !== window.__luluReqId) return; // stale response
    const live = $('#lulu-live');
    if (!live) return;

    if (!metrics.ok || !metrics.today) throw new Error(metrics.why || '统计数据尚不可用');
    let html = '<div class="grid">';

    // Today metrics
    const today = metrics.today || {};
    html += '<div class="panel lulu-today"><h2>今日 · 北京时间</h2>';
    html += '<div class="metric"><span>新设备</span><em>' + esc(String(today.new_devices || 0)) + '</em></div>';
    html += '<div class="metric"><span>活跃访客</span><em>' + esc(String(today.active_visitors || 0)) + '</em></div>';
    html += '<div class="metric"><span>会话</span><em>' + esc(String(today.sessions || 0)) + '</em></div>';
    html += '<div class="metric"><span>页面浏览</span><em>' + esc(String(today.page_views || 0)) + '</em></div>';
    html += '</div>';

    // Daily table (last 14 days)
    const daily = metrics.daily || [];
    html += panel('近14天趋势', luluTable(['日期', '新访客', '活跃访客', '会话', '页面浏览'], daily.slice(-14).map(day => [
      esc(day.day),
      String(day.new_visitors || 0),
      String(day.active_visitors || 0),
      String(day.sessions || 0),
      String(day.page_views || 0)
    ])));

    // New vs active bar chart (simple)
    html += '<div class="panel lulu-chart">';
    html += '<h4>新访客与活跃访客</h4>';
    html += '<div class="bars">';
    const maxVal = Math.max(1,...daily.slice(-14).map(day=>Number(day.active_visitors)||0));
    daily.slice(-14).forEach(day => {
      const newPct = ((day.new_visitors || 0) / maxVal * 100).toFixed(1);
      const activePct = ((day.active_visitors || 0) / maxVal * 100).toFixed(1);
      html += '<div class="lulu-bar" title="' + esc(day.day) + '">' +
        '<span class="lulu-bar-label">' + esc(day.day.slice(5)) + '</span>' +
        '<span class="bar-new" style="height:' + newPct + '%"></span>' +
        '<span class="bar-active" style="height:' + activePct + '%"></span>' +
        '</div>';
    });
    html += '</div></div>';

    // Device duration metrics
    const dd = metrics.deviceDuration || {};
    html += panel('设备在线时长', '<ul>' +
      '<li>总活跃秒数: ' + esc(String(dd.total_active_s || 0)) + '</li>' +
      '<li>平均设备活跃秒数: ' + esc(String(dd.avg_device_active_s || 0)) + '</li>' +
      '<li>中位设备活跃秒数: ' + esc(String(dd.median_device_active_s || 0)) + '</li>' +
      '<li>每设备每日平均活跃秒数: ' + esc(String(dd.avg_daily_active_s || 0)) + '</li>' +
      '<li>每设备每日中位活跃秒数: ' + esc(String(dd.median_daily_active_s || 0)) + '</li>' +
      '</ul>');

    // Retention table
    const retention = metrics.retention || [];
    html += panel('留存率', luluTable(['同期群', '规模', 'D1', 'D3', 'D7'], retention.map(r => [
      esc(r.cohort),
      String(r.size || 0),
      r.d1 != null ? Math.round(Number(r.d1)/Math.max(1,Number(r.size))*100)+'%' : '—',
      r.d3 != null ? Math.round(Number(r.d3)/Math.max(1,Number(r.size))*100)+'%' : '—',
      r.d7 != null ? Math.round(Number(r.d7)/Math.max(1,Number(r.size))*100)+'%' : '—'
    ])));

    // Screen widths stats
    const widths = metrics.screenWidths || [];
    html += panel('屏幕宽度统计', luluTable(['宽度', '数量'], widths.map(w => [esc(String(w.width)), String(w.n)])));

    // Performance
    if (perf) {
      const loop = perf.loop || {};
      html += panel('性能', '<ul>' +
        '<li>运行秒数: ' + esc(String(perf.upSec || 0)) + '</li>' +
        '<li>内存(MB): ' + esc(String(perf.rssMb || 0)) + '</li>' +
        '<li>循环P50: ' + esc(String(loop.p50 || 0)) + ' ms</li>' +
        '<li>循环P99: ' + esc(String(loop.p99 || 0)) + ' ms</li>' +
        '<li>循环Max: ' + esc(String(loop.max || 0)) + ' ms</li>' +
        '</ul>');
    }

    live.innerHTML = html + '</div>';

    // Schedule refresh every 5 minutes
    if (!window.__luluTimer) {
      window.__luluTimer = setInterval(() => {
        if (document.visibilityState === 'visible') {
          refreshLive({days:luluDays});
        }
      }, 300000);
    }
  }).catch(err => {
    if (reqId !== window.__luluReqId) return;
    const live = $('#lulu-live');
    if (live) live.innerHTML = '<p class="error">加载实时数据失败: ' + esc(err.message) + '</p>';
  });
}
`;
