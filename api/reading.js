const FREE_LIMIT = 3;
const RATE_LIMIT_PER_HOUR = 15;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { question, cards, positions } = req.body;
  if (!question || !cards?.length) {
    return res.status(400).json({ error: '질문과 카드 정보가 필요합니다' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || 'unknown';
  const ua = req.headers['user-agent'] || '';
  const fingerprint = Buffer.from(`${ip}::${ua.substring(0, 80)}`).toString('base64').substring(0, 64);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

  const sbFetch = (path, opts = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': opts.prefer || 'return=representation',
        ...opts.headers,
      },
    });

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const rateRes = await sbFetch(
      `/tarot_logs?fingerprint=eq.${encodeURIComponent(fingerprint)}&created_at=gte.${oneHourAgo}&select=id`
    );
    const rateLogs = await rateRes.json();
    if (Array.isArray(rateLogs) && rateLogs.length >= RATE_LIMIT_PER_HOUR) {
      return res.status(429).json({ error: '잠시 후 다시 시도해주세요. (1시간 최대 15회)' });
    }

    const userRes = await sbFetch(`/tarot_users?fingerprint=eq.${encodeURIComponent(fingerprint)}&select=*`);
    let users = await userRes.json();
    let user;

    if (!Array.isArray(users) || users.length === 0) {
      const createRes = await sbFetch('/tarot_users', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({ fingerprint, free_used: 0, is_paid: false }),
      });
      const created = await createRes.json();
      user = Array.isArray(created) ? created[0] : created;
    } else {
      user = users[0];
    }

    if (user.is_paid && user.paid_until && new Date(user.paid_until) < new Date()) {
      await sbFetch(`/tarot_users?fingerprint=eq.${encodeURIComponent(fingerprint)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_paid: false, paid_plan: null }),
      });
      user.is_paid = false;
    }

    if (!user.is_paid) {
      if (user.free_used >= FREE_LIMIT) {
        return res.status(402).json({
          error: 'FREE_LIMIT_REACHED',
          message: '무료 리딩 3회를 모두 사용했습니다.',
          free_used: user.free_used,
          is_paid: false,
        });
      }
      await sbFetch(`/tarot_users?fingerprint=eq.${encodeURIComponent(fingerprint)}`, {
        method: 'PATCH',
        body: JSON.stringify({ free_used: user.free_used + 1, updated_at: new Date().toISOString() }),
      });
    }

    await sbFetch('/tarot_logs', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify({ fingerprint, question_length: question.length, card_count: cards.length }),
    });

    const pos = positions || [];
    const cardDesc = cards.map((c, i) =>
      `[${pos[i] || ''}] ${c.name}${c.rx ? ' (역방향)' : ''} — ${c.isMajor ? '메이저 아르카나' : `${c.suit} 수트`}, 키워드: ${c.key}`
    ).join('\n');

    const prompt = `당신은 깊은 통찰력을 지닌 타로 마스터입니다. 한국어로 답하세요.

질문: "${question}"

뽑힌 카드:
${cardDesc}

해석 규칙:
- 마이너 아르카나: 수트 에너지(완드=열정·행동, 컵=감정·관계, 소드=지성·갈등, 펜타클=물질·현실)와 숫자 의미 반영
- 코트 카드(페이지/나이트/퀸/킹): 사람 또는 에너지로 해석
- 역방향: 내면화·지연·그림자 에너지
- 카드 위치(과거/현재/미래 등)와 카드 간 흐름을 연결해 해석
- 신비롭고 시적이되 구체적 통찰과 조언 포함
- 각 카드 한 단락씩 + 마지막 종합 메시지
- 순수 텍스트만`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      return res.status(500).json({ error: err.error?.message || 'AI 오류' });
    }

    const claudeData = await claudeRes.json();
    let text = '';
    if (claudeData.content && Array.isArray(claudeData.content)) {
      text = claudeData.content.filter(b => b.type === 'text').map(b => b.text).join('');
    }
    if (!text) return res.status(500).json({ error: 'AI 응답을 받지 못했습니다.' });

    const remaining = user.is_paid ? 999 : Math.max(0, FREE_LIMIT - (user.free_used + 1));
    return res.status(200).json({ reading: text, remaining, is_paid: user.is_paid });

  } catch (e) {
    console.error('Reading error:', e);
    return res.status(500).json({ error: '서버 오류: ' + e.message });
  }
}
