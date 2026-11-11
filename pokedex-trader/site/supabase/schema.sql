-- =====================================================================
-- Pokédex Trader : schéma Supabase (Postgres + Row Level Security)
--
-- À coller tel quel dans Supabase > SQL Editor > New query > Run.
-- Le script est « idempotent » : on peut le relancer sans rien casser
-- (il crée ce qui manque et remplace les règles d'accès et les fonctions).
--
-- Trois niveaux d'accès, vérifiés PAR LA BASE (RLS), pas seulement par l'affichage :
--   - visiteur (anon) : catalogue, extensions, cotes ET historique des cotes (price_history),
--     annonces, actualités, réglages publics ;
--   - compte gratuit (authenticated) : en plus, ses propres données (Pokédex, wishlist,
--     master sets, cartes cochées, alertes de prix) et 5 cartes Pro dévoilées (reveal_card) ;
--   - Pro / modérateurs (has_pro_access) : l'analyse (signaux, scores, estimations : tables
--     analysis et market_view) et la courbe de performance du portefeuille (portfolio_snapshots).
-- Un membre gratuit qui appelle l'API directement ne lit aucune analyse (hors 5 découvertes).
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Profils (un par compte, créé automatiquement à l'inscription)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text,
  pseudo             text not null default 'Dresseur',
  role               text not null default 'user',
  plan               text not null default 'free',
  pro_until          timestamptz,
  pro_since          timestamptz,
  pro_interval       text,
  stripe_customer_id text unique,
  banned             boolean not null default false,
  ban_reason         text,
  created_at         timestamptz not null default now(),
  last_seen          timestamptz,
  constraint profiles_role_chk check (role in ('user', 'moderator', 'admin')),
  constraint profiles_plan_chk check (plan in ('free', 'pro')),
  constraint profiles_interval_chk check (pro_interval is null or pro_interval in ('month', 'year', 'manual')),
  constraint profiles_pseudo_chk check (char_length(pseudo) between 2 and 32)
);
create index if not exists profiles_created_idx on public.profiles (created_at);

-- ---------------------------------------------------------------------
-- 2. Fonctions d'aide (security definer : elles lisent profiles sans
--    passer par ses règles, ce qui évite les boucles de RLS)
-- ---------------------------------------------------------------------
create or replace function public.is_pro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and not p.banned and p.plan = 'pro'
      and (p.pro_until is null or p.pro_until > now()));
$$;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and not p.banned and p.role in ('moderator', 'admin'));
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and not p.banned and p.role = 'admin');
$$;

-- Accès aux données Pro : abonnés Pro, modérateurs et admins
create or replace function public.has_pro_access() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_pro() or public.is_moderator();
$$;

create or replace function public.is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.banned from public.profiles p where p.id = auth.uid()), false);
$$;

-- Profil créé à l'inscription (pseudo choisi, sinon « Dresseur-xxxxxx » :
-- jamais l'adresse e-mail, qui ne doit pas apparaître dans les classements)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ps text := btrim(coalesce(new.raw_user_meta_data->>'pseudo', ''));
begin
  if char_length(ps) < 2 or char_length(ps) > 32 then
    ps := 'Dresseur-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  insert into public.profiles (id, email, pseudo) values (new.id, new.email, ps)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email after update of email on auth.users
  for each row execute function public.handle_user_email();

-- ---------------------------------------------------------------------
-- 3. Catalogue public (lisible par tous, écrit par la synchro quotidienne)
-- ---------------------------------------------------------------------
create table if not exists public.sets (
  id           text primary key,
  name         text not null,
  series       text,
  release_date date,
  total        integer,
  lang         text not null default 'EN',
  logo         text,
  updated_at   timestamptz not null default now()
);
create index if not exists sets_release_idx on public.sets (release_date desc);

