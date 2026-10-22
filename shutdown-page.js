/**
 * 停服, 2:00 Beijing on 2026-10-22 (the lawyer's letter of 2026-10-20).
 *
 * From that moment every page — on the domain and on the service's own
 * *.railway.app address alike, so no way in is left open — answers with the
 * one page below, and every API call with 410.
 * The owner's routes (/admin, /api/admin/*) and the health checks stay up, so
 * a last backup can still be taken after the doors close.
 *
 * SHUTDOWN_AT moves the moment for a local test; production uses the date.
 */
export const SHUTDOWN_AT = Date.parse(process.env.SHUTDOWN_AT || '2026-10-22T02:00:00+08:00')

export const closed = (now = Date.now()) => now >= SHUTDOWN_AT

/** still served after the close: the owner's tools and Railway's checks */
export const stillOpen = (path) =>
  path === '/healthz' || path === '/readyz' || path === '/admin' || path.startsWith('/api/admin/')

const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<!-- assets/index-closed.js: a tab still running the old game polls / for a
     new entry file; naming a different one here makes it offer 刷新, which
     lands on this page -->
<title>游戏已暂停运营</title>
<style>
  :root {
    --bg: #f4f1ea; --card: #fffdf8; --ink: #1f1c18; --muted: #6f685d;
    --line: #e4ddd0; --accent: #d9677b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14120f; --card: #1d1a16; --ink: #f1ece2; --muted: #a39b8d;
      --line: #2f2a23; --accent: #f08da0;
    }
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body {
    background: var(--bg); color: var(--ink);
    font: 16px/1.75 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px calc(24px + env(safe-area-inset-bottom));
  }
  main {
    width: 100%; max-width: 440px; background: var(--card);
    border: 1px solid var(--line); border-radius: 20px;
    padding: 40px 28px 32px; text-align: center;
  }
  .mark { font-size: 44px; line-height: 1; }
  .date {
    margin-top: 18px; color: var(--muted); font-size: 13px; letter-spacing: .08em;
  }
  h1 { margin-top: 6px; font-size: 26px; line-height: 1.35; font-weight: 700; }
  .body { margin-top: 20px; text-align: left; }
  .body p + p { margin-top: 10px; }
  .next {
    margin-top: 24px; padding: 16px 18px; border-radius: 14px;
    border: 1px dashed var(--accent); text-align: left;
  }
  .next b { color: var(--accent); }
  .sign { margin-top: 28px; color: var(--muted); font-size: 14px; }
  .vm { margin-top: 16px; padding: 16px 18px; border-radius: 14px; background: var(--bg); text-align: left; }
  .vm[hidden] { display: none; }
  .vm-label { color: var(--muted); font-size: 13px; }
  .vm-id {
    margin-top: 4px; font: 600 17px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .02em; word-break: break-all; user-select: all;
  }
  .vm-note { margin-top: 6px; font-size: 13px; color: var(--muted); }
  .vm button {
    margin-top: 10px; font: inherit; font-size: 14px; padding: 6px 16px; border-radius: 999px;
    border: 1px solid var(--accent); background: transparent; color: var(--accent); cursor: pointer;
  }
</style>
</head>
<body>
<main>
  <div class="mark" aria-hidden="true">🐷</div>
  <div class="date">2026.10.22 02:00</div>
  <h1>游戏已暂停运营</h1>
  <div class="body">
    <p>噜噜卡到这里就先停下了。</p>
    <p>很感谢大家一个月以来的陪伴，没想到能受到大家这么多的喜爱。</p>
    <p>开过的包、打过的天梯、凌晨还在等的全服杯，我们都记得。</p>
  </div>
  <div class="next">
    后续请期待<b>猪之家自己 IP 的游戏</b>。老玩家会有回馈，消息在群里通知。
  </div>
  <div class="vm" id="vm" hidden>
    <div class="vm-label">你的老账号 ID</div>
    <div class="vm-id" id="vm-id"></div>
    <div class="vm-note">领老玩家回馈要用。请截图或复制保存，不要发给别人。</div>
    <button type="button" id="vm-copy">复制</button>
  </div>
  <div class="sign">江湖有缘再见 · 猪之家</div>
</main>
<script>
  // the old game kept the account ID in this browser, on this site; show it
  // so it outlives the game. Nothing is sent anywhere.
  (function () {
    var id = null
    try { id = localStorage.getItem('lolcards:card:id') } catch (e) {}
    if (!id || !/^VM-[0-9A-Z-]+$/i.test(id)) return
    document.getElementById('vm-id').textContent = id
    document.getElementById('vm').hidden = false
    var btn = document.getElementById('vm-copy')
    btn.onclick = function () {
      var done = function () { btn.textContent = '已复制' }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(done, function () {})
      } else {
        var r = document.createRange(); r.selectNodeContents(document.getElementById('vm-id'))
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r)
        try { if (document.execCommand('copy')) done() } catch (e) {}
      }
    }
  })()
</script>
</body>
</html>
`

export const shutdownHtml = () => PAGE
