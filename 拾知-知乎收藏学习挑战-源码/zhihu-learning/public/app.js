const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icons = { home: '<path d="m3 10 9-7 9 7v11H3z"/><path d="M9 21v-8h6v8"/>', folder: '<path d="M3 6h7l2 3h9v11H3z"/>', flag: '<path d="M5 22V3m0 0h14l-3 5 3 5H5"/>', users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 10v-3a6 6 0 0 0-2-4"/>', settings: '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>', book: '<path d="M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16"/>' };
const icon = k => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${icons[k]}</svg>`;
const brand = `<div class="brand"><img src="/favicon.svg" alt="">拾知<small>SHIZHI</small></div>`;
const state = { user: null, config: {}, data: null, route: 'overview', challenge: null, day: 1, authMode: 'register', importRows: [], topicFilter: '', search: '', pendingCompletion: null, mascotPosition: null };
let toastTimer;
function toast(message, error = false) { const el = $('#toast'); el.textContent = message; el.className = error ? 'error' : ''; el.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.display = 'none'; }, 6500); }
async function api(path, body, method = 'POST') {
  const options = body === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(`/api${path}`, options); const value = await res.json();
  if (!res.ok) { if (res.status === 401 && state.user) { state.user = null; renderAuth(); } throw new Error(value.error || '请求失败'); }
  return value;
}
async function perform(button, fn) {
  const original = button?.textContent; if (button) { button.disabled = true; button.textContent = '正在处理…'; }
  try { await fn(); } catch (e) { toast(e.message, true); }
  finally { if (button?.isConnected) { button.disabled = false; button.textContent = original; } }
}
function modal(html) { const el = $('#modal'); el.innerHTML = `<button type="button" class="close" aria-label="关闭">×</button>${html}`; el.querySelector('.close').onclick = () => el.close(); if (!el.open) el.showModal(); }
function closeModal() { $('#modal').close(); }
const options = (list, selected) => list.map(x => `<option value="${esc(x)}" ${x === selected ? 'selected' : ''}>${esc(x)}</option>`).join('');
const demo = i => i?.title?.startsWith('[演示]');
const checked = value => value ? 'checked' : '';
const niceDate = v => v ? new Date(v).toLocaleDateString('zh-CN') : '日期未知';
const done = k => k?.read_done && k?.practice_done && k?.review_done;
async function refresh() { state.data = await api('/dashboard'); }

function renderAuth() {
  const register = state.authMode === 'register';
  $('#app').innerHTML = `<div class="auth-wrap"><section class="auth-story">${brand}<div><p class="eyebrow">从收藏到行动</p><h1>那些「以后再学」，<br>今天开始一件。</h1><p class="muted">整理你的知乎收藏，给想学的事一个开始。</p><div class="paper"><div class="row between"><span>摄影入门 · 示例挑战</span><span class="pill">14 天</span></div><p class="mt"><strong>每天 15 分钟</strong></p><div class="steps-mini"><span><i>1</i>一篇精读</span><span><i>2</i>一项练习</span><span><i>3</i>一次复盘</span></div></div></div><p class="auth-note small muted">独立学习工具 · 兼容知乎收藏 · 非知乎官方产品</p></section><div class="auth-form-wrap"><form id="auth-form" class="auth-form"><p class="eyebrow">欢迎来到拾知</p><h2>${register ? '创建学习账号' : '继续你的学习'}</h2><p class="muted">${register ? '收藏是起点，行动让它变成你的能力。' : '登录后查看收藏、挑战和学习搭子。'}</p><div class="fields">${register ? '<label class="field">昵称<input name="nickname" autocomplete="nickname" maxlength="30" required placeholder="学习搭子怎么称呼你"></label>' : ''}<label class="field">账号<input name="username" autocomplete="username" minlength="3" maxlength="32" pattern="[a-zA-Z0-9_-]{3,32}" required placeholder="字母、数字或下划线"></label><label class="field">密码<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" minlength="8" maxlength="128" required placeholder="至少 8 位"></label><div class="error-inline" id="auth-error" role="alert"></div><button class="primary" type="submit">${register ? '创建账号' : '登录'}</button></div><div class="auth-foot">${register ? '已经有账号？' : '第一次使用？'} <button type="button" class="text" id="switch-auth">${register ? '登录' : '创建账号'}</button></div><p class="small muted">这是拾知账号，与知乎账号独立。导入时无需向本应用提供知乎密码。</p></form></div></div>`;
  $('#switch-auth').onclick = () => { state.authMode = register ? 'login' : 'register'; renderAuth(); };
  $('#auth-form').onsubmit = async e => {
    e.preventDefault(); const button = e.submitter; button.disabled = true; $('#auth-error').textContent = '';
    try { const payload = Object.fromEntries(new FormData(e.target)); const r = await api(register ? '/register' : '/login', payload); state.user = r.user; await refresh(); render(); }
    catch (error) { $('#auth-error').textContent = error.message; button.disabled = false; }
  };
}
const routes = [['overview', 'home', '学习总览'], ['library', 'folder', '我的收藏'], ['challenges', 'flag', '14 天挑战'], ['buddies', 'users', '学习搭子'], ['settings', 'settings', '设置与授权']];
function render() {
  if (!state.user) return renderAuth();
  $('#app').innerHTML = `<div class="shell"><aside class="sidebar">${brand}<nav class="nav" aria-label="主导航">${routes.map(([r, k, title]) => `<button data-nav="${r}" class="${state.route === r ? 'active' : ''}" ${state.route === r ? 'aria-current="page"' : ''}>${icon(k)}${title}</button>`).join('')}</nav><div class="sidebar-note">少收藏一个「以后」，<br>多完成一个「今天」。<br><span class="muted">从每天 15 分钟开始。</span></div><div class="profile-mini"><span class="avatar">${esc(state.user.nickname.slice(0, 1))}</span><div>${esc(state.user.nickname)}<br><button class="text small" data-action="logout">退出登录</button></div></div></aside><main class="main"><div class="topbar"><span>我的学习空间 / ${esc(routes.find(x => x[0] === state.route)?.[2] || '收藏导入')}</span><div class="row"><span class="zhihu">知乎收藏兼容</span><span>${esc(state.user.nickname)}</span></div></div><div id="view"></div></main></div>`;
  renderView();
}
function pageHeader(title, sub, action = '') { return `<div class="page-header"><div><h1>${title}</h1><p class="muted">${sub}</p></div>${action}</div>`; }
function empty(title, text, action = '') { return `<div class="panel empty">${icon('book')}<h2>${title}</h2><p>${text}</p>${action}</div>`; }
function renderView() {
  const view = $('#view');
  if (state.route === 'overview') view.innerHTML = overview();
  if (state.route === 'import') { view.innerHTML = importView(); bindImport(); }
  if (state.route === 'library') { view.innerHTML = library(); bindLibrary(); }
  if (state.route === 'challenges') { view.innerHTML = challenges(); bindCheckin(); }
  if (state.route === 'settings') { view.innerHTML = settings(); bindSettings(); }
  if (state.route === 'buddies') { view.innerHTML = '<p class="loading">正在寻找同行的人…</p>'; loadBuddies().catch(e => toast(e.message, true)); }
}
function topicStateSelect(i) {
  return `<label class="field mt">调整学习状态<select aria-label="调整${esc(i.topic)}的学习状态" data-topic-state="${esc(i.topic)}">${[['unknown', '尚未确认'], ['not_started', '确实还没开始'], ['started', '已经在学'], ['ignore', '暂时不学']].map(([v, n]) => `<option value="${v}" ${i.state === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
}
function overview() {
  const { items, insights, challenges, stats = {} } = state.data;
  const candidates = insights.filter(i => i.candidate); const lead = candidates[0]; const active = challenges[0];
    return pageHeader(`${esc(state.user.nickname)}，今天学一点。`, '把留在收藏夹里的兴趣，变成看得见的进步。', '<div class="row"><button data-action="enable-reminders">开启今日提醒</button><button data-action="export-data">导出数据</button><button class="primary" data-nav="import">＋ 导入知乎收藏</button></div>') +
    `<div class="stats"><div class="stat"><div class="label">已导入收藏</div><strong>${items.length}</strong><span class="small muted">篇</span></div><div class="stat"><div class="label">待开始的学习主题</div><strong>${candidates.length}</strong><span class="small muted">个</span></div><div class="stat"><div class="label">已完成学习日</div><strong>${stats.completedDays ?? challenges.reduce((n, c) => n + c.completed, 0)}</strong><span class="small muted">天</span></div><div class="stat"><div class="label">连续学习</div><strong>${stats.streak ?? 0}</strong><span class="small muted">天</span></div><div class="stat"><div class="label">累计学习</div><strong>${stats.minutes ?? 0}</strong><span class="small muted">分钟</span></div><div class="stat"><div class="label">挑战完成率</div><strong>${stats.completionRate ?? 0}%</strong></div></div>` +
    (!items.length ? empty('你的第一个挑战，藏在收藏里', '导入自己的知乎收藏夹，或用 30 篇摄影演示数据体验完整流程。', '<div class="row center"><button class="primary" data-nav="import">导入收藏</button><button data-action="demo">体验摄影示例</button></div>') :
      `<div class="split"><div class="stack"><section class="panel feature"><div class="row between"><span class="pill">${lead ? '发现一个待开始的兴趣' : active ? '你的学习正在继续' : '让收藏产生行动'}</span><span class="small muted">${state.config.ai_available ? 'AI / 本地分析可选' : '本地规则模式'}</span></div><h2>${lead ? `${esc(lead.topic)}，要不要从今天开始？` : active ? esc(active.title) : '先看看，你收藏了哪些兴趣。'}</h2><p class="muted">${lead ? esc(lead.evidence) : active ? `已经完成 ${active.completed} / 14 天，每一次练习都算数。` : '分析收藏标题与摘要，发现聚集的学习主题，并生成第一份行动计划。'}</p><div class="steps-mini"><span><i>1</i>每天一篇精读</span><span><i>2</i>一项动手练习</span><span><i>3</i>一次作品复盘</span></div><div class="feature-bottom">${lead ? `<button class="primary" data-plan="${esc(lead.topic)}">生成 14 天${esc(lead.topic)}挑战</button>` : active ? `<button class="primary" data-challenge="${active.id}">继续今天的挑战</button>` : '<button class="primary" data-action="analyze">分析收藏并生成挑战</button>'}<span class="note">${lead ? '你可以先标记下方主题的学习状态' : '每天只需 10–30 分钟'}</span></div></section>${candidates.length ? `<section class="panel"><div class="section-head"><h2>你一直想学的事</h2><span class="small muted">推测结果，可随时修正</span></div>${candidates.slice(0, 4).map(i => `<div class="theme-row"><div class="row between"><div><h3>${esc(i.topic)} <span class="pill gray">${i.count} 篇</span></h3><p class="small muted">${esc(i.evidence)}</p></div><button class="text" data-plan="${esc(i.topic)}">开始挑战</button></div><div class="row mt"><label class="small muted">我的学习状态 <select data-topic-state="${esc(i.topic)}">${[['unknown', '尚未确认'], ['not_started', '确实还没开始'], ['started', '已经在学'], ['ignore', '暂时不学']].map(([v, n]) => `<option value="${v}" ${i.state === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div></div>`).join('')}</section>` : ''}</div><section class="panel"><div class="section-head"><h2>收藏主题</h2><button class="text small" data-nav="library">查看全部</button></div>${insights.length ? insights.map(i => `<div class="theme-row"><div class="row between"><strong>${esc(i.topic)}</strong><span class="small muted">${i.count} 篇</span></div><progress class="w-full" max="${items.length}" value="${i.count}" aria-label="${esc(i.topic)}占收藏总数的比例"></progress><p class="small muted">${i.active ? '已有挑战' : i.state === 'started' ? '已在学习' : i.state === 'ignore' ? '暂时不学' : '收藏中'}</p>${!i.active && state.config.topics.includes(i.topic) ? topicStateSelect(i) : ''}</div>`).join('') : '<p class="muted">收藏已导入，点击分析开始分类。</p>'}<button class="w-full mt" data-action="analyze">重新分析与分类</button></section></div>`);
}
function importView() {
  return pageHeader('把知乎收藏带进来', '由你选择导入内容，原始收藏夹保持独立。') + `<div class="import-grid"><section class="panel stack"><h2><span class="number">1</span>从知乎导出收藏</h2><ol class="instructions"><li>在 Chrome / Edge 的扩展管理页，加载源码包内的 <b>extension</b> 文件夹。</li><li>登录知乎，打开你自己的某个收藏夹详情页。</li><li>点击「拾知收藏导出」，确认授权，采集当前已加载条目。</li><li>手动翻页或滚动加载后再次采集，最后导出 JSON 文件。</li></ol><div class="notice">扩展读取已加载的收藏条目，不需要复制 Cookie 或知乎密码。每次只采集你主动打开的页面；未加载条目需要继续翻页采集。</div><button data-action="demo">先体验 30 篇摄影演示数据</button></section><section class="panel stack"><h2><span class="number">2</span>预览并授权导入</h2><label class="drop">选择扩展导出的 JSON 文件<input type="file" id="import-file" accept=".json,application/json"><span class="small">最多 1000 条 / 次，3 MB 以内</span></label><details><summary>或粘贴收藏 JSON</summary><textarea class="code mt" id="import-json" aria-label="收藏 JSON" placeholder='{"items":[{"title":"文章标题","url":"知乎原文链接","excerpt":"摘要"}]}'></textarea><button class="mt" id="parse-json">预览数据</button></details><div id="import-preview" class="notice">请选择文件或粘贴 JSON，导入前会显示条目预览。</div><label class="check"><input type="checkbox" id="import-consent">我确认这是自己的收藏，允许拾知保存所选标题、摘要、作者、原文链接及收藏时间。AI 服务传输另行授权。</label><button class="primary" id="confirm-import" disabled>确认导入</button></section></div>`;
}
function bindImport() {
  state.importRows = [];
  const parse = text => {
    state.importRows = []; $('#confirm-import').disabled = true;
    const raw = JSON.parse(text); const rows = Array.isArray(raw) ? raw : raw.items;
    if (!Array.isArray(rows) || !rows.length || rows.length > 1000) throw new Error('需要包含 1–1000 条收藏的 items 数组');
    if (rows.some(x => !x || typeof x.title !== 'string' || typeof x.url !== 'string')) throw new Error('每条收藏需要 title 和 url');
    state.importRows = rows;
    $('#import-preview').innerHTML = `<strong>共 ${rows.length} 条收藏</strong><p class="small">${rows.slice(0, 5).map(x => esc(x.title)).join('<br>')}${rows.length > 5 ? '<br>…' : ''}</p>`; $('#confirm-import').disabled = false;
  };
  $('#import-file').onchange = e => perform(null, async () => { const f = e.target.files[0]; if (!f) return; if (f.size > 3 * 1024 * 1024) throw new Error('文件不能超过 3 MB'); parse(await f.text()); });
  $('#parse-json').onclick = e => perform(e.target, async () => parse($('#import-json').value));
  $('#confirm-import').onclick = e => perform(e.target, async () => {
    if (!$('#import-consent').checked) throw new Error('请先勾选收藏导入授权');
    const r = await api('/import', { consent: true, items: state.importRows, source: 'user-export' });
    await refresh(); state.route = 'library'; render(); toast(`已导入 ${r.imported} 条，跳过重复 ${r.duplicates} 条`);
  });
}
function library() {
  const items = state.data.items.filter(x => (!state.topicFilter || x.topic === state.topicFilter) && (!state.search || `${x.title} ${x.excerpt}`.toLowerCase().includes(state.search.toLowerCase())));
  return pageHeader('我的收藏', `${state.data.items.length} 篇内容，给每份好奇一个去处。`, '<div class="row"><button data-nav="import">＋ 导入收藏</button><button class="primary" data-action="analyze">分析收藏并生成挑战</button></div>') +
    (!state.data.items.length ? empty('收藏夹还是空的', '先从知乎导入自己的收藏，或体验示例。', '<button class="primary" data-nav="import">导入收藏</button>') : `<section class="panel"><div class="toolbar"><input id="search-items" aria-label="搜索收藏" placeholder="搜索标题或摘要" value="${esc(state.search)}"><select id="filter-topic" aria-label="筛选主题"><option value="">全部主题</option>${options([...new Set(state.data.items.map(x => x.topic))], state.topicFilter)}</select><span class="small muted">${items.length} 篇</span></div><div class="item-list">${items.slice(0, 100).map(i => `<article class="item-row"><div><h3>${demo(i) ? esc(i.title) : `<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">${esc(i.title)} ↗</a>`}</h3><div class="meta">${esc(i.author || '作者未知')} · ${esc(i.collection)} · ${esc(i.engine)} · ${i.saved_at ? `收藏于 ${niceDate(i.saved_at)}` : '原收藏日期未知'}</div><p>${esc(i.excerpt.slice(0, 180))}</p></div><select data-item-topic="${i.id}" aria-label="修改 ${esc(i.title)} 的分类">${options([...state.config.topics, '其他', '未分类'], i.topic)}</select></article>`).join('') || '<p class="muted">没有匹配的收藏。</p>'}${items.length > 100 ? '<p class="notice mt">当前显示前 100 条，请使用搜索或主题筛选缩小范围。分析仍处理全部收藏。</p>' : ''}</div></section>`);
}
function bindLibrary() {
  $('#filter-topic')?.addEventListener('change', e => { state.topicFilter = e.target.value; renderView(); });
  let timer;
  $('#search-items')?.addEventListener('input', e => { clearTimeout(timer); const value = e.target.value; timer = setTimeout(() => { state.search = value; renderView(); const input = $('#search-items'); input?.focus(); input?.setSelectionRange(value.length, value.length); }, 250); });
}
function challenges() {
  const list = state.data.challenges;
  if (!list.length) return pageHeader('14 天挑战', '把一个兴趣，拆成每天都能完成的小步骤。') + empty('你的第一份行动计划还没开始', '完成收藏分类后，系统可自动为最集中的待学主题生成 14 天挑战。', '<button class="primary" data-action="analyze">分析收藏并生成挑战</button>');
  const c = list.find(x => x.id === state.challenge) || list[0]; state.challenge = c.id;
  const day = c.days[state.day - 1]; const k = c.checkins.find(x => x.day === state.day); const locked = c.paused || new Date(`${c.start_date}T12:00:00Z`).getTime() + (state.day - 1) * 86400000 > new Date(`${c.today}T12:00:00Z`).getTime();
  return pageHeader(esc(c.title), `每天 ${c.minutes} 分钟 · ${niceDate(c.start_date)} 开始 · ${esc(c.engine)}生成`, `<div class="row"><span class="pill green">已完成 ${c.completed} / 14 天</span><button data-action="pause-challenge" data-challenge-id="${c.id}">${c.paused ? '恢复挑战' : '暂停挑战'}</button></div>`) +
    `<div class="challenge-nav">${list.map(x => `<button data-challenge="${x.id}" class="${x.id === c.id ? 'active' : ''}">${esc(x.topic)} · ${x.completed}/14</button>`).join('')}</div><div class="challenge-layout"><aside class="panel calendar"><div class="row between"><h3>学习日历</h3><span class="small muted">14 DAYS</span></div><progress class="w-full" value="${c.completed}" max="14" aria-label="挑战完成进度"></progress><div class="calendar-list">${c.days.map(d => `<button class="day-button ${d.day === state.day ? 'active' : ''} ${done(c.checkins.find(k => k.day === d.day)) ? 'done' : ''}" data-day="${d.day}" aria-label="第 ${d.day} 天 ${esc(d.title)}"><span class="daynum">${done(c.checkins.find(k => k.day === d.day)) ? '✓ ' : ''}${String(d.day).padStart(2, '0')}</span><span class="daytitle">${esc(d.title)}</span></button>`).join('')}</div></aside><article class="panel"><div class="daily-head"><div class="row between"><span class="eyebrow">DAY ${String(state.day).padStart(2, '0')} / 14</span><span class="pill ${done(k) ? 'green' : 'gray'}">${done(k) ? '已完成' : locked ? '可预览' : '待完成'}</span></div><h2>${esc(day.title)}</h2></div><div class="task"><span class="task-index">01</span><div class="row between"><h3>一篇精读</h3><span class="small muted">${day.read_minutes} 分钟</span></div><p>${esc(day.read_task)}</p>${demo(day.reading) ? '<div class="notice">演示资料，仅用于体验流程。真实精读请导入自己的知乎文章。</div>' : `<a class="reading-link" href="${esc(day.reading.url)}" target="_blank" rel="noopener noreferrer">知乎 · ${esc(day.reading.title)} ↗<br><span class="muted">${esc(day.reading.author || '前往原文阅读')}</span></a>`}</div><div class="task"><span class="task-index">02</span><div class="row between"><h3>一项练习</h3><span class="small muted">${day.practice_minutes} 分钟</span></div><p>${esc(day.practice)}</p></div><div class="task"><span class="task-index">03</span><div class="row between"><h3>一次作品复盘</h3><span class="small muted">${day.review_minutes} 分钟</span></div><p>${esc(day.review)}</p></div><form id="checkin-form" class="checkin-form"><h3>记录今天的行动</h3><div class="row mb"><label class="check"><input name="read_done" type="checkbox" ${checked(k?.read_done)} ${locked ? 'disabled' : ''}>精读完成</label><label class="check"><input name="practice_done" type="checkbox" ${checked(k?.practice_done)} ${locked ? 'disabled' : ''}>练习完成</label><label class="check"><input name="review_done" type="checkbox" ${checked(k?.review_done)} ${locked ? 'disabled' : ''}>复盘完成</label></div><label class="field">今天的作品与收获<textarea name="reflection" maxlength="3000" ${locked ? 'disabled' : ''} placeholder="写下一个进步、一个问题、下一次的具体改进。完成复盘需至少 3 个字。">${esc(k?.reflection || '')}</textarea></label><div class="two-fields mt"><label class="field">上传作品（可选）<input id="artifact" type="file" accept="image/png,image/jpeg,image/webp" ${locked ? 'disabled' : ''}><span class="small muted">PNG / JPEG / WebP，2 MB 以内</span></label><div><label class="check"><input name="shared" type="checkbox" ${checked(k?.shared)} ${locked ? 'disabled' : ''}>向已接受的学习搭子展示本条打卡、复盘和作品</label>${k?.has_artifact ? '<label class="check mt"><input name="remove_artifact" type="checkbox">移除已保存的作品图片</label>' : ''}</div></div><div id="artifact-preview"></div><div class="row between mt"><span class="small muted">${locked ? '到当天再打卡，之前的学习日可以补记。' : k ? `上次保存：${niceDate(k.updated_at)}` : '可先保存进度，三项全部完成才计为完成一天。'}</span><button class="primary" type="submit" ${locked ? 'disabled' : ''}>保存今日打卡</button></div>${k ? `<button type="button" class="text mt" data-check="${k.id}">查看作品与搭子反馈</button>` : ''}</form></article></div>`;
}
function bindCheckin() {
  const form = $('#checkin-form'); if (!form) return;
  let artifact = '';
  $('#artifact').onchange = e => perform(null, async () => {
    artifact = ''; $('#artifact-preview').innerHTML = '';
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { e.target.value = ''; throw new Error('作品需为 2 MB 以内的 PNG、JPEG 或 WebP'); }
    artifact = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    $('#artifact-preview').innerHTML = `<img class="work-preview" src="${artifact}" alt="待上传作品预览">`;
  });
  form.onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => {
    const f = new FormData(form); await api('/checkin', { challenge_id: state.challenge, day: state.day, reflection: f.get('reflection'), artifact, ...Object.fromEntries(['read_done', 'practice_done', 'review_done', 'shared', 'remove_artifact'].map(k => [k, f.get(k) === 'on'])) });
    await refresh();
    const current = state.data.challenges.find(x => x.id === state.challenge);
    const todayDay = current ? challengeDay(current) : 0;
    const todayCheckin = current?.checkins.find(x => x.day === todayDay);
    if (current && state.day === todayDay && done(todayCheckin)) {
      state.pendingCompletion = { challengeId: current.id, date: current.today };
    }
    render(); toast('今日进度已保存');
  }); };
}
function settings() {
  const u = state.user;
  return pageHeader('设置与授权', '决定自己的学习节奏，以及哪些信息可以被使用。') + `<div class="settings stack"><form id="profile-form" class="panel fields"><h2>学习偏好</h2><label class="field">昵称<input name="nickname" value="${esc(u.nickname)}" required maxlength="30"></label><div class="two-fields"><label class="field">想与搭子共同学习的主题<select name="topic">${options(state.config.topics, u.topic)}</select></label><label class="field">当前阶段<select name="level">${options(['入门', '进阶'], u.level)}</select></label><label class="field">通常学习时段<select name="slot">${options(['早上', '下午', '晚上'], u.slot)}</select></label><label class="field">学习时区<select name="timezone">${options(['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'], u.timezone)}</select></label></div><label class="check"><input name="discoverable" type="checkbox" ${checked(u.discoverable)}>参与学习搭子匹配，公开昵称、学习主题、阶段和时段。双方接受邀请后才能互看主动共享的打卡。</label><hr class="divider"><h2>AI 分析授权</h2><div class="notice">${state.config.ai_available ? `已配置服务：${esc(state.config.ai_provider)}。启用后可按次选择 AI 分析。` : '尚未配置 AI 服务。你可以使用本地规则分类和课程模板，开发者配置密钥后即可启用大模型。'}</div><label class="check"><input name="ai_consent" type="checkbox" ${checked(u.ai_consent)}>允许将收藏标题、摘要、收藏夹名称和随机资料 ID 发送给上述 AI 服务，用于分类和生成计划。不会发送知乎密码、Cookie 或作品图片。</label><button class="primary" type="submit">保存设置</button></form><section class="panel stack"><h2>导入记录与撤回</h2><p class="small muted">撤回后删除本应用的收藏、挑战、打卡、作品及搭子关系，并关闭 AI 授权。你的知乎收藏夹不受影响。</p><div>${state.data.consents.slice(0, 5).map(c => `<p class="small muted">${niceDate(c.created_at)} · ${c.source === 'demo' ? '演示数据' : '用户授权导入'}</p>`).join('') || '<p class="small muted">尚无导入记录</p>'}</div><button class="danger" data-action="clear-data">撤回授权并清除学习数据</button><button data-action="logout">退出当前账号</button></section></div>`;
}
function bindSettings() {
  $('#profile-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { const f = new FormData(e.target); const r = await api('/profile', { ...Object.fromEntries(f), discoverable: f.get('discoverable') === 'on', ai_consent: f.get('ai_consent') === 'on' }); state.user = r.user; render(); toast('学习偏好与授权已保存'); }); };
}
async function loadBuddies() {
  const b = await api('/buddies'); if (state.route !== 'buddies') return;
  const pending = b.requests.filter(r => r.status === 'pending'); const accepted = b.requests.filter(r => r.status === 'accepted');
  $('#view').innerHTML = pageHeader('找一个，一起坚持的人。', `${esc(state.user.topic)} · ${esc(state.user.level)} · ${esc(state.user.slot)}学习`, '<button data-nav="settings">调整匹配偏好</button>') +
    (!state.user.discoverable ? '<div class="notice mb">尚未开启搭子匹配。前往设置，确认公开学习偏好后即可寻找相同主题的学习者。</div>' : '') +
    `<div class="stack">${pending.length ? `<section class="panel"><h2>搭子邀请</h2>${pending.map(r => `<div class="request row between"><div><strong>${esc(r.sender === state.user.id ? r.recipient_name : r.sender_name)}</strong><p class="small muted">${r.sender === state.user.id ? '等待对方接受邀请' : '想和你一起学习'}</p></div><div class="row">${r.recipient === state.user.id ? `<button class="primary" data-respond="${r.id}" data-status="accepted">接受邀请</button><button data-respond="${r.id}" data-status="declined">婉拒</button>` : `<button data-respond="${r.id}" data-status="ended">取消邀请</button>`}</div></div>`).join('')}</section>` : ''}<section><div class="section-head"><h2>同路的学习者</h2><span class="small muted">按主题、阶段与学习时段匹配</span></div>${b.candidates.length ? `<div class="buddy-grid">${b.candidates.map(p => `<article class="panel buddy-card"><div class="row"><span class="avatar">${esc(p.nickname.slice(0, 1))}</span><div><h3>${esc(p.nickname)}</h3><span class="small muted">偏好匹配 ${p.score}%</span></div></div><p>${esc(p.topic)} · ${esc(p.level)} · ${esc(p.slot)}</p><button class="primary" data-invite="${p.id}">邀请一起学习</button></article>`).join('')}</div>` : empty('还没有合适的搭子', '匹配池只展示同一服务器中主动参与的真实账号。可以邀请朋友注册，再选择相同的学习主题。')}</section>${accepted.length ? `<section class="panel"><h2>我的学习搭子</h2>${accepted.map(r => `<div class="request row between"><strong>${esc(r.sender === state.user.id ? r.recipient_name : r.sender_name)}</strong><div class="row"><span class="pill green">互相监督中</span><button class="text" data-respond="${r.id}" data-status="ended">结束关系</button><button class="text" data-respond="${r.id}" data-status="blocked">屏蔽</button></div></div>`).join('')}</section>` : ''}<section class="panel"><div class="section-head"><h2>搭子的学习动态</h2><button class="text" data-action="refresh-buddies">刷新动态</button></div>${b.feed.length ? b.feed.map(k => `<article class="feedback"><div class="row between"><strong>${esc(k.nickname)}</strong><span class="small muted">${esc(k.topic)} · 第 ${k.day} 天 · ${niceDate(k.updated_at)}</span></div><p class="mt">${esc(k.reflection)}</p><div class="row between mt"><span class="pill ${done(k) ? 'green' : 'gray'}">${done(k) ? '三项任务已完成' : '已保存学习进度'}</span><button class="text" data-check="${k.id}" data-peer="true">${k.has_artifact ? '查看作品与互评' : '给 TA 一点反馈'}</button></div></article>`).join('') : '<p class="muted">搭子接受邀请并主动共享打卡后，这里会出现学习进展。</p>'}</section></div>`;
}
function engineField() { return `<label class="field">生成方式<select name="engine"><option value="local">本地规则与课程模板（无需密钥）</option><option value="ai" ${!state.config.ai_available || !state.user.ai_consent ? 'disabled' : ''}>AI 分类与个性化计划${!state.config.ai_available ? '（未配置）' : !state.user.ai_consent ? '（尚未授权）' : ''}</option></select></label>`; }
function openAnalysis() {
  if (!state.data.items.length) { state.route = 'import'; render(); toast('先导入收藏，再开始分析'); return; }
  modal(`<h2>发现收藏里的学习方向</h2><form id="analyze-form" class="fields">${engineField()}<label class="field">每天学习时间<select name="minutes">${options(['10', '15', '20', '30', '45'], '15')}</select><span class="small muted">单位：分钟</span></label><label class="check"><input name="auto" type="checkbox" checked>分类完成后，自动为收藏最集中的待学主题生成 14 天挑战，从今天开始。</label><p class="notice">收藏数量表示兴趣线索，不能证明你从未学过。已开始的主题可在学习总览中标记。重新分析会覆盖手动分类。</p><button type="submit" class="primary">开始分析</button><p id="analysis-progress" class="small muted" aria-live="polite"></p></form>`);
  $('#analyze-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => {
    const f = new FormData(e.target); const engine = f.get('engine'); $('#analysis-progress').textContent = '正在分析收藏；大量资料使用 AI 时需要几分钟，请保持页面打开。';
    await api('/analyze', { engine }); await refresh();
    const lead = state.data.insights.find(x => x.candidate);
    if (f.get('auto') === 'on' && lead) {
      $('#analysis-progress').textContent = `已发现${lead.topic}主题，正在生成完整 14 天计划…`;
      const r = await api('/challenges', { topic: lead.topic, engine, minutes: Number(f.get('minutes')) }); state.challenge = r.id; state.day = 1; state.route = 'challenges'; await refresh();
    } else state.route = 'overview';
    closeModal(); render(); toast('分类完成，学习方向已经整理好');
  }); };
}
function openPlan(topic) {
  modal(`<h2>开始 14 天${esc(topic)}挑战</h2><form id="plan-form" class="fields">${engineField()}<label class="field">每天投入时间<select name="minutes">${options(['10', '15', '20', '30', '45'], '15')}</select><span class="small muted">单位：分钟，从今天起连续安排 14 天</span></label><p class="notice">每天提供一篇精读、一项练习、一次复盘。资料少于 14 篇时，会安排带着新问题重读。</p><button class="primary" type="submit">生成并开始挑战</button></form>`);
  $('#plan-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { const f = new FormData(e.target); const r = await api('/challenges', { topic, engine: f.get('engine'), minutes: Number(f.get('minutes')) }); state.challenge = r.id; state.day = 1; await refresh(); state.route = 'challenges'; closeModal(); render(); }); };
}
async function showCheck(checkId, peer) {
  const { checkin: k, feedback } = await api(`/checkin?id=${encodeURIComponent(checkId)}`);
  modal(`<h2>${esc(k.topic)} · 第 ${k.day} 天复盘</h2><p class="prewrap">${esc(k.reflection || '尚未填写复盘')}</p>${k.artifact ? `<img class="work-preview" src="${esc(k.artifact)}" alt="学习作品">` : ''}<hr class="divider"><h3>搭子的反馈</h3><div class="mt">${feedback.map(f => `<div class="feedback"><strong>${esc(f.nickname)}</strong><p>${esc(f.body)}</p><span class="small muted">${niceDate(f.created_at)}</span></div>`).join('') || '<p class="muted">还没有反馈。</p>'}</div>${peer ? '<form id="feedback-form" class="fields mt"><label class="field">写一条具体的建议<textarea name="body" required minlength="2" maxlength="1000" placeholder="哪里做得好？下一次可以怎样改进？"></textarea></label><button class="primary" type="submit">发送反馈</button></form>' : ''}`);
  $('#feedback-form')?.addEventListener('submit', e => { e.preventDefault(); perform(e.submitter, async () => { await api('/feedback', { checkin_id: checkId, body: new FormData(e.target).get('body') }); await showCheck(checkId, true); toast('反馈已发送'); }); });
}
const PHOTO_TITLES = ['摄影入门：如何开始观察', '手机拍照的基本构图', '自然光摄影练习', '曝光补偿与明暗', '光圈与景深', '快门与运动模糊', '摄影第一周作品复盘', '构图中的引导线', '照片色彩与配色', '环境人像练习', '街拍中的细节叙事', '修图与后期入门', '摄影主题组照', '摄影作品的自我评价', '相机焦距与视角', '摄影三分法构图', '窗边人像摄影', '相机测光模式', '摄影背景简化', '长曝光摄影', '手机摄影的留白', '建筑摄影构图', '黑白摄影入门', '摄影白平衡练习', '人像摄影与沟通', '纪实摄影观察', '照片裁切与修图', '摄影照片筛选', '摄影视觉风格', '摄影学习的日常练习'];
function openDemo() {
  modal('<h2>体验 30 篇摄影收藏</h2><div class="fields"><p>这些是人工编写的演示标题和摘要，用来体验分类、14 天挑战和打卡，并非真实知乎文章。</p><label class="check"><input id="demo-consent" type="checkbox">同意把演示数据保存到当前拾知账号</label><button id="load-demo" class="primary">载入演示数据</button></div>');
  $('#load-demo').onclick = e => perform(e.target, async () => { if (!$('#demo-consent').checked) throw new Error('请先确认载入演示数据');
    const items = PHOTO_TITLES.map((title, i) => ({ title: `[演示] ${title}`, url: `https://zhuanlan.zhihu.com/p/${900000000000000000n + BigInt(i)}`, excerpt: `摄影学习演示材料：${title}。仅用于测试分类和挑战生成，不提供真实文章正文。`, author: '拾知演示', collection: '摄影 · 演示数据', saved_at: new Date(Date.now() - (90 + i * 2) * 86400000).toISOString() }));
    const r = await api('/import', { consent: true, source: 'demo', items }); await refresh(); closeModal(); state.route = 'library'; render(); toast(`已载入 ${r.imported} 条演示收藏，点击分析生成挑战`);
  });
}

document.addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn || btn.disabled) return;
  if (btn.dataset.nav) { state.route = btn.dataset.nav; render(); return; }
  if (btn.dataset.plan) { openPlan(btn.dataset.plan); return; }
  if (btn.dataset.challenge) { state.challenge = btn.dataset.challenge; state.day = 1; state.route = 'challenges'; render(); return; }
  if (btn.dataset.day) { state.day = Number(btn.dataset.day); renderView(); return; }
  if (btn.dataset.check) { perform(btn, () => showCheck(btn.dataset.check, btn.dataset.peer === 'true')); return; }
  if (btn.dataset.invite) { perform(btn, async () => { await api('/buddy-request', { recipient: btn.dataset.invite }); await loadBuddies(); toast('邀请已发送，等待对方接受'); }); return; }
  if (btn.dataset.respond) { perform(btn, async () => { await api('/buddy-respond', { id: btn.dataset.respond, status: btn.dataset.status }); await loadBuddies(); toast('搭子关系已更新'); }); return; }
  const action = btn.dataset.action;
  if (action === 'analyze') openAnalysis();
  if (action === 'demo') openDemo();
  if (action === 'refresh-buddies') perform(btn, loadBuddies);
  if (action === 'export-data') perform(btn, async () => { const data = await api('/export', undefined, 'GET'); const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `shizhi-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url); toast('学习数据已导出'); });
  if (action === 'pause-challenge') perform(btn, async () => { const shouldPause = btn.textContent.includes('暂停'); await api('/challenge-pause', { challenge_id: btn.dataset.challengeId, paused: shouldPause }); await refresh(); render(); toast(shouldPause ? '挑战已暂停' : '挑战已恢复'); });
  if (action === 'enable-reminders') perform(btn, async () => { if (!('Notification' in window)) throw new Error('当前浏览器不支持通知'); const permission = await Notification.requestPermission(); if (permission !== 'granted') throw new Error('你未允许浏览器通知'); localStorage.setItem('shizhi-reminders', 'on'); toast('已开启今日学习提醒'); });
  if (action === 'logout') perform(btn, async () => { await api('/logout', {}); state.user = null; state.authMode = 'login'; renderAuth(); });
  if (action === 'clear-data') {
    modal('<h2>撤回授权并清除学习数据</h2><form id="clear-form" class="fields"><p>将清除当前账号在拾知中的收藏、计划、打卡、作品、反馈和搭子关系。此操作不可撤销，知乎收藏不受影响。</p><label class="field">请输入「清除学习数据」<input name="confirm" required autocomplete="off"></label><button class="danger" type="submit">确认清除</button></form>');
    $('#clear-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { await api('/data', { confirm: new FormData(e.target).get('confirm') }, 'DELETE'); state.user = (await api('/me')).user; await refresh(); closeModal(); state.route = 'overview'; render(); toast('学习数据已清除，授权已撤回'); }); };
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.topicState) perform(null, async () => { await api('/topic-state', { topic: e.target.dataset.topicState, state: e.target.value }); await refresh(); renderView(); });
  if (e.target.dataset.itemTopic) perform(null, async () => { await api('/item-topic', { id: e.target.dataset.itemTopic, topic: e.target.value }); await refresh(); renderView(); });
});

try { state.config = await api('/config'); try { state.user = (await api('/me')).user; await refresh(); } catch { state.user = null; } render(); }
catch (error) { $('#app').innerHTML = `<div class="empty"><h1>暂时无法连接拾知</h1><p>${esc(error.message)}</p><p>确认服务已启动后刷新页面。</p></div>`; }

function challengeDay(c) {
  const start = new Date(`${c.start_date}T12:00:00Z`).getTime();
  const today = new Date(`${c.today}T12:00:00Z`).getTime();
  return Math.min(14, Math.max(1, Math.floor((today - start) / 86400000) + 1));
}
function mascotForTime(hour, completedToday, remaining) {
  if (completedToday) return ['happy', '开心'];
  if (hour < 11) return ['worried', '烦恼'];
  if (hour < 16) return ['angry', '伤心'];
  if (remaining > 7) return ['furious', '赌气'];
  return ['worried', '烦恼'];
}
function showCompletionPopup() {
  document.querySelector('.completion-popup')?.remove();
  const popup = document.createElement('aside');
  popup.className = 'completion-popup';
  popup.setAttribute('role', 'status');
  popup.innerHTML = `<button type="button" class="completion-close" aria-label="关闭提示">×</button><img src="/mascots/mascot-happy.png" alt="开心的拾知吉祥物"><div><strong>今天的学习任务完成啦，继续保持！</strong><p>一步一步积累，你正在成为更好的自己。</p></div>`;
  popup.querySelector('.completion-close').onclick = () => popup.remove();
  document.body.appendChild(popup);
  window.setTimeout(() => popup.remove(), 8000);
}
function openMascotCard(c, todayDay, checkin, taskCount) {
  const labels = [['read_done', '精读'], ['practice_done', '练习'], ['review_done', '复盘']];
  const rows = labels.map(([key, label]) => `<div class="mascot-task-row"><span class="task-dot ${checkin?.[key] ? 'done' : ''}">${checkin?.[key] ? '✓' : ''}</span>${label}</div>`).join('');
  modal(`<div class="mascot-card"><div class="row between"><div><p class="eyebrow">今日学习进度</p><h2>${esc(c.topic)} · 第 ${todayDay} 天</h2></div><span class="pill ${taskCount === 3 ? 'green' : 'gray'}">${taskCount} / 3</span></div><div class="mascot-task-list mt">${rows}</div><p class="small muted mt">${taskCount === 3 ? '今天的任务全部完成，继续保持！' : '完成三项任务后，吉祥物会为你庆祝。'}</p><button class="primary w-full mt" id="open-today-challenge">查看今日挑战</button></div>`);
  $('#open-today-challenge').onclick = () => { closeModal(); state.route = 'challenges'; state.challenge = c.id; state.day = todayDay; render(); };
}
function renderMobileWidget(){
  document.querySelector('.mobile-widget')?.remove();
  if (!state.user || !state.data) return;
  const c=state.data?.challenges?.find(x => x.id === state.challenge) || state.data?.challenges?.[0]; if(!c)return;
  const todayDay = challengeDay(c);
  const todayCheckin = c.checkins.find(x => x.day === todayDay);
  const completedToday = done(todayCheckin);
  const remaining = Math.max(0, 14 - (c.completed || 0));
  const taskCount = [todayCheckin?.read_done, todayCheckin?.practice_done, todayCheckin?.review_done].filter(Boolean).length;
  const [mascot, mood] = mascotForTime(new Date().getHours(), completedToday, remaining);
  const el=document.createElement('button');
  el.className='mobile-widget';
  el.type='button';
  el.title='拖动吉祥物，或点击查看今日挑战';
  el.setAttribute('aria-label', `14 天挑战还差 ${remaining} 天完成`);
  el.innerHTML=`<span class="mascot-3d mascot-${mascot}" role="img" aria-label="${mood}的拾知吉祥物"><span class="mascot-model"><img src="/mascots/mascot-${mascot}.png" alt=""></span><span class="mascot-model-side"></span><span class="mascot-shadow"></span></span><span class="task-badge" aria-label="今日已完成 ${taskCount} 项任务">${taskCount}/3</span><span class="days-badge" aria-hidden="true">${remaining}</span>`;
  const saved = state.mascotPosition || (() => { try { return JSON.parse(localStorage.getItem('shizhi-mascot-position') || 'null'); } catch { return null; } })();
  state.mascotPosition = saved;
  const initialX = saved?.x ?? Math.max(12, window.innerWidth - 108);
  const initialY = saved?.y ?? Math.max(12, window.innerHeight - 116);
  el.style.left = `${Math.min(Math.max(8, initialX), Math.max(8, window.innerWidth - 92))}px`;
  el.style.top = `${Math.min(Math.max(8, initialY), Math.max(8, window.innerHeight - 92))}px`;
  el.style.right = 'auto'; el.style.bottom = 'auto';
  let dragging = false; let moved = false; let offsetX = 0; let offsetY = 0;
  el.onpointerdown = e => { dragging = true; moved = false; el.classList.add('is-dragging'); el.setPointerCapture?.(e.pointerId); offsetX = e.clientX - el.offsetLeft; offsetY = e.clientY - el.offsetTop; e.preventDefault(); };
  el.onpointermove = e => {
    if (!dragging) return;
    const x = Math.min(Math.max(8, e.clientX - offsetX), Math.max(8, window.innerWidth - el.offsetWidth - 8));
    const y = Math.min(Math.max(8, e.clientY - offsetY), Math.max(8, window.innerHeight - el.offsetHeight - 8));
    if (Math.abs(x - el.offsetLeft) > 2 || Math.abs(y - el.offsetTop) > 2) moved = true;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
  };
  el.onpointerup = e => { if (!dragging) return; dragging = false; el.classList.remove('is-dragging'); el.releasePointerCapture?.(e.pointerId); if (moved) { state.mascotPosition = { x: el.offsetLeft, y: el.offsetTop }; try { localStorage.setItem('shizhi-mascot-position', JSON.stringify(state.mascotPosition)); } catch {} } };
  el.onclick=()=>{ if (moved) { moved = false; return; } openMascotCard(c, todayDay, todayCheckin, taskCount); };
  document.body.appendChild(el);
  startMascotIdle();
  if (state.pendingCompletion?.challengeId === c.id && state.pendingCompletion.date === c.today) {
    state.pendingCompletion = null;
    showCompletionPopup();
  }
}
let mascotIdleTimer = null;
function startMascotIdle() {
  if (mascotIdleTimer) return;
  mascotIdleTimer = window.setInterval(() => {
    const el = document.querySelector('.mobile-widget');
    if (!el || el.classList.contains('is-dragging') || document.hidden) return;
    el.classList.add('is-turning');
    window.setTimeout(() => el.isConnected && el.classList.remove('is-turning'), 1400);
  }, 22000);
}
const originalRender=render; render=()=>{originalRender();renderMobileWidget();};
// Refresh the companion periodically so its time-based expression stays current.
window.setInterval(renderMobileWidget, 60 * 1000);
window.setInterval(() => {
  const c = state.data?.challenges?.[0];
  if (!c || c.paused || !('Notification' in window) || Notification.permission !== 'granted' || localStorage.getItem('shizhi-reminders') !== 'on') return;
  const day = challengeDay(c); const checkin = c.checkins.find(x => x.day === day); if (done(checkin)) return;
  const key = `shizhi-reminder-${c.id}-${c.today}`; if (localStorage.getItem(key)) return;
  if (new Date().getHours() < 19) return;
  new Notification('拾知提醒', { body: `今天还有 ${3 - [checkin?.read_done, checkin?.practice_done, checkin?.review_done].filter(Boolean).length} 项任务，花一点时间完成它吧。` }); localStorage.setItem(key, '1');
}, 60 * 1000);