create table if not exists public.cards (
  id           text primary key,
  name         text not null,
  set_id       text,
  set_name     text,
  number       text,
  rarity       text,
  lang         text not null default 'EN',
  image_small  text,
  image_large  text,
  release_date date,
  price        numeric(12, 2),
  price_date   date,
  ref_id       text,
  variants     text[],
  search       text,
  updated_at   timestamptz not null default now()
);
create index if not exists cards_set_idx on public.cards (set_id);
create index if not exists cards_price_idx on public.cards (price desc nulls last);
create index if not exists cards_lang_idx on public.cards (lang);
create index if not exists cards_search_trgm on public.cards using gin (search extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 4. Analyse (Pro / modérateurs uniquement) et historique des cotes (public)
-- ---------------------------------------------------------------------
create table if not exists public.analysis (
  card_id          text primary key references public.cards(id) on delete cascade,
  signal           text,
  buy_score        numeric(5, 1),
  sell_score       numeric(5, 1),
  confidence       numeric(5, 1),
  rank_buy         numeric(5, 1),
  rank_sell        numeric(5, 1),
  price            numeric(12, 2),
  mom7             double precision,
  mom30            double precision,
  mom90            double precision,
  mom365           double precision,
  trend_year       double precision,
  est30            numeric(12, 2),
  est90            numeric(12, 2),
  est30_low        numeric(12, 2),
  est30_high       numeric(12, 2),
  exp_return30_net double precision,
  vol30            double precision,
  rsi              double precision,
  ath_365          numeric(12, 2),
  other_market     numeric(12, 2),
  history_days     integer,
  reasons_buy      jsonb not null default '[]'::jsonb,
  reasons_sell     jsonb not null default '[]'::jsonb,
  updated_at       timestamptz not null default now()
);
create index if not exists analysis_buy_idx on public.analysis (buy_score desc);
create index if not exists analysis_rank_buy_idx on public.analysis (rank_buy desc);
create index if not exists analysis_rank_sell_idx on public.analysis (rank_sell desc);
create index if not exists analysis_mom7_idx on public.analysis (mom7);

create table if not exists public.price_history (
  card_id text not null references public.cards(id) on delete cascade,
  date    date not null,
  price   numeric(12, 2) not null,
  source  text not null default 'cardmarket',
  primary key (card_id, date, source)
);
create index if not exists price_history_date_idx on public.price_history (date);

-- Vue Marché : analyse + fiche de la carte. security_invoker = les règles
-- de la table analysis s'appliquent à celui qui lit la vue.
drop view if exists public.market_view;
create view public.market_view with (security_invoker = true) as
  select a.*, c.name, c.set_id, c.set_name, c.number, c.rarity, c.lang,
         c.image_small, c.image_large, c.release_date, c.price as card_price, c.search
  from public.analysis a
  join public.cards c on c.id = a.card_id;

-- Vue Collections (page publique #/collections) : chaque extension avec son nombre de cartes,
-- la somme des cotes et sa carte la plus chère (« carte phare »). Elle ne lit que les tables
-- publiques sets et cards ; security_invoker = les règles de ces tables s'appliquent au lecteur.
drop view if exists public.set_overview;
create view public.set_overview with (security_invoker = true) as
  select s.id, s.name, s.series, s.release_date, s.total, s.lang, s.logo,
         coalesce(k.cards, 0) as cards, coalesce(k.priced, 0) as priced, k.value,
         t.id as top_id, t.name as top_name, t.number as top_number, t.rarity as top_rarity,
         t.price as top_price, t.image_small as top_image
  from public.sets s
  left join (select set_id, count(*)::int as cards, count(price)::int as priced, round(sum(price), 2) as value
             from public.cards group by set_id) k on k.set_id = s.id
  left join (select distinct on (set_id) set_id, id, name, number, rarity, price, image_small
             from public.cards where price is not null
             order by set_id, price desc, id) t on t.set_id = s.id;

-- ---------------------------------------------------------------------
-- 5. Données personnelles (chacun ne voit que les siennes)
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  card_id     text not null references public.cards(id),
  side        text not null,
  date        date not null default current_date,
  quantity    integer not null,
  unit_price  numeric(12, 2) not null,
  fees        numeric(12, 2) not null default 0,
  condition   text not null default 'NM',
  platform    text,
  note        text,
  created_at  timestamptz not null default now(),
  constraint transactions_side_chk check (side in ('buy', 'sell')),
  constraint transactions_qty_chk check (quantity > 0 and quantity <= 10000),
  constraint transactions_price_chk check (unit_price >= 0 and fees >= 0),
  constraint transactions_text_chk check (char_length(coalesce(note, '')) <= 500 and char_length(coalesce(platform, '')) <= 60)
);
create index if not exists transactions_user_idx on public.transactions (user_id, card_id, date);

-- On ne vend pas plus d'exemplaires qu'on n'en détient à la date de la vente
create or replace function public.check_sell_quantity() returns trigger
language plpgsql as $$
declare held integer;
begin
  if new.side = 'sell' then
    select coalesce(sum(case side when 'buy' then quantity else -quantity end), 0) into held
    from public.transactions
    where user_id = new.user_id and card_id = new.card_id and date <= new.date
      and id is distinct from new.id;
    if new.quantity > held then
      raise exception 'Vente impossible : vous détenez % exemplaire(s) de cette carte à cette date', held
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists transactions_sell_chk on public.transactions;
create trigger transactions_sell_chk before insert or update on public.transactions
  for each row execute function public.check_sell_quantity();

create table if not exists public.wishlist (
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  card_id      text not null references public.cards(id),
  target_price numeric(12, 2),
  note         text,
  created_at   timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint wishlist_price_chk check (target_price is null or target_price >= 0)
);

create table if not exists public.master_sets (
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  set_id       text not null references public.sets(id),
  variant_mode text not null default 'base',
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (user_id, set_id),
  constraint master_sets_mode_chk check (variant_mode in ('base', 'master'))
);

create table if not exists public.owned_cards (
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  card_id    text not null references public.cards(id),
  variant    text not null default 'normal',
  qty        integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id, variant),
  constraint owned_variant_chk check (variant in ('normal', 'holo', 'reverse', 'first')),
  constraint owned_qty_chk check (qty between 0 and 999)
);

create table if not exists public.price_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  card_id      text not null references public.cards(id),
  direction    text not null,
  price        numeric(12, 2) not null,
  active       boolean not null default true,
  triggered_at timestamptz,
  created_at   timestamptz not null default now(),
  constraint price_alerts_dir_chk check (direction in ('above', 'below')),
  constraint price_alerts_price_chk check (price > 0)
);
create index if not exists price_alerts_user_idx on public.price_alerts (user_id);

-- ---------------------------------------------------------------------
-- 6. Modération : annonces, réglages, journal, synchros
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id         bigint generated by default as identity primary key,
  title      text not null,
  body       text,
  level      text not null default 'info',
  active     boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_level_chk check (level in ('info', 'success', 'warning', 'danger'))
);

create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.site_settings (key, value) values
  ('pro_price_month', '5.99'),
  ('pro_price_year', '49'),
  ('free_teaser_count', '5'),
  ('maintenance_mode', 'false'),
  ('maintenance_message', '"Maintenance en cours, revenez dans quelques minutes."'),
  ('featured_sets', '["sv3pt5", "sv8pt5", "cel25"]')
on conflict (key) do nothing;

create table if not exists public.audit_log (
  id           bigint generated by default as identity primary key,
  at           timestamptz not null default now(),
  actor        uuid,
  actor_pseudo text,
  action       text not null,
  target_type  text,
  target_id    text,
  details      jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

create table if not exists public.sync_runs (
  id          bigint generated by default as identity primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running',
  cards       integer,
  analysis    integer,
  history     integer,
  notes       text,
  constraint sync_runs_status_chk check (status in ('running', 'ok', 'partial', 'error'))
);

-- Journal : écrit uniquement par les fonctions ci-dessous (jamais en direct)
create or replace function public._audit(p_action text, p_type text, p_target text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (actor, actor_pseudo, action, target_type, target_id, details)
  values (auth.uid(), (select pseudo from public.profiles where id = auth.uid()), p_action, p_type, p_target, p_details);
$$;

create or replace function public.audit_table_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Actualités importées par la synchro (sans utilisateur) : pas de ligne de journal
  if tg_table_name = 'news' and auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    perform public._audit(lower(tg_table_name) || '.delete', tg_table_name,
      coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'key'), to_jsonb(old));
    return old;
  end if;
  if tg_table_name = 'announcements' and tg_op = 'UPDATE' then new.updated_at := now(); end if;
  if tg_table_name = 'site_settings' then new.updated_at := now(); new.updated_by := auth.uid(); end if;
  perform public._audit(lower(tg_table_name) || '.' || lower(tg_op), tg_table_name,
    coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'key'), to_jsonb(new));
  return new;
