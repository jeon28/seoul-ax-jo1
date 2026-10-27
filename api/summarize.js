// 이름을 가린 확인 목록(코드·사유·내용)만 받아 문장을 정리한다. 키는 환경 변수에만 둔다.
const MAX_ITEMS = 60;
const MAX_LEN = 300;
// 코드 형식이 아닌 값(실제 이름일 수 있음)은 걸러낸다: S01, C07, H02, L03 같은 코드만 통과
const CODE = /^[A-Z]{1,2}\d{2,3}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI key not configured' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const clean = items
    .filter((i) => i && CODE.test(String(i.code)))
    .map((i) => ({ code: String(i.code), reason: String(i.reason).slice(0, MAX_LEN), detail: String(i.detail).slice(0, MAX_LEN) }));
  if (!clean.length) return res.status(400).json({ error: 'no maskable items' });

  const prompt =
    '아래는 이름을 코드로 가린 업무 확인 필요 목록입니다. 사람이 먼저 볼 순서로, 짧은 한국어 문장 목록으로 정리해 주세요. ' +
    '숫자를 새로 계산하거나 추측하지 말고, 주어진 내용만 쓰세요.\n\n' +
    clean.map((i) => `- ${i.code}: ${i.reason} / ${i.detail}`).join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return res.status(502).json({ error: 'upstream ' + r.status });
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || '').join('').trim();
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(502).json({ error: 'upstream failed' });
  }
};
