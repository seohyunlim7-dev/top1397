const MODEL = 'gpt-5.4-mini';

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    elements: {
      type: 'object',
      properties: {
        wood: { type: 'integer' },
        fire: { type: 'integer' },
        earth: { type: 'integer' },
        metal: { type: 'integer' },
        water: { type: 'integer' }
      },
      required: ['wood', 'fire', 'earth', 'metal', 'water'],
      additionalProperties: false
    },
    numbers: {
      type: 'array',
      items: { type: 'integer', minimum: 1, maximum: 45 },
      minItems: 6,
      maxItems: 6
    },
    bonus: { type: 'integer', minimum: 1, maximum: 45 }
  },
  required: ['summary', 'elements', 'numbers', 'bonus'],
  additionalProperties: false
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { birthDate, birthTime, timeUnknown, gender } = body || {};

  if (!birthDate || typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    res.status(400).json({ error: '생년월일을 올바르게 입력해주세요.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되어 있지 않습니다.' });
    return;
  }

  const genderText = gender === 'male' ? '남성' : gender === 'female' ? '여성' : '미상';
  const timeText = timeUnknown || !birthTime ? '모름' : birthTime;

  const prompt = `생년월일: ${birthDate}\n태어난 시간: ${timeText}\n성별: ${genderText}\n\n` +
    '위 생년월일과 태어난 시간을 바탕으로 사주(四柱)를 간단히 분석해줘. ' +
    '오행(목화토금수) 기운을 각각 0~10 점수로 평가하고, 그 기운의 흐름에서 착안해 로또 번호 6개(1~45, 중복 없이)와 ' +
    '보너스 번호 1개(1~45, 6개와 중복 없이)를 추천해줘. 분석 요약은 재미로 보는 용도임을 감안해서 따뜻하고 긍정적인 톤으로 ' +
    '2~4문장, 한국어로 작성해줘.';

  try {
    const aiRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          {
            role: 'system',
            content: '너는 재미로 사주를 풀이해주는 다정한 한국어 운세 분석가야. 결과는 반드시 지정된 JSON 스키마로만 응답해.'
          },
          { role: 'user', content: prompt }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'saju_lotto',
            strict: true,
            schema: RESPONSE_SCHEMA
          }
        }
      })
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      res.status(502).json({ error: 'AI 분석 요청에 실패했습니다.', detail: errText.slice(0, 300) });
      return;
    }

    const data = await aiRes.json();
    const parsed = JSON.parse(extractOutputText(data));

    const numbers = Array.isArray(parsed.numbers)
      ? [...new Set(parsed.numbers)].filter(n => Number.isInteger(n) && n >= 1 && n <= 45)
      : [];
    const bonus = Number.isInteger(parsed.bonus) ? parsed.bonus : null;

    const isValid = numbers.length === 6 && bonus !== null && bonus >= 1 && bonus <= 45 && !numbers.includes(bonus);

    if (!isValid) {
      const fallback = fallbackDraw();
      res.status(200).json({
        summary: parsed.summary || '사주 기운을 바탕으로 번호를 추천했어요.',
        elements: parsed.elements || null,
        numbers: fallback.numbers,
        bonus: fallback.bonus,
        fallback: true
      });
      return;
    }

    res.status(200).json({
      summary: parsed.summary,
      elements: parsed.elements,
      numbers,
      bonus,
      fallback: false
    });
  } catch (err) {
    res.status(500).json({ error: 'AI 분석 중 오류가 발생했습니다.' });
  }
};

function extractOutputText(data) {
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text;
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        const textPart = item.content.find(c => c.type === 'output_text');
        if (textPart) return textPart.text;
      }
    }
  }
  throw new Error('AI 응답을 해석할 수 없습니다.');
}

function fallbackDraw() {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const picked = [];
  for (let i = 0; i < 7; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return { numbers: picked.slice(0, 6).sort((a, b) => a - b), bonus: picked[6] };
}