end $$;

drop trigger if exists announcements_audit on public.announcements;
create trigger announcements_audit before insert or update or delete on public.announcements
  for each row execute function public.audit_table_change();
drop trigger if exists site_settings_audit on public.site_settings;
create trigger site_settings_audit before insert or update or delete on public.site_settings
  for each row execute function public.audit_table_change();

-- ---------------------------------------------------------------------
-- 7. Row Level Security : activée sur TOUTES les tables
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.sets          enable row level security;
alter table public.cards         enable row level security;
alter table public.analysis      enable row level security;
alter table public.price_history enable row level security;
alter table public.transactions  enable row level security;
alter table public.wishlist      enable row level security;
alter table public.master_sets   enable row level security;
alter table public.owned_cards   enable row level security;
alter table public.price_alerts  enable row level security;
alter table public.announcements enable row level security;
alter table public.site_settings enable row level security;
alter table public.audit_log     enable row level security;
alter table public.sync_runs     enable row level security;

-- Profils : chacun lit le sien, les modérateurs lisent tout ; on ne modifie
-- soi-même que le pseudo (droits par colonne). Rôle, offre, échéance et
-- bannissement passent par les fonctions mod_* (contrôlées) ou le webhook Stripe.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_moderator());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (pseudo, last_seen) on public.profiles to authenticated;

-- Catalogue : lecture publique, aucune écriture depuis le site
drop policy if exists sets_read on public.sets;
create policy sets_read on public.sets for select to anon, authenticated using (true);
drop policy if exists cards_read on public.cards;
create policy cards_read on public.cards for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.sets, public.cards from anon, authenticated;
grant select on public.sets, public.cards to anon, authenticated;
revoke all on public.set_overview from anon, authenticated;
grant select on public.set_overview to anon, authenticated;

-- Pro : l'analyse (signaux, scores, estimations) est réservée aux abonnés Pro et aux modérateurs
drop policy if exists analysis_pro_read on public.analysis;
create policy analysis_pro_read on public.analysis for select to authenticated
  using (public.has_pro_access());
revoke all on public.analysis from anon;
-- Historique des cotes : public, comme la cote (visiteurs compris). L'ancienne règle Pro est retirée.
drop policy if exists price_history_pro_read on public.price_history;
drop policy if exists price_history_read on public.price_history;
create policy price_history_read on public.price_history for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.analysis, public.price_history from anon, authenticated;
grant select on public.analysis to authenticated;
grant select on public.price_history to anon, authenticated;
revoke all on public.market_view from anon;
grant select on public.market_view to authenticated;

-- Données personnelles : propriétaire uniquement (comptes bannis : lecture seule)
do $$
declare t text;
begin
  foreach t in array array['transactions', 'wishlist', 'master_sets', 'owned_cards'] loop
    execute format('drop policy if exists %1$s_own_select on public.%1$s', t);
    execute format('create policy %1$s_own_select on public.%1$s for select to authenticated using (user_id = auth.uid())', t);
    execute format('drop policy if exists %1$s_own_insert on public.%1$s', t);
    execute format('create policy %1$s_own_insert on public.%1$s for insert to authenticated with check (user_id = auth.uid() and not public.is_banned())', t);
    execute format('drop policy if exists %1$s_own_update on public.%1$s', t);
    execute format('create policy %1$s_own_update on public.%1$s for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and not public.is_banned())', t);
    execute format('drop policy if exists %1$s_own_delete on public.%1$s', t);
    execute format('create policy %1$s_own_delete on public.%1$s for delete to authenticated using (user_id = auth.uid())', t);
    execute format('revoke all on public.%1$s from anon', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;

-- Alertes de prix : tout compte (gratuit compris), propriétaire uniquement ; comptes suspendus en lecture seule
drop policy if exists price_alerts_own_select on public.price_alerts;
create policy price_alerts_own_select on public.price_alerts for select to authenticated
  using (user_id = auth.uid());
drop policy if exists price_alerts_own_insert on public.price_alerts;
create policy price_alerts_own_insert on public.price_alerts for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned());
drop policy if exists price_alerts_own_update on public.price_alerts;
create policy price_alerts_own_update on public.price_alerts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and not public.is_banned());
drop policy if exists price_alerts_own_delete on public.price_alerts;
create policy price_alerts_own_delete on public.price_alerts for delete to authenticated
  using (user_id = auth.uid());
revoke all on public.price_alerts from anon;
grant select, insert, update, delete on public.price_alerts to authenticated;

-- Annonces : les actives sont publiques, les modérateurs gèrent tout
drop policy if exists announcements_read on public.announcements;
create policy announcements_read on public.announcements for select to anon, authenticated
  using ((active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
         or public.is_moderator());
drop policy if exists announcements_mod_insert on public.announcements;
create policy announcements_mod_insert on public.announcements for insert to authenticated
  with check (public.is_moderator());
drop policy if exists announcements_mod_update on public.announcements;
create policy announcements_mod_update on public.announcements for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());
drop policy if exists announcements_mod_delete on public.announcements;
create policy announcements_mod_delete on public.announcements for delete to authenticated
  using (public.is_moderator());
revoke insert, update, delete, truncate on public.announcements from anon;
grant select on public.announcements to anon;
grant select, insert, update, delete on public.announcements to authenticated;

-- Réglages du site : lecture publique (prix affichés…), écriture modérateurs
drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists site_settings_mod_insert on public.site_settings;
create policy site_settings_mod_insert on public.site_settings for insert to authenticated
  with check (public.is_moderator());
drop policy if exists site_settings_mod_update on public.site_settings;
create policy site_settings_mod_update on public.site_settings for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());
revoke insert, update, delete, truncate on public.site_settings from anon;
revoke delete, truncate on public.site_settings from authenticated;
grant select on public.site_settings to anon;
grant select, insert, update on public.site_settings to authenticated;

-- Journal et synchros : lecture modérateurs, écriture serveur uniquement
drop policy if exists audit_log_mod_read on public.audit_log;
create policy audit_log_mod_read on public.audit_log for select to authenticated using (public.is_moderator());
drop policy if exists sync_runs_mod_read on public.sync_runs;
create policy sync_runs_mod_read on public.sync_runs for select to authenticated using (public.is_moderator());
revoke all on public.audit_log, public.sync_runs from anon;
revoke insert, update, delete, truncate on public.audit_log, public.sync_runs from authenticated;
grant select on public.audit_log, public.sync_runs to authenticated;

