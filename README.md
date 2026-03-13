# ✦ 별의 신탁 v2 — 배포 가이드

## 파일 구조
```
tarot-v2/
├── index.html              ← 앱 화면
├── vercel.json             ← Vercel 설정
├── supabase_setup.sql      ← DB 테이블 생성 SQL
└── api/
    ├── reading.js          ← 리딩 API (횟수 차감)
    └── status.js           ← 상태 확인 API
```

---

## 보안이 강화된 점
| | v1 (이전) | v2 (이번) |
|---|---|---|
| 횟수 관리 | 브라우저 (뚫림) | 서버 DB (안전) |
| 결제 우회 | localStorage 조작으로 가능 | 서버에서 확인 |
| API 비용 폭탄 | 방어 없음 | 시간당 15회 제한 |
| 어뷰징 탐지 | 없음 | 요청 로그 기록 |

---

## 배포 순서

### 1단계 — Supabase 설정 (무료 DB)
1. [supabase.com](https://supabase.com) 가입 → New Project
2. 프로젝트 생성 후 `SQL Editor` 탭 클릭
3. `supabase_setup.sql` 내용 붙여넣고 실행
4. `Settings > API` 에서 두 가지 복사:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` 키 → `SUPABASE_SERVICE_KEY` ⚠️ 절대 공개 금지

### 2단계 — GitHub & Vercel 배포
1. GitHub에 이 폴더 전체 업로드
2. Vercel에서 GitHub 연결 → Deploy

### 3단계 — 환경변수 등록 (Vercel)
`Settings > Environment Variables` 에서 3개 추가:

| 변수명 | 값 |
|--------|-----|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service_role) |

저장 후 `Redeploy` 클릭!

---

## 결제 연동 (토스페이먼츠)
index.html의 `handlePayment()` 함수 안에 아래 코드 삽입:

```javascript
async function handlePayment() {
  const { loadTossPayments } = await import("https://js.tosspayments.com/v1/payment");
  const tossPayments = await loadTossPayments('클라이언트_키');
  
  await tossPayments.requestPayment('카드', {
    amount: selectedPlan === 'premium' ? 5900 : 2900,
    orderId: 'tarot_' + Date.now(),
    orderName: selectedPlan === 'premium' ? '별의신탁 PREMIUM' : '별의신탁 LIGHT',
    successUrl: window.location.origin + '/payment/success',
    failUrl: window.location.origin + '/payment/fail',
  });
}
```

결제 완료 후 `/api/activate` 엔드포인트를 만들어
Supabase에서 `is_paid = true`, `paid_until = 30일 후` 업데이트하면 완성!

---

## 비용 계산 (월 기준)
| 항목 | 비용 |
|------|------|
| Vercel 호스팅 | 무료 |
| Supabase DB | 무료 (500MB, 충분) |
| Claude API (유저 1명 월 50회) | 약 500원 |
| 토스페이먼츠 수수료 | 3.3% |

구독자 50명 기준 순수익 약 **25만원**
구독자 200명 기준 순수익 약 **100만원**
