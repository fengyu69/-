import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { openDB, transaction } from './lib/db.mjs';
import { AppError, ensure, short, normalizeItems, insights, classifyLocal, classifyAI, buildLocalPlan, generateAIPlan, localDate, dayDate, TOPICS } from './lib/learning.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const hash = s => createHash('sha256').update(s).digest('hex');
const derive = promisify(scrypt);
const now = () => new Date().toISOString();
const id = randomUUID;
const safeUser = u => { const { password, ...rest } = u; return rest; };

export function createApp(options = {}) {
  const config = { origin: process.env.APP_ORIGIN || 'http://127.0.0.1:8787', secure: process.env.COOKIE_SECURE === 'true',
    aiKey: process.env.AI_API_KEY || '', aiBase: process.env.AI_BASE_URL || 'https://api.deepseek.com', aiModel: process.env.AI_MODEL || 'deepseek-flash', ...options };
  const db = openDB(options.dbPath || process.env.DB_PATH || join(root, 'data', 'learning.sqlite'));
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const rates = new Map(); const busy = new Set();
  function rate(key, max, windowMs) {
    const time = Date.now();
    for (const [k, v] of rates) if (v.until < time) rates.delete(k);
    const r = rates.get(key) || { count: 0, until: time + windowMs };
    r.count++; rates.set(key, r); ensure(r.count <= max, '操作过于频繁，请稍后重试', 429);
  }
  function authenticate(req) {
    const token = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie || '')?.[1];
    ensure(token, '请先登录', 401);
    const s = one('SELECT * FROM sessions WHERE token=? AND expires>?', hash(token), Date.now());
    ensure(s, '登录已过期，请重新登录', 401);
    return one('SELECT * FROM users WHERE id=?', s.user_id);
  }
  function session(res, user) {
    const token = randomBytes(32).toString('base64url');
    run('DELETE FROM sessions WHERE expires<?', Date.now());
    run('INSERT INTO sessions VALUES(?,?,?)', hash(token), user.id, Date.now() + 7 * 86400000);
    res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${config.secure ? '; Secure' : ''}`);
  }
  function itemsFor(user) { return all('SELECT * FROM items WHERE user_id=? ORDER BY imported_at DESC,id', user.id); }
  function challengesFor(user) {
    return all('SELECT * FROM challenges WHERE user_id=? ORDER BY created_at DESC', user.id).map(c => {
      const checks = all('SELECT id,day,read_done,practice_done,review_done,reflection,shared,updated_at,CASE WHEN artifact<>\'\' THEN 1 ELSE 0 END has_artifact FROM checkins WHERE challenge_id=? ORDER BY day', c.id);
      return { ...c, days: JSON.parse(c.days), checkins: checks, today: localDate(user.timezone),
        completed: checks.filter(x => x.read_done && x.practice_done && x.review_done).length };
    });
  }
  function learningStats(user, challenges) {
    const shiftDate = (start, offset) => new Date(Date.parse(`${start}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const completed = challenges.flatMap(c => c.checkins.filter(x => x.read_done && x.practice_done && x.review_done).map(x => ({ date: dayDate(c.start_date, x.day), minutes: c.minutes })));
    const dates = [...new Set(completed.map(x => x.date))].sort();
    const dateSet = new Set(dates); const today = localDate(user.timezone);
    let cursor = today; if (!dateSet.has(cursor)) cursor = shiftDate(cursor, -1);
    let streak = 0; while (dateSet.has(cursor)) { streak++; cursor = shiftDate(cursor, -1); }
    let longest = 0, run = 0, previous = '';
    for (const date of dates) { run = previous && shiftDate(previous, 1) === date ? run + 1 : 1; longest = Math.max(longest, run); previous = date; }
    const assigned = challenges.reduce((n, c) => n + 14, 0);
    return { completedDays: completed.length, streak, longestStreak: longest, minutes: completed.reduce((n, x) => n + x.minutes, 0), completionRate: assigned ? Math.round(completed.length / assigned * 100) : 0 };
  }
  function connected(a, b) { return one("SELECT id FROM buddy_requests WHERE status='accepted' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))", a, b, b, a); }
  async function body(req) {
    ensure((req.headers['content-type'] || '').startsWith('application/json'), '请使用 JSON 请求', 415);
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; ensure(size <= 3 * 1024 * 1024, '请求超过 3 MB 限制', 413); chunks.push(chunk); }
    try { const b = JSON.parse(Buffer.concat(chunks).toString()); ensure(b && !Array.isArray(b) && typeof b === 'object', '请求格式错误'); return b; }
    catch (e) { if (e instanceof AppError) throw e; throw new AppError('JSON 格式错误'); }
  }
  function send(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(req.url, config.origin); const path = url.pathname; const method = req.method;
      if (!path.startsWith('/api/')) {
        ensure(method === 'GET' || method === 'HEAD', '方法不允许', 405);
        const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'], '/mascot.jpg': ['mascot.jpg', 'image/jpeg'], '/mascot-icon.png': ['mascot-icon.png', 'image/png'], '/mascots/mascot-happy.png': ['mascots/mascot-happy.png', 'image/png'], '/mascots/mascot-worried.png': ['mascots/mascot-worried.png', 'image/png'], '/mascots/mascot-angry.png': ['mascots/mascot-angry.png', 'image/png'], '/mascots/mascot-furious.png': ['mascots/mascot-furious.png', 'image/png'] };
        const file = files[path]; ensure(file && existsSync(join(root, 'public', file[0])), '页面不存在', 404);
        res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(method === 'HEAD' ? undefined : readFileSync(join(root, 'public', file[0]))); return;
      }
      if (method !== 'GET') ensure(req.headers.origin === config.origin, '请求来源不被允许，请从应用页面操作', 403);
      if (path === '/api/health' && method === 'GET') return send(res, { ok: true });
      if (path === '/api/config' && method === 'GET') return send(res, { ai_available: Boolean(config.aiKey), ai_provider: new URL(config.aiBase).hostname, topics: Object.keys(TOPICS) });
      if (['/api/register', '/api/login'].includes(path) && method === 'POST') {
        rate(`auth:${req.socket.remoteAddress}`, 30, 15 * 60000);
        const b = await body(req); const username = short(b.username, 40).toLowerCase();
        ensure(/^[a-z0-9_-]{3,32}$/.test(username), '账号需为 3–32 位字母、数字、下划线或短横线');
        ensure(typeof b.password === 'string' && b.password.length >= 8 && b.password.length <= 128, '密码需为 8–128 位');
        let user = one('SELECT * FROM users WHERE username=?', username);
        if (path === '/api/register') {
          ensure(!user, '账号已存在', 409);
          const nickname = short(b.nickname, 30); ensure(nickname, '请填写昵称');
          const salt = randomBytes(16).toString('hex');
          const encoded = `${salt}:${(await derive(b.password, salt, 64)).toString('hex')}`;
          try { run('INSERT INTO users(id,username,password,nickname,created_at) VALUES(?,?,?,?,?)', id(), username, encoded, nickname, now()); }
          catch { throw new AppError('账号已存在', 409); }
          user = one('SELECT * FROM users WHERE username=?', username);
        } else {
          const [salt, digest] = (user?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
          const candidate = await derive(b.password, salt, 64);
          ensure(user && timingSafeEqual(Buffer.from(digest, 'hex'), candidate), '账号或密码不正确', 401);
        }
        session(res, user); return send(res, { user: safeUser(user) });
      }
      const user = authenticate(req); rate(`api:${user.id}`, 300, 60000);
      if (path === '/api/me' && method === 'GET') return send(res, { user: safeUser(user) });
      if (path === '/api/logout' && method === 'POST') {
        const token = /(?:^|; )sid=([^;]+)/.exec(req.headers.cookie || '')?.[1];
        run('DELETE FROM sessions WHERE token=?', hash(token));
        res.setHeader('Set-Cookie', `sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${config.secure ? '; Secure' : ''}`); return send(res, { ok: true });
      }
      if (path === '/api/profile' && method === 'POST') {
        const b = await body(req);
        const nickname = short(b.nickname, 30); ensure(nickname, '昵称不能为空');
        ensure(Object.hasOwn(TOPICS, b.topic) && ['入门', '进阶'].includes(b.level) && ['早上', '下午', '晚上'].includes(b.slot), '学习偏好格式错误');
        ensure(['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'].includes(b.timezone), '请选择有效时区');
        run('UPDATE users SET nickname=?,topic=?,level=?,slot=?,timezone=?,discoverable=?,ai_consent=? WHERE id=?', nickname, b.topic, b.level, b.slot, b.timezone, b.discoverable === true ? 1 : 0, b.ai_consent === true ? 1 : 0, user.id);
        return send(res, { user: safeUser(one('SELECT * FROM users WHERE id=?', user.id)) });
      }
      if (path === '/api/dashboard' && method === 'GET') {
        const items = itemsFor(user); const challenges = challengesFor(user);
        return send(res, { items, challenges, stats: learningStats(user, challenges), insights: insights(items, all('SELECT * FROM topic_states WHERE user_id=?', user.id), challenges),
          consents: all('SELECT * FROM consents WHERE user_id=? ORDER BY created_at DESC', user.id) });
      }
      if (path === '/api/export' && method === 'GET') {
        const challenges = challengesFor(user);
        return send(res, { exported_at: now(), user: safeUser(user), items: itemsFor(user), challenges, stats: learningStats(user, challenges) });
      }
      if (path === '/api/import' && method === 'POST') {
        const b = await body(req); ensure(b.consent === true, '请先确认导入自己的收藏内容');
        ensure(!busy.has(user.id), '分析正在进行，请稍后导入', 409);
        const rows = normalizeItems(b.items);
        ensure(itemsFor(user).length + rows.filter(x => !one('SELECT id FROM items WHERE user_id=? AND url=?', user.id, x.url)).length <= 3000, '本版本每账号最多保存 3000 条收藏');
        let imported = 0;
        transaction(db, () => {
          run('INSERT INTO consents VALUES(?,?,?,?,?)', id(), user.id, b.source === 'demo' ? 'demo' : 'user-export', '用户确认：仅导入本人收藏的标题、摘要、作者和原文链接；AI 传输需另行授权', now());
          for (const row of rows) {
            imported += Number(run('INSERT OR IGNORE INTO items(id,user_id,url,title,excerpt,author,collection,saved_at,imported_at) VALUES(?,?,?,?,?,?,?,?,?)', row.id, user.id, row.url, row.title, row.excerpt, row.author, row.collection, row.saved_at, now()).changes);
          }
        });
        return send(res, { imported, duplicates: b.items.length - imported });
      }
      if (path === '/api/analyze' && method === 'POST') {
        const b = await body(req); ensure(['local', 'ai'].includes(b.engine), '请选择分析方式');
        ensure(!busy.has(user.id), '分析任务正在进行', 409); rate(`ai:${user.id}`, 12, 3600000);
        const items = itemsFor(user); ensure(items.length, '请先导入收藏');
        if (b.engine === 'ai') ensure(user.ai_consent && config.aiKey, '请先在设置中授权 AI 分析，并配置服务密钥');
        busy.add(user.id);
        try {
          const classified = b.engine === 'ai' ? await classifyAI(config, items, options.fetcher) : items.map(i => ({ id: i.id, topic: classifyLocal(i) }));
          transaction(db, () => { for (const row of classified) run('UPDATE items SET topic=?,engine=? WHERE id=? AND user_id=?', row.topic, b.engine === 'ai' ? 'AI' : '本地规则', row.id, user.id); });
          return send(res, { count: classified.length, engine: b.engine });
        } finally { busy.delete(user.id); }
      }
      if (path === '/api/topic-state' && method === 'POST') {
        const b = await body(req); ensure(['unknown', 'not_started', 'started', 'ignore'].includes(b.state), '学习状态无效');
        ensure(Object.hasOwn(TOPICS, b.topic) || b.topic === '其他', '主题无效');
        run('INSERT INTO topic_states VALUES(?,?,?) ON CONFLICT(user_id,topic) DO UPDATE SET state=excluded.state', user.id, b.topic, b.state);
        return send(res, { ok: true });
      }
      if (path === '/api/item-topic' && method === 'POST') {
        const b = await body(req); ensure(!busy.has(user.id), '分析中，请稍后修改', 409);
        ensure(Object.hasOwn(TOPICS, b.topic) || b.topic === '其他', '主题无效');
        ensure(run('UPDATE items SET topic=?,engine=? WHERE id=? AND user_id=?', b.topic, '手动修正', short(b.id, 50), user.id).changes, '收藏不存在', 404);
        return send(res, { ok: true });
      }
      if (path === '/api/challenges' && method === 'POST') {
        const b = await body(req); ensure(!busy.has(user.id), '任务正在生成，请稍后', 409);
        ensure(Object.hasOwn(TOPICS, b.topic), '请选择学习主题');
        const rows = itemsFor(user).filter(x => x.topic === b.topic); ensure(rows.length, '此主题暂无资料');
        ensure(Number.isInteger(b.minutes) && b.minutes >= 20 && b.minutes <= 90, '每天安排 20–90 分钟');
        ensure(['ai', 'local'].includes(b.engine), '请选择生成方式');
        ensure(!one('SELECT id FROM challenges WHERE user_id=? AND topic=?', user.id, b.topic), '该主题已有挑战，请继续已有计划', 409);
        if (b.engine === 'ai') ensure(user.ai_consent && config.aiKey, '请先授权并配置 AI 服务');
        busy.add(user.id);
        try {
          const days = b.engine === 'ai' ? await generateAIPlan(config, b.topic, rows, b.minutes, options.fetcher) : buildLocalPlan(b.topic, rows, b.minutes);
          const cid = id();
          run('INSERT INTO challenges(id,user_id,topic,title,start_date,minutes,engine,days,created_at) VALUES(?,?,?,?,?,?,?,?,?)', cid, user.id, b.topic, `14 天${b.topic}挑战`, localDate(user.timezone), b.minutes, b.engine === 'ai' ? 'AI' : '本地课程模板', JSON.stringify(days), now());
          return send(res, { id: cid });
        } finally { busy.delete(user.id); }
      }
      if (path === '/api/checkin' && method === 'POST') {
        const b = await body(req); const c = one('SELECT * FROM challenges WHERE id=? AND user_id=?', short(b.challenge_id, 50), user.id); ensure(c, '挑战不存在', 404);
        ensure(!c.paused, '挑战已暂停，请恢复后再记录学习进度', 409);
        ensure(Number.isInteger(b.day) && b.day >= 1 && b.day <= 14, '天数需为 1–14');
        ensure(dayDate(c.start_date, b.day) <= localDate(user.timezone), '可以预览后续计划，到当天再打卡');
        const reflection = short(b.reflection, 3000);
        ensure(!b.review_done || reflection.length >= 10, '完成复盘时，请至少写 10 个字');
        const artifact = typeof b.artifact === 'string' ? b.artifact : '';
        ensure(artifact.length <= 2800000 && (!artifact || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(artifact)), '作品需为 2 MB 以内的 PNG、JPEG 或 WebP 图片');
        if (artifact) {
          const binary = Buffer.from(artifact.split(',')[1], 'base64');
          const valid = artifact.startsWith('data:image/png;') ? binary.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) :
            artifact.startsWith('data:image/jpeg;') ? binary.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) :
              binary.toString('ascii', 0, 4) === 'RIFF' && binary.toString('ascii', 8, 12) === 'WEBP';
          ensure(valid && binary.length <= 2 * 1024 * 1024, '图片内容与类型不匹配，或超过 2 MB');
        }
        const prev = one('SELECT * FROM checkins WHERE challenge_id=? AND day=?', c.id, b.day);
        const checkId = prev?.id || id();
        run('INSERT INTO checkins VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(challenge_id,day) DO UPDATE SET read_done=excluded.read_done,practice_done=excluded.practice_done,review_done=excluded.review_done,reflection=excluded.reflection,artifact=excluded.artifact,shared=excluded.shared,updated_at=excluded.updated_at', checkId, c.id, b.day, b.read_done === true ? 1 : 0, b.practice_done === true ? 1 : 0, b.review_done === true ? 1 : 0, reflection, b.remove_artifact ? '' : artifact || prev?.artifact || '', b.shared === true ? 1 : 0, now());
        return send(res, { id: checkId });
      }
      if (path === '/api/challenge-pause' && method === 'POST') {
        const b = await body(req); const c = one('SELECT * FROM challenges WHERE id=? AND user_id=?', short(b.challenge_id, 50), user.id); ensure(c, '挑战不存在', 404);
        ensure(typeof b.paused === 'boolean', '暂停状态无效');
        if (b.paused) run('UPDATE challenges SET paused=1,paused_at=? WHERE id=?', now(), c.id);
        else {
          const days = c.paused_at ? Math.max(0, Math.floor((Date.now() - Date.parse(c.paused_at)) / 86400000)) : 0;
          const shifted = shiftDate(c.start_date, days);
          run('UPDATE challenges SET paused=0,paused_at=NULL,start_date=? WHERE id=?', shifted, c.id);
        }
        return send(res, { paused: b.paused });
      }
      if (path === '/api/checkin' && method === 'GET') {
        const check = one('SELECT k.*,c.user_id,c.topic FROM checkins k JOIN challenges c ON c.id=k.challenge_id WHERE k.id=?', url.searchParams.get('id') || '');
        ensure(check && (check.user_id === user.id || (check.shared && connected(user.id, check.user_id))), '打卡不存在或未共享', 404);
        return send(res, { checkin: check, feedback: all('SELECT f.id,f.body,f.created_at,u.nickname FROM feedback f JOIN users u ON u.id=f.user_id WHERE checkin_id=? ORDER BY f.created_at', check.id) });
      }
      if (path === '/api/buddies' && method === 'GET') {
        const requests = all('SELECT r.*,s.nickname sender_name,t.nickname recipient_name FROM buddy_requests r JOIN users s ON s.id=r.sender JOIN users t ON t.id=r.recipient WHERE r.sender=? OR r.recipient=? ORDER BY r.created_at DESC', user.id, user.id);
        const candidates = user.discoverable ? all('SELECT id,nickname,topic,level,slot FROM users WHERE discoverable=1 AND id<>? AND topic=? LIMIT 100', user.id, user.topic).filter(x => !requests.some(r => (r.sender === x.id || r.recipient === x.id) && ['pending', 'accepted', 'blocked'].includes(r.status))).map(x => ({ ...x, score: 60 + (x.level === user.level ? 20 : 0) + (x.slot === user.slot ? 20 : 0) })).sort((a, b) => b.score - a.score) : [];
        const accepted = requests.filter(x => x.status === 'accepted');
        const feed = accepted.flatMap(r => {
          const peer = r.sender === user.id ? r.recipient : r.sender;
          return all('SELECT k.id,k.day,k.read_done,k.practice_done,k.review_done,k.reflection,k.updated_at,c.topic,c.title,u.nickname,CASE WHEN k.artifact<>\'\' THEN 1 ELSE 0 END has_artifact FROM checkins k JOIN challenges c ON c.id=k.challenge_id JOIN users u ON u.id=c.user_id WHERE k.shared=1 AND c.user_id=? ORDER BY k.updated_at DESC LIMIT 10', peer);
        }).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 30);
        return send(res, { candidates, requests, feed });
      }
      if (path === '/api/buddy-request' && method === 'POST') {
        rate(`invite:${user.id}`, 20, 86400000);
        const b = await body(req); const peer = one('SELECT * FROM users WHERE id=?', short(b.recipient, 50));
        ensure(user.discoverable && peer?.discoverable && peer.id !== user.id && peer.topic === user.topic, '双方需开启匹配并选择相同学习主题');
        ensure(!one("SELECT id FROM buddy_requests WHERE ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) AND status IN ('pending','accepted','blocked')", user.id, peer.id, peer.id, user.id), '已有邀请、搭子关系或屏蔽记录', 409);
        const rid = id(); run('INSERT INTO buddy_requests VALUES(?,?,?,?,?)', rid, user.id, peer.id, 'pending', now()); return send(res, { id: rid });
      }
      if (path === '/api/buddy-respond' && method === 'POST') {
        const b = await body(req); const r = one('SELECT * FROM buddy_requests WHERE id=?', short(b.id, 50));
        ensure(r && (r.sender === user.id || r.recipient === user.id), '邀请不存在', 404);
        ensure(['accepted', 'declined', 'blocked', 'ended'].includes(b.status), '操作无效');
        if (b.status === 'accepted' || b.status === 'declined') ensure(r.recipient === user.id && r.status === 'pending', '仅接收者可回应待处理邀请', 403);
        if (b.status === 'ended') ensure(['pending', 'accepted'].includes(r.status), '关系已结束');
        ensure(r.status !== 'blocked', '关系已屏蔽');
        run('UPDATE buddy_requests SET status=? WHERE id=?', b.status, r.id); return send(res, { ok: true });
      }
      if (path === '/api/feedback' && method === 'POST') {
        rate(`feedback:${user.id}`, 50, 3600000);
        const b = await body(req); const check = one('SELECT k.shared,c.user_id FROM checkins k JOIN challenges c ON c.id=k.challenge_id WHERE k.id=?', short(b.checkin_id, 50));
        ensure(check?.shared && connected(user.id, check.user_id), '仅已匹配搭子可评论共享打卡', 403);
        const text = short(b.body, 1000); ensure(text.length >= 2, '请写至少两个字的具体反馈');
        run('INSERT INTO feedback VALUES(?,?,?,?,?)', id(), b.checkin_id, user.id, text, now()); return send(res, { ok: true });
      }
      if (path === '/api/data' && method === 'DELETE') {
        ensure(!busy.has(user.id), '请等待当前分析完成后再清除', 409);
        const b = await body(req); ensure(b.confirm === '清除学习数据', '请输入确认文字');
        transaction(db, () => {
          for (const table of ['items', 'challenges', 'topic_states', 'consents']) run(`DELETE FROM ${table} WHERE user_id=?`, user.id);
          run('DELETE FROM feedback WHERE user_id=?', user.id);
          run('DELETE FROM buddy_requests WHERE sender=? OR recipient=?', user.id, user.id);
          run('UPDATE users SET ai_consent=0,discoverable=0 WHERE id=?', user.id);
        });
        return send(res, { ok: true });
      }
      throw new AppError('接口不存在', 404);
    } catch (e) {
      if (!res.headersSent) send(res, { error: e instanceof AppError ? e.message : '服务暂时不可用，请稍后重试' }, e instanceof AppError ? e.status : 500);
      else res.end();
      if (!(e instanceof AppError)) console.error('Request failed:', e.name);
    }
  }
  const server = http.createServer(handle);
  server.requestTimeout = 60000; server.headersTimeout = 15000;
  return { server, db, config };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const app = createApp(); const host = process.env.HOST || '127.0.0.1'; const port = Number(process.env.PORT || 8787);
  app.server.listen(port, host, () => console.log(`拾知已启动：${app.config.origin}`));
}