-- ---------------------------------------------------------------------
-- 8. Fonctions publiques : état des données et aperçu gratuit du marché
-- ---------------------------------------------------------------------
create or replace function public.public_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'cards', (select count(*) from public.cards),
    'analyzed', (select count(*) from public.analysis),
    'sets', (select count(*) from public.sets),
    'last_price_date', (select max(price_date) from public.cards),
    'last_sync', (select finished_at from public.sync_runs where status in ('ok', 'partial')
                  order by finished_at desc nulls last limit 1));
$$;

-- Aperçu : les N cartes les mieux placées ce matin, avec leur cote (ni raisons, ni estimations).
-- Le signal et le score ne sont renvoyés qu'à Pro / modérateurs (null pour tous les autres).
-- N = réglage free_teaser_count, 10 au maximum.
create or replace function public.market_teaser()
returns table (card_id text, name text, set_name text, lang text, image_small text,
               price numeric, signal text, buy_score numeric)
language sql stable security definer set search_path = public as $$
  select a.card_id, c.name, c.set_name, c.lang, c.image_small, c.price,
         case when public.has_pro_access() then a.signal end,
         case when public.has_pro_access() then a.buy_score end
  from public.analysis a join public.cards c on c.id = a.card_id
  where c.price >= 50 and a.signal in ('ACHAT FORT', 'ACHAT')
  order by a.buy_score desc, a.confidence desc nulls last
  limit least(10, greatest(0, coalesce(
    (select (value #>> '{}')::int from public.site_settings where key = 'free_teaser_count'), 5)));
$$;

-- ---------------------------------------------------------------------
-- 9. Performance des portefeuilles (FIFO) pour les KPI modérateurs
--    Coût FIFO des ventes = coût des N premiers exemplaires achetés.
-- ---------------------------------------------------------------------
-- Positions par membre et par carte (base des KPI, du classement public et des portefeuilles partagés)
create or replace function public._positions_all()
returns table (user_id uuid, card_id text, bought numeric, held numeric, cost_all numeric, cost_sold numeric,
               rem_cost numeric, proceeds numeric, price numeric)
language sql stable security definer set search_path = public as $$
  with b as (
    select t.user_id, t.card_id, t.quantity as q, (t.unit_price + t.fees / t.quantity) as uc,
           sum(t.quantity) over (partition by t.user_id, t.card_id order by t.date, t.created_at, t.id) as cum
    from public.transactions t where t.side = 'buy'),
  s as (
    select t.user_id, t.card_id, sum(t.quantity) as sold, sum(t.unit_price * t.quantity - t.fees) as proceeds
    from public.transactions t where t.side = 'sell' group by 1, 2),
  pc as (
    select b.user_id, b.card_id, sum(b.q) as bought, sum(b.q * b.uc) as cost_all,
           sum(greatest(0, least(b.q, coalesce(s.sold, 0) - (b.cum - b.q))) * b.uc) as cost_sold,
           max(coalesce(s.sold, 0)) as sold, max(coalesce(s.proceeds, 0)) as proceeds
    from b left join s on s.user_id = b.user_id and s.card_id = b.card_id
    group by 1, 2)
  select pc.user_id, pc.card_id, pc.bought, greatest(0, pc.bought - pc.sold), pc.cost_all, pc.cost_sold,
         pc.cost_all - pc.cost_sold, pc.proceeds, c.price
  from pc left join public.cards c on c.id = pc.card_id;
$$;

create or replace function public._portfolio_all()
returns table (user_id uuid, trades integer, invested numeric, realized numeric, latent numeric, value numeric)
language sql stable security definer set search_path = public as $$
  with agg as (
    select pp.user_id, sum(pp.cost_all) as invested, sum(pp.proceeds - pp.cost_sold) as realized,
           sum(coalesce(pp.held * pp.price, pp.rem_cost) - pp.rem_cost) as latent,
           sum(coalesce(pp.held * pp.price, pp.rem_cost)) as value
    from public._positions_all() pp group by 1),
  tr as (select t.user_id, count(*)::int as trades from public.transactions t group by 1)
  select agg.user_id, tr.trades, round(agg.invested, 2), round(agg.realized, 2), round(agg.latent, 2), round(agg.value, 2)
  from agg join tr on tr.user_id = agg.user_id;
$$;

-- ---------------------------------------------------------------------
-- 10. KPI modérateurs (refusés à tous les autres)
-- ---------------------------------------------------------------------
create or replace function public._require_moderator() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_moderator() then
    raise exception 'Accès réservé aux modérateurs' using errcode = '42501';
  end if;
end $$;

create or replace function public.kpi_overview() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  pm numeric := coalesce((select (value #>> '{}')::numeric from public.site_settings where key = 'pro_price_month'), 0);
  py numeric := coalesce((select (value #>> '{}')::numeric from public.site_settings where key = 'pro_price_year'), 0);
  r json;
begin
  perform public._require_moderator();
  with p as (
    select *, (plan = 'pro' and not banned and (pro_until is null or pro_until > now())) as active_pro
    from public.profiles),
  k as (
    select count(*) as users,
           count(*) filter (where active_pro) as pro,
           count(*) filter (where active_pro and pro_interval = 'month') as pro_month,
           count(*) filter (where active_pro and pro_interval = 'year') as pro_year,
           count(*) filter (where active_pro and coalesce(pro_interval, 'manual') = 'manual') as pro_manual,
           count(*) filter (where created_at > now() - interval '7 days') as new7,
           count(*) filter (where created_at > now() - interval '30 days') as new30,
           count(*) filter (where not active_pro and pro_until between now() - interval '30 days' and now()) as churn30,
           count(*) filter (where last_seen > now() - interval '7 days') as active7,
           count(*) filter (where banned) as banned,
           count(*) filter (where role in ('moderator', 'admin')) as staff
    from p)
  select json_build_object(
    'users', users, 'pro', pro, 'pro_month', pro_month, 'pro_year', pro_year, 'pro_manual', pro_manual,
    'new7', new7, 'new30', new30, 'churn30', churn30, 'active7', active7, 'banned', banned, 'staff', staff,
    'price_month', pm, 'price_year', py,
    'mrr', round(pro_month * pm + pro_year * py / 12, 2),
    'conversion', case when users > 0 then round(pro::numeric / users * 100, 1) else 0 end,
    'churn_rate', case when pro + churn30 > 0 then round(churn30::numeric / (pro + churn30) * 100, 1) else 0 end)
  into r from k;
  return r;
end $$;

create or replace function public.kpi_timeseries(n_weeks integer default 26)
returns table (week_start date, signups integer, pro_active integer)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_moderator();
  return query
  with w as (
    select gs as ws from generate_series(
      date_trunc('week', now()) - make_interval(weeks => greatest(1, least(n_weeks, 260)) - 1),
      date_trunc('week', now()), interval '1 week') gs)
  select w.ws::date,
         (select count(*)::int from public.profiles p
           where p.created_at >= w.ws and p.created_at < w.ws + interval '1 week'),
         (select count(*)::int from public.profiles p
           where p.pro_since is not null and p.pro_since < w.ws + interval '1 week'
             and (p.pro_until is null or p.pro_until >= least(w.ws + interval '1 week', now())))
  from w order by 1;
end $$;

create or replace function public.kpi_top_users(lim integer default 20)
returns table (rank integer, user_id uuid, pseudo text, plan text, trades integer, invested numeric,
               realized numeric, latent numeric, pnl numeric, pnl_pct numeric, value numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_moderator();
  return query
  select (row_number() over (order by (x.realized + x.latent) desc))::int, x.user_id, p.pseudo, p.plan, x.trades,
         x.invested, x.realized, x.latent, x.realized + x.latent,
         case when x.invested > 0 then round((x.realized + x.latent) / x.invested * 100, 1) end, x.value
  from public._portfolio_all() x join public.profiles p on p.id = x.user_id
  where not p.banned
  order by (x.realized + x.latent) desc
  limit greatest(1, least(lim, 100));
end $$;

-- ---------------------------------------------------------------------
-- 11. Gestion des utilisateurs (modérateurs), toutes journalisées
-- ---------------------------------------------------------------------
create or replace function public.mod_search_users(q text default '', lim integer default 50, page_offset integer default 0)
returns table (id uuid, pseudo text, email_masked text, role text, plan text, pro_until timestamptz,
               banned boolean, created_at timestamptz, last_seen timestamptz, total bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_moderator();
  return query
  select p.id, p.pseudo,
         regexp_replace(coalesce(p.email, ''), '^(.).*(@.*)$', '\1•••\2'),
         p.role, p.plan, p.pro_until, p.banned, p.created_at, p.last_seen, count(*) over ()
  from public.profiles p
  where coalesce(q, '') = '' or p.pseudo ilike '%' || q || '%' or p.email ilike '%' || q || '%' or p.id::text = q
  order by p.created_at desc
  limit greatest(1, least(lim, 200)) offset greatest(0, page_offset);
end $$;

create or replace function public.mod_user_detail(target uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  perform public._require_moderator();
  select json_build_object(
    'profile', to_jsonb(p) - 'stripe_customer_id' || jsonb_build_object('has_stripe', p.stripe_customer_id is not null),
    'portfolio', (select to_jsonb(x) from public._portfolio_all() x where x.user_id = p.id),
    'counts', json_build_object(
      'wishlist', (select count(*) from public.wishlist w where w.user_id = p.id),
      'master_sets', (select count(*) from public.master_sets m where m.user_id = p.id),
      'alerts', (select count(*) from public.price_alerts a where a.user_id = p.id)),
    'audit', (select coalesce(json_agg(l order by l.at desc), '[]'::json) from (
      select at, actor_pseudo, action, details from public.audit_log
      where target_type = 'profiles' and target_id = p.id::text order by at desc limit 20) l))
  into r from public.profiles p where p.id = target;
  if r is null then raise exception 'Utilisateur introuvable' using errcode = 'P0002'; end if;
  perform public._audit('profiles.view', 'profiles', target::text, null);
  return r;
end $$;

-- Pro manuel : until_ts dans le futur = accorde Pro jusqu'à cette date ; null ou passé = retire
create or replace function public.mod_set_pro(target uuid, until_ts timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  perform public._require_moderator();
  select * into p from public.profiles where id = target for update;
  if not found then raise exception 'Utilisateur introuvable' using errcode = 'P0002'; end if;
  if until_ts is not null and until_ts > now() then
    update public.profiles set plan = 'pro', pro_until = until_ts,
      pro_since = case when p.plan = 'pro' and (p.pro_until is null or p.pro_until > now()) then coalesce(p.pro_since, now()) else now() end,
      pro_interval = case when p.plan = 'pro' and p.pro_interval in ('month', 'year') and (p.pro_until is null or p.pro_until > now())
                          then p.pro_interval else 'manual' end
    where id = target;
    perform public._audit('profiles.grant_pro', 'profiles', target::text, jsonb_build_object('until', until_ts, 'before', p.pro_until));
  else
    update public.profiles set plan = 'free',
      pro_until = case when p.pro_until is null or p.pro_until > now() then now() else p.pro_until end
    where id = target;
    perform public._audit('profiles.revoke_pro', 'profiles', target::text, jsonb_build_object('before', p.pro_until));
  end if;
end $$;

-- Rôles : seul un admin nomme ou retire un modérateur ou un admin ;
-- personne ne change son propre rôle.
create or replace function public.mod_set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  perform public._require_moderator();
  if new_role not in ('user', 'moderator', 'admin') then
    raise exception 'Rôle inconnu : %', new_role using errcode = '22023';
  end if;
  if target = auth.uid() then
    raise exception 'Vous ne pouvez pas changer votre propre rôle' using errcode = '42501';
  end if;
  select role into cur from public.profiles where id = target for update;
  if cur is null then raise exception 'Utilisateur introuvable' using errcode = 'P0002'; end if;
  if (new_role in ('moderator', 'admin') or cur in ('moderator', 'admin')) and not public.is_admin() then
    raise exception 'Seul un admin peut nommer ou retirer un modérateur' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target;
  perform public._audit('profiles.set_role', 'profiles', target::text, jsonb_build_object('from', cur, 'to', new_role));
end $$;

create or replace function public.mod_set_banned(target uuid, ban boolean, reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare cur text;
begin
  perform public._require_moderator();
  if target = auth.uid() then
    raise exception 'Vous ne pouvez pas vous bannir vous-même' using errcode = '42501';
  end if;
  select role into cur from public.profiles where id = target for update;
  if cur is null then raise exception 'Utilisateur introuvable' using errcode = 'P0002'; end if;
  if cur in ('moderator', 'admin') and not public.is_admin() then
    raise exception 'Seul un admin peut bannir un modérateur' using errcode = '42501';
  end if;
  update public.profiles set banned = ban, ban_reason = case when ban then left(reason, 300) end where id = target;
  perform public._audit(case when ban then 'profiles.ban' else 'profiles.unban' end, 'profiles', target::text,
    jsonb_build_object('reason', reason));
end $$;

create or replace function public.mod_data_health() returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  perform public._require_moderator();
  select json_build_object(
    'cards', (select count(*) from public.cards),
    'cards_priced', (select count(*) from public.cards where price is not null),
    'sets', (select count(*) from public.sets),
    'analysis', (select count(*) from public.analysis),
    'analysis_updated', (select max(updated_at) from public.analysis),
    'history_rows', (select count(*) from public.price_history),
    'history_last', (select max(date) from public.price_history),
    'last_price_date', (select max(price_date) from public.cards),
    'langs', (select json_object_agg(lang, n) from (select lang, count(*) n from public.cards group by lang) x))
  into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 12. Fonctions du compte
-- ---------------------------------------------------------------------
-- Suppression du compte et de toutes ses données (RGPD)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'Non connecté' using errcode = '42501'; end if;
  if p.plan = 'pro' and p.pro_interval in ('month', 'year') and (p.pro_until is null or p.pro_until > now()) then
    raise exception 'Résiliez d''abord votre abonnement (Mon abonnement > Gérer)' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- 13. Fonctions réservées à la synchro (clé service_role)
-- ---------------------------------------------------------------------
create or replace function public.site_tracked_cards() returns table (card_id text)
language sql stable security definer set search_path = public as $$
  select card_id from public.transactions union
  select card_id from public.wishlist union
  select card_id from public.price_alerts where active union
  select card_id from public.owned_cards where qty > 0;
$$;

-- Déclenche les alertes actives de tous les comptes (gratuits compris : aucune condition d'offre)
create or replace function public.check_price_alerts() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.price_alerts a set triggered_at = now()
  from public.cards c
  where c.id = a.card_id and a.active and a.triggered_at is null and c.price is not null
    and ((a.direction = 'above' and c.price >= a.price) or (a.direction = 'below' and c.price <= a.price));
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 14. Droits d'exécution des fonctions
-- ---------------------------------------------------------------------
revoke execute on function public._audit(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public._portfolio_all() from public, anon, authenticated;
revoke execute on function public._positions_all() from public, anon, authenticated;
revoke execute on function public._require_moderator() from public, anon, authenticated;
revoke execute on function public.site_tracked_cards() from public, anon, authenticated;
revoke execute on function public.check_price_alerts() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email() from public, anon, authenticated;
revoke execute on function public.audit_table_change() from public, anon, authenticated;
grant execute on function public.site_tracked_cards() to service_role;
grant execute on function public.check_price_alerts() to service_role;

grant execute on function public.public_status() to anon, authenticated;
grant execute on function public.market_teaser() to anon, authenticated;
grant execute on function public.is_pro(), public.is_moderator(), public.is_admin(), public.has_pro_access(),
  public.is_banned() to anon, authenticated;

revoke execute on function public.kpi_overview(), public.kpi_timeseries(integer), public.kpi_top_users(integer),
  public.mod_search_users(text, integer, integer), public.mod_user_detail(uuid), public.mod_set_pro(uuid, timestamptz),
  public.mod_set_role(uuid, text), public.mod_set_banned(uuid, boolean, text), public.mod_data_health(),
  public.delete_my_account() from public, anon;
grant execute on function public.kpi_overview(), public.kpi_timeseries(integer), public.kpi_top_users(integer),
  public.mod_search_users(text, integer, integer), public.mod_user_detail(uuid), public.mod_set_pro(uuid, timestamptz),
  public.mod_set_role(uuid, text), public.mod_set_banned(uuid, boolean, text), public.mod_data_health(),
  public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- 15. Portefeuilles partagés, performances et actualités du bandeau
--     Partage : désactivé par défaut, chaque membre l'active dans Profil.
--     Sans « share_amounts », seuls les pourcentages sont publiés (aucun montant en euros).
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists share_portfolio boolean not null default false;
alter table public.profiles add column if not exists share_amounts boolean not null default false;
alter table public.profiles add column if not exists share_slug text;
alter table public.profiles add column if not exists avatar_url text; -- photo de profil (membres Pro, section 17)
update public.profiles set share_slug = substr(md5(id::text || random()::text), 1, 10) where share_slug is null;
alter table public.profiles alter column share_slug set default substr(md5(random()::text), 1, 10);
create unique index if not exists profiles_share_slug_idx on public.profiles (share_slug);
grant update (pseudo, last_seen, share_portfolio, share_amounts) on public.profiles to authenticated;

-- Une photo par jour de chaque portefeuille (écrite par la synchro : snapshot_portfolios).
-- La courbe de performance est une fonction Pro : son propriétaire la lit s'il a l'accès Pro.
create table if not exists public.portfolio_snapshots (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  date     date not null,
  value    numeric(12,2) not null,
  invested numeric(12,2) not null,
  pnl      numeric(12,2) not null,
  pnl_pct  numeric(8,1),
  primary key (user_id, date)
);
alter table public.portfolio_snapshots enable row level security;
drop policy if exists portfolio_snapshots_own on public.portfolio_snapshots;
create policy portfolio_snapshots_own on public.portfolio_snapshots for select to authenticated
  using (user_id = auth.uid() and public.has_pro_access());
revoke all on public.portfolio_snapshots from anon;
revoke insert, update, delete, truncate on public.portfolio_snapshots from authenticated;
grant select on public.portfolio_snapshots to authenticated;

create or replace function public.snapshot_portfolios() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.portfolio_snapshots (user_id, date, value, invested, pnl, pnl_pct)
  select x.user_id, current_date, x.value, x.invested, x.realized + x.latent,
         case when x.invested > 0 then round((x.realized + x.latent) / x.invested * 100, 1) end
  from public._portfolio_all() x
  on conflict (user_id, date) do update set value = excluded.value, invested = excluded.invested,
    pnl = excluded.pnl, pnl_pct = excluded.pnl_pct;
  get diagnostics n = row_count;
  return n;
end $$;

-- Classement des collectionneurs qui partagent leur portefeuille (20 € investis au minimum).
-- Visible des seuls modérateurs : pour tout autre lecteur, la liste est vide.
create or replace function public.public_leaderboard(lim integer default 50)
returns table (rank integer, slug text, pseudo text, pro boolean, member_since timestamptz, cards integer,
               trades integer, pnl_pct numeric, value numeric, pnl numeric,
               top_card_id text, top_name text, top_image text)
language sql stable security definer set search_path = public as $$
  with p as (select * from public.profiles where share_portfolio and not banned and public.is_moderator()),
  q as (select q.* from public._positions_all() q join p on p.id = q.user_id),
  x as (select a.* from public._portfolio_all() a join p on p.id = a.user_id where a.invested >= 20),
  pos as (select q.user_id, sum(q.held)::int as cards from q group by 1),
  top as (select distinct on (q.user_id) q.user_id, q.card_id, c.name, c.image_small
          from q join public.cards c on c.id = q.card_id where q.held > 0
          order by q.user_id, q.held * coalesce(q.price, 0) desc, q.card_id)
  select (row_number() over (order by (x.realized + x.latent) / x.invested desc, p.share_slug))::int,
         p.share_slug, p.pseudo, (p.plan = 'pro' and (p.pro_until is null or p.pro_until > now())), p.created_at,
         coalesce(pos.cards, 0), x.trades, round((x.realized + x.latent) / x.invested * 100, 1),
         case when p.share_amounts then x.value end, case when p.share_amounts then x.realized + x.latent end,
         top.card_id, top.name, top.image_small
  from x join p on p.id = x.user_id left join pos on pos.user_id = x.user_id left join top on top.user_id = x.user_id
  order by 1 limit greatest(1, least(lim, 100));
$$;

-- Portefeuille partagé d'un membre (null si le lien n'existe pas ou si le partage est coupé)
create or replace function public.public_portfolio(slug text) returns json
language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; x record; r json;
begin
  select * into p from public.profiles pr where pr.share_slug = slug and pr.share_portfolio and not pr.banned;
  if not found then return null; end if;
  select a.trades, a.invested, a.realized, a.latent, a.value into x from public._portfolio_all() a where a.user_id = p.id;
  select json_build_object(
    'slug', p.share_slug, 'pseudo', p.pseudo, 'avatar_url', p.avatar_url, 'member_since', p.created_at, 'amounts', p.share_amounts,
    'pro', (p.plan = 'pro' and (p.pro_until is null or p.pro_until > now())),
    'trades', coalesce(x.trades, 0),
    'invested', case when p.share_amounts then x.invested end,
    'value', case when p.share_amounts then x.value end,
    'pnl', case when p.share_amounts then x.realized + x.latent end,
    'realized', case when p.share_amounts then x.realized end,
    'pnl_pct', case when x.invested > 0 then round((x.realized + x.latent) / x.invested * 100, 1) end,
    'rank', (select l.rank from public.public_leaderboard(100) l where l.slug = p.share_slug),
    'positions', coalesce((
      select json_agg(json_build_object('card_id', q.card_id, 'name', c.name, 'set_id', c.set_id, 'set_name', c.set_name,
        'number', c.number, 'rarity', c.rarity, 'lang', c.lang, 'image_small', c.image_small, 'qty', q.held, 'price', q.price,
        'perf_pct', case when q.rem_cost > 0 and q.price is not null then round((q.held * q.price - q.rem_cost) / q.rem_cost * 100, 1) end,
        'value', case when p.share_amounts then round(q.held * q.price, 2) end)
        order by q.held * coalesce(q.price, 0) desc, q.card_id)
      from public._positions_all() q join public.cards c on c.id = q.card_id
      where q.user_id = p.id and q.held > 0), '[]'::json),
    'series', coalesce((
      select json_agg(json_build_object('date', s.date, 'pnl_pct', s.pnl_pct,
        'value', case when p.share_amounts then s.value end) order by s.date)
      from public.portfolio_snapshots s where s.user_id = p.id and s.date > current_date - 365), '[]'::json)
  ) into r;
  return r;
end $$;

-- Actualités du bandeau : écrites par la synchro (flux RSS) ou par les modérateurs
create table if not exists public.news (
  id           bigint generated by default as identity primary key,
  title        text not null,
  url          text,
  source       text,
  lang         text not null default 'FR',
  kind         text not null default 'news',
  published_at timestamptz not null default now(),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint news_title_chk check (char_length(title) between 3 and 300),
  constraint news_url_chk check (url is null or url ~ '^https?://'),
  constraint news_kind_chk check (kind in ('news', 'release', 'event', 'site'))
);
create unique index if not exists news_url_idx on public.news (url);
create index if not exists news_published_idx on public.news (published_at desc);
alter table public.news enable row level security;
drop policy if exists news_read on public.news;
create policy news_read on public.news for select to anon, authenticated using (active or public.is_moderator());
drop policy if exists news_mod_insert on public.news;
create policy news_mod_insert on public.news for insert to authenticated with check (public.is_moderator());
drop policy if exists news_mod_update on public.news;
create policy news_mod_update on public.news for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());
drop policy if exists news_mod_delete on public.news;
create policy news_mod_delete on public.news for delete to authenticated using (public.is_moderator());
revoke insert, update, delete, truncate on public.news from anon;
grant select on public.news to anon;
grant select, insert, update, delete on public.news to authenticated;
drop trigger if exists news_audit on public.news;
create trigger news_audit before insert or update or delete on public.news
  for each row execute function public.audit_table_change();

revoke execute on function public.snapshot_portfolios() from public, anon, authenticated;
grant execute on function public.snapshot_portfolios() to service_role;
revoke execute on function public.public_leaderboard(integer) from public, anon;
grant execute on function public.public_leaderboard(integer) to authenticated;
grant execute on function public.public_portfolio(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 16. Découverte Pro : un compte gratuit dévoile toutes les données Pro de 5 cartes
--     (réglage free_reveals). Une carte déjà dévoilée le reste ; au-delà, l'abonnement.
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value) values ('free_reveals', '5') on conflict (key) do nothing;

create table if not exists public.pro_reveals (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  card_id     text not null references public.cards(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (user_id, card_id)
);
alter table public.pro_reveals enable row level security;
drop policy if exists pro_reveals_own on public.pro_reveals;
create policy pro_reveals_own on public.pro_reveals for select to authenticated using (user_id = auth.uid());
revoke all on public.pro_reveals from anon;
revoke insert, update, delete, truncate on public.pro_reveals from authenticated;
grant select on public.pro_reveals to authenticated;

create or replace function public._reveal_limit() returns integer
language sql stable security definer set search_path = public as $$
  select greatest(0, least(50, coalesce((select (value #>> '{}')::int from public.site_settings where key = 'free_reveals'), 5)));
$$;

-- Cartes déjà dévoilées et quota restant
create or replace function public.reveal_status() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('limit', public._reveal_limit(),
    'used', (select count(*) from public.pro_reveals r where r.user_id = auth.uid()),
    'cards', coalesce((select json_agg(r.card_id order by r.revealed_at) from public.pro_reveals r where r.user_id = auth.uid()), '[]'::json));
$$;

-- Dévoile une carte : analyse complète et historique. Ne consomme rien pour un membre Pro,
-- pour une carte déjà dévoilée, ni pour une carte sans analyse.
create or replace function public.reveal_card(cid text) returns json
language plpgsql security definer set search_path = public as $$
declare lim integer := public._reveal_limit(); used integer; a json;
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '28000'; end if;
  if public.is_banned() then raise exception 'Compte suspendu' using errcode = '42501'; end if;
  select row_to_json(m) into a from public.market_view m where m.card_id = cid;
  if a is not null and not public.has_pro_access()
     and not exists (select 1 from public.pro_reveals r where r.user_id = auth.uid() and r.card_id = cid) then
    select count(*) into used from public.pro_reveals r where r.user_id = auth.uid();
    if used >= lim then raise exception 'reveal_quota' using errcode = 'P0001', hint = 'Toutes les découvertes gratuites sont utilisées'; end if;
    insert into public.pro_reveals (user_id, card_id) values (auth.uid(), cid);
  end if;
  return json_build_object('analysis', a,
    'history', case when a is null then '[]'::json else coalesce((select json_agg(json_build_array(h.date, h.price) order by h.date)
      from public.price_history h where h.card_id = cid), '[]'::json) end,
    'used', (select count(*) from public.pro_reveals r where r.user_id = auth.uid()), 'limit', lim);
end $$;

revoke execute on function public._reveal_limit(), public.reveal_status(), public.reveal_card(text) from public, anon;
grant execute on function public.reveal_status(), public.reveal_card(text) to authenticated;

-- ---------------------------------------------------------------------
-- 17. Photo de profil (membres Pro) et hausses / baisses de la semaine
-- ---------------------------------------------------------------------
-- Bucket public « avatars » : JPG, PNG ou GIF, 2 Mo au plus. Chaque membre Pro écrit
-- seulement dans son dossier (<son id>/…) ; tout le monde peut lire les images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- (le remplacement d'une photo existante demande aussi le droit de lire son propre dossier)
drop policy if exists avatars_own_select on storage.objects;
create policy avatars_own_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_pro_insert on storage.objects;
create policy avatars_pro_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.has_pro_access() and not public.is_banned());
drop policy if exists avatars_pro_update on storage.objects;
create policy avatars_pro_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.has_pro_access() and not public.is_banned());
drop policy if exists avatars_own_delete on storage.objects;
create policy avatars_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Enregistre la photo (ou l'efface avec null). L'adresse doit pointer vers le dossier du membre dans
-- le bucket avatars : impossible d'afficher une image venue d'ailleurs.
create or replace function public.set_avatar(url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '28000'; end if;
  if public.is_banned() then raise exception 'Compte suspendu' using errcode = '42501'; end if;
  if url is not null then
    if not public.has_pro_access() then raise exception 'La photo de profil est réservée aux membres Pro.' using errcode = '42501'; end if;
    if url !~ ('^https://[^/]+/storage/v1/object/public/avatars/' || auth.uid()::text || '/avatar\.(jpg|png|gif)(\?v=[0-9]+)?$') then
      raise exception 'Adresse d''image refusée' using errcode = '22023';
    end if;
  end if;
  update public.profiles set avatar_url = url where id = auth.uid();
end $$;
revoke execute on function public.set_avatar(text) from public, anon;
grant execute on function public.set_avatar(text) to authenticated;

-- Hausses et baisses de la semaine (accueil, public) : dernière cote contre celle d'il y a 7 jours,
-- cartes cotées 5 € ou plus il y a 7 jours. Lit seulement les tables publiques cards et price_history.
create or replace function public.week_movers(lim integer default 5)
returns table (dir text, card_id text, name text, set_name text, number text, lang text, image_small text,
               price numeric, prev numeric, pct numeric)
language sql stable set search_path = public as $$
  with d as (select max(date) as last from public.price_history),
  cur as (select distinct on (h.card_id) h.card_id, h.price from public.price_history h, d
          where h.date between d.last - 2 and d.last order by h.card_id, h.date desc, h.source),
  old as (select distinct on (h.card_id) h.card_id, h.price from public.price_history h, d
          where h.date between d.last - 9 and d.last - 7 order by h.card_id, h.date desc, h.source),
  m as (select c.id, c.name, c.set_name, c.number, c.lang, c.image_small, cur.price, old.price as prev,
               round((cur.price / old.price - 1) * 100, 1) as pct
        from cur join old using (card_id) join public.cards c on c.id = cur.card_id
        where old.price >= 5 and cur.price > 0)
  (select 'up', id, name, set_name, number, lang, image_small, price, prev, pct from m where pct > 0
   order by pct desc, id limit least(greatest(lim, 1), 20))
  union all
  (select 'down', id, name, set_name, number, lang, image_small, price, prev, pct from m where pct < 0
   order by pct asc, id limit least(greatest(lim, 1), 20));
$$;
grant execute on function public.week_movers(integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Pour devenir admin (une seule fois, après vous être inscrit sur le site) :
--   update public.profiles set role = 'admin' where email = 'votre@email.fr';
-- ---------------------------------------------------------------------
