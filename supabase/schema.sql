create table if not exists public.saju_draws (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  birth_date date not null,
  birth_time text,
  time_unknown boolean not null default false,
  gender text,
  summary text,
  elements jsonb,
  numbers integer[] not null,
  bonus integer not null,
  fallback boolean not null default false
);

alter table public.saju_draws enable row level security;
