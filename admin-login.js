// Public shell only. Account data and every administrative action remain token-gated.
export const adminLoginHtml = () => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>噜噜卡 · 后台登录</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:20px;background:radial-gradient(ellipse at top,#184238,#08151c 65%);color:#e5e7df;font:15px/1.7 system-ui,sans-serif}main{width:min(100%,440px);padding:32px;border:1px solid #496058;border-radius:16px;background:#0e222b;box-shadow:0 24px 80px #0004}h1{color:#d7bc83;margin:8px 0;font-size:26px}p,small{color:#9eb8bf}label{display:block;margin-top:24px}input,button{width:100%;padding:12px;border-radius:8px;font:inherit;margin-top:8px}input{background:#08151c;color:#fff;border:1px solid #496058;min-width:0}button{background:#75d8d0;border:0;font-weight:700;color:#0c2029;cursor:pointer}button:disabled{opacity:.5}a{color:#75d8d0}#message{min-height:26px;color:#e9bf8b}small{letter-spacing:2px}</style></head>
<body><main><small>猪之家出品 / CLUB OFFICE</small><h1>噜噜卡 · 后台看板</h1><p>查看游玩数据、查询玩家，以及通过信箱发放奖励。</p><form id="login"><label for="key">管理员密钥</label><input id="key" name="key" type="password" autocomplete="current-password" required placeholder="输入 ANALYTICS_TOKEN"><button id="submit">进入后台</button></form><p id="message" role="status"></p><a href="/">← 返回游戏</a></main>
<script>
const form=document.getElementById('login'), input=document.getElementById('key'), message=document.getElementById('message'), button=document.getElementById('submit');
async function enter(token){
 button.disabled=true;message.textContent='正在验证…';
 try {
  const response=await fetch('/admin',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  if(!response.ok){try{sessionStorage.removeItem('admin_token')}catch{};message.textContent='密钥不正确，或服务端尚未配置管理员密钥。';return}
  const html=await response.text();
  if(!html.includes('id="adminLogout"')) throw new Error('unavailable');
  try{sessionStorage.setItem('admin_token',token)}catch{message.textContent='请允许此站点使用会话存储后重试。';return}
  input.value='';document.open();document.write(html);document.close();
 } catch {message.textContent='暂时无法连接后台，请稍后重试。'}
 finally {button.disabled=false}
}
form.addEventListener('submit',event=>{event.preventDefault();const token=input.value.trim();if(token)void enter(token)});
try{const saved=sessionStorage.getItem('admin_token');if(saved)void enter(saved)}catch{}
</script></body></html>`
