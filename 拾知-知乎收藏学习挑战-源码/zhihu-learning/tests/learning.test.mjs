import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItems, canonicalUrl, insights, buildLocalPlan, classifyAI, generateAIPlan, dayDate, localDate } from '../lib/learning.mjs';
const items = Array.from({ length: 30 }, (_, i) => ({ id: `photo-${i}`, url: `https://zhuanlan.zhihu.com/p/${1000 + i}`, title: `摄影构图练习 ${i}`, excerpt: '自然光摄影入门', collection: '摄影', topic: '摄影', author: '测试作者', saved_at: null }));

test('deduplicate canonical Zhihu links and reject off-site / dangerous links', () => {
  const rows = normalizeItems([items[0], { ...items[0], url: `${items[0].url}?tracking=123#x` }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].saved_at, null);
  for (const url of ['javascript:alert(1)', 'http://zhuanlan.zhihu.com/p/1', 'https://zhihu.com.evil.test/question/1', 'https://www.zhihu.com@evil.test/question/1', 'https://www.zhihu.com/api/v4/me', 'https://www.zhihu.com:4430/question/1']) assert.throws(() => canonicalUrl(url));
  assert.throws(() => normalizeItems([{ ...items[0], saved_at: 'unknown' }]));
});
test('interest hypothesis distinguishes unknown dates and self-reported progress', () => {
  const result = insights(items, [], []); assert.equal(result[0].candidate, true); assert.equal(result[0].oldest_days, null); assert.match(result[0].evidence, /需你确认/);
  assert.equal(insights(items, [{ topic: '摄影', state: 'started' }], [])[0].candidate, false);
  assert.equal(insights(items, [], [{ topic: '摄影' }])[0].candidate, false);
});
test('30 photography articles produce 14 distinct sources and actionable daily triplets', () => {
  const plan = buildLocalPlan('摄影', items, 30); assert.equal(plan.length, 14);
  assert.equal(new Set(plan.map(d => d.reading_id)).size, 14);
  for (const [i, day] of plan.entries()) {
    assert.equal(day.day, i + 1); assert.ok(day.read_task && day.practice && day.review);
    assert.equal(day.read_minutes + day.practice_minutes + day.review_minutes, 30);
    assert.ok(items.some(x => x.id === day.reading_id));
  }
  assert.equal(buildLocalPlan('摄影', items.slice(0, 1), 20).length, 14);
});
const config = { aiKey: 'test-only', aiBase: 'https://ai.example', aiModel: 'test' };
const reply = value => async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
test('AI classification rejects omitted, fabricated and duplicate item references', async () => {
  await assert.rejects(classifyAI(config, items.slice(0, 2), reply({ items: [{ id: 'photo-0', topic: '摄影' }, { id: 'photo-0', topic: '摄影' }] })));
  await assert.rejects(classifyAI(config, items.slice(0, 1), reply({ items: [{ id: 'invented', topic: '摄影' }] })));
  await assert.rejects(classifyAI(config, items.slice(0, 1), reply({ items: [{ id: 'photo-0', topic: '未知主题' }] })));
  const valid = await classifyAI(config, items.slice(0, 2), reply({ items: items.slice(0, 2).map(x => ({ id: x.id, topic: '摄影' })) })); assert.equal(valid.length, 2);
});
test('AI plan must have all 14 days and original sources', async () => {
  const days = buildLocalPlan('摄影', items, 30);
  await assert.rejects(generateAIPlan(config, '摄影', items, 30, reply({ days: days.slice(0, 13) })));
  await assert.rejects(generateAIPlan(config, '摄影', items, 30, reply({ days: days.map(d => ({ ...d, reading_id: 'fake-id' })) })));
  const valid = await generateAIPlan(config, '摄影', items, 30, reply({ days })); assert.equal(valid.length, 14);
});
test('day arithmetic is independent of locale and spans month boundaries', () => {
  assert.equal(dayDate('2026-09-25', 14), '2026-10-08');
  assert.equal(localDate('Asia/Shanghai', new Date('2026-09-13T17:00:00Z')), '2026-09-14');
});
