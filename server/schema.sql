-- OdontoCostos: tablas. El servidor las crea solo al arrancar; se puede correr más de una vez.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  trial_ends_at timestamptz not null,
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);
create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);
create table if not exists subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  stripe_subscription_id text unique,
  plan text check (plan in ('plus', 'pro')),
  interval text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists clinic_states (
  user_id uuid primary key references users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists feedback (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  would_pay text,
  comment text,
  plan text,
  created_at timestamptz not null default now()
);
create table if not exists support_messages (
  id bigserial primary key,
  user_id uuid references users(id) on delete set null,
  email text,
  message text not null,
  created_at timestamptz not null default now()
);
create table if not exists password_resets (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists password_resets_user_idx on password_resets(user_id);
-- Prueba con tarjeta (Stripe): una sola vez por cuenta.
alter table users add column if not exists card_trial_used boolean not null default false;
alter table subscriptions add column if not exists trial_end timestamptz;
-- Invita a un colega: cada cuenta tiene su código; el premio se da cuando el invitado paga su primer mes.
alter table users add column if not exists ref_code text unique;
create table if not exists referrals (
  referred_id uuid primary key references users(id) on delete cascade,
  referrer_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz
);
create index if not exists referrals_referrer_idx on referrals(referrer_id);
-- Resumen mensual por correo: se puede apagar; cada mes se manda una sola vez.
alter table users add column if not exists monthly_email boolean not null default true;
alter table users add column if not exists email_token uuid not null default gen_random_uuid();
create table if not exists monthly_emails (
  user_id uuid not null references users(id) on delete cascade,
  month text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, month)
);
