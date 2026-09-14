import test from 'node:test';
import assert from 'node:assert/strict';
import { collectVisible } from '../extension/collector.js';

// Contract fixtures model only rendered DOM nodes. Live Zhihu compatibility is a separate acceptance step.
test('extension honors collection scope, prefers canonical answer metadata and does not invent saved dates', t => {
  const previousDoc = globalThis.document; const previousLoc = globalThis.location;
  t.after(() => { if (previousDoc === undefined) delete globalThis.document; else globalThis.document = previousDoc; if (previousLoc === undefined) delete globalThis.location; else globalThis.location = previousLoc; });
  const card = (url, visible = true) => ({
    getClientRects: () => visible ? [{}] : [],
    querySelector: selector => {
      if (selector === '.ContentItem-title a[href], h2 a[href]') return { textContent: ' 摄影入门 ', getAttribute: () => '/question/123' };
      if (selector === 'meta[itemprop="url"]') return { getAttribute: () => url };
      if (selector === '.RichContent-inner, .RichText') return { textContent: ' 可见摘要 ' };
      if (selector === '.AuthorInfo-name, .UserLink-link') return { textContent: ' 原作者 ' };
      return null;
    }
  });
  globalThis.location = { hostname: 'www.zhihu.com', pathname: '/collection/1234', href: 'https://www.zhihu.com/collection/1234', origin: 'https://www.zhihu.com' };
  const cards = [card('https://www.zhihu.com/question/123/answer/456'), card('https://www.zhihu.com/question/123/answer/789'), card('https://www.zhihu.com/question/123/answer/456?track=1'), card('https://www.zhihu.com/question/123/answer/999', false)];
  globalThis.document = { title: '摄影收藏', querySelector: s => s === '.CollectionDetailPageHeader-title' ? { textContent: '摄影收藏' } : s === '.CollectionDetailPage-mainColumn' ? { querySelectorAll: () => cards } : null };
  const result = collectVisible();
  assert.equal(result.items.length, 2, 'different answers to the same question stay distinct');
  assert.equal(result.items[0].saved_at, null);
  assert.equal(result.items[0].author, '原作者');
  assert.equal(result.items[0].url, 'https://www.zhihu.com/question/123/answer/456');
  globalThis.location.pathname = '/people/abc';
  assert.ok(collectVisible().error, 'only collection pages are supported');
});
