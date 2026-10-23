-- OdontoCostos: base de datos en Supabase.
-- Pégalo completo en Supabase → SQL Editor → New query → Run. Se puede correr más de una vez.

-- Perfil de cada usuario: prueba de Pro y cliente de Stripe.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  stripe_customer_id text unique,
  created_at timestamptz not null default now()
);

-- Suscripción vigente. Solo la escribe el servidor (webhook de Stripe).
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  stripe_subscription_id text unique,
  plan text check (plan in ('plus', 'pro')),
  interval text,
  status text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Datos del consultorio: un documento por usuario.
create table if not exists public.clinic_states (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Respuestas de la encuesta "¿pagarías por OdontoCostos?".
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete set null,
  would_pay text,
  comment text check (char_length(comment) <= 2000),
  plan text,
  created_at timestamptz not null default now()
);

-- Al registrarse, se crea el perfil con 14 días de Pro.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Seguridad: cada quien ve solo lo suyo. La prueba y el plan no se pueden editar desde la app.
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.clinic_states enable row level security;
alter table public.feedback enable row level security;

drop policy if exists "perfil propio" on public.profiles;
create policy "perfil propio" on public.profiles for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "suscripcion propia" on public.subscriptions;
create policy "suscripcion propia" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "datos propios: leer" on public.clinic_states;
create policy "datos propios: leer" on public.clinic_states for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "datos propios: crear" on public.clinic_states;
create policy "datos propios: crear" on public.clinic_states for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "datos propios: cambiar" on public.clinic_states;
create policy "datos propios: cambiar" on public.clinic_states for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "datos propios: borrar" on public.clinic_states;
create policy "datos propios: borrar" on public.clinic_states for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "enviar opinion" on public.feedback;
create policy "enviar opinion" on public.feedback for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
