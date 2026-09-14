// This function is serialized by chrome.scripting.executeScript; keep it self-contained.
// Restrict collection to rendered collection-list cards. Never read cookies or app state.
export function collectVisible() {
  if (location.hostname !== 'www.zhihu.com' || !/^\/collection\/\d+\/?$/.test(location.pathname)) {
    return { error: '请先打开自己的知乎收藏夹详情页（www.zhihu.com/collection/数字）' };
  }
  const collection = (document.querySelector('.CollectionDetailPageHeader-title')?.textContent || document.querySelector('h1')?.textContent || document.title).trim().slice(0, 120);
  const scope = document.querySelector('.CollectionDetailPage-mainColumn') || document.querySelector('main');
  if (!scope) return { error: '未找到收藏列表，请确认页面已加载。知乎页面结构变化时需更新扩展适配。' };
  const rows = new Map();
  const cards = scope.querySelectorAll('.List-item, .CollectionDetailPageItem');
  for (const card of cards) {
    const anchor = card.querySelector('.ContentItem-title a[href], h2 a[href]');
    if (!anchor || !card.getClientRects().length) continue;
    const meta = card.querySelector('meta[itemprop="url"]')?.getAttribute('content');
    const direct = card.querySelector('.ContentItem-time a[href*="/answer/"]')?.getAttribute('href');
    const candidates = [meta, direct, anchor.getAttribute('href')].filter(Boolean);
    let url = null;
    for (const candidate of candidates) {
      try {
        const u = new URL(candidate, location.origin); u.search = ''; u.hash = ''; u.pathname = u.pathname.replace(/\/$/, '');
        if (u.protocol === 'https:' && !u.username && !u.password && !u.port &&
          ((u.hostname === 'www.zhihu.com' && /^\/question\/\d+(\/answer\/\d+)?$/.test(u.pathname)) || (u.hostname === 'zhuanlan.zhihu.com' && /^\/p\/\d+$/.test(u.pathname)))) { url = u.href; break; }
      } catch { /* Skip non-content and malformed links. */ }
    }
    if (!url) continue;
    const title = anchor.textContent.trim().slice(0, 300); if (!title) continue;
    const excerpt = (card.querySelector('.RichContent-inner, .RichText')?.textContent || '').trim().slice(0, 1500);
    const author = (card.querySelector('.AuthorInfo-name, .UserLink-link')?.textContent || '').trim().slice(0, 100);
    // A page's updated time is not the user's saved time. Unknown is intentionally null.
    rows.set(url, { title, url, excerpt, author, collection, saved_at: null });
  }
  return { collection, page_url: location.href, items: [...rows.values()], loaded_cards: cards.length,
    note: '仅包含当前已加载且识别成功的收藏条目；手动翻页后可继续采集。' };
}
