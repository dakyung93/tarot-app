-- ✦ 별의 신탁 — Supabase 테이블 설정
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요

-- 사용자 테이블 (IP 기반 — 회원가입 없이 관리)
CREATE TABLE IF NOT EXISTS tarot_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint TEXT UNIQUE NOT NULL,   -- 브라우저 핑거프린트 (IP + User-Agent 조합)
  free_used INTEGER DEFAULT 0,        -- 무료 사용 횟수
  is_paid BOOLEAN DEFAULT FALSE,      -- 유료 여부
  paid_plan TEXT,                     -- 'light' | 'premium'
  paid_until TIMESTAMPTZ,             -- 구독 만료일
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API 요청 로그 (어뷰징 감지용)
CREATE TABLE IF NOT EXISTS tarot_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  question_length INTEGER,
  card_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limit: 1시간에 같은 fingerprint가 10회 이상이면 차단
CREATE INDEX IF NOT EXISTS idx_tarot_logs_fp_time 
  ON tarot_logs(fingerprint, created_at);

CREATE INDEX IF NOT EXISTS idx_tarot_users_fp 
  ON tarot_users(fingerprint);
