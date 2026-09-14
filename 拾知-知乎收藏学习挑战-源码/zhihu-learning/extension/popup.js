import { collectVisible } from './collector.js';
const $ = s => document.querySelector(s);
let rows = [];
async function refresh() {
  rows = (await chrome.storage.local.get('shizhi_items')).shizhi_items || [];
  $('#status').textContent = `已暂存 ${rows.length} 条收藏`;
  $('#preview').replaceChildren(...rows.slice(-4).map(x => { const li = document.createElement('li'); li.textContent = x.title; return li; }));
  $('#export').disabled = !rows.length;
}
$('#collect').onclick = async () => {
  if (!$('#consent').checked) { $('#status').textContent = '请先确认当前是自己的收藏夹，并勾选授权。'; return; }
  $('#collect').disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('未找到活动标签页');
    const u = new URL(tab.url || '');
    if (u.hostname !== 'www.zhihu.com' || !/^\/collection\/\d+\/?$/.test(u.pathname)) throw new Error('请打开知乎收藏夹详情页再采集');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectVisible });
    if (result?.error) throw new Error(result.error);
    if (!result?.items?.length) throw new Error('没有识别到收藏条目。请先加载收藏内容；如果知乎改版，需要更新 collector.js。');
    const merged = new Map(rows.map(x => [x.url, x])); const before = merged.size;
    for (const item of result.items) merged.set(item.url, item);
    if (merged.size > 1000) throw new Error('暂存区超过 1000 条，请先导出并清空，再采集下一批。');
    await chrome.storage.local.set({ shizhi_items: [...merged.values()] }); await refresh();
    $('#status').textContent = `本页识别 ${result.items.length} 条，新增 ${merged.size - before} 条，共 ${merged.size} 条。继续翻页可追加采集。`;
  } catch (e) { $('#status').textContent = e.message; }
  finally { $('#collect').disabled = false; }
};
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, source: 'zhihu-visible-collection', exported_at: new Date().toISOString(), items: rows }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'zhihu-collections.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 15000);
};
$('#clear').onclick = async () => { if (!confirm('确认清空扩展本地暂存？请先保存导出文件。')) return; await chrome.storage.local.remove('shizhi_items'); await refresh(); };
refresh().catch(e => { $('#status').textContent = e.message; });
