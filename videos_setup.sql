-- ============================================================
-- VENECIA — VIDEOS (add-on, run ONCE)
-- Supabase Dashboard > SQL Editor > New query > paste > Run
--
-- Adds ONE new table. It does not touch packages, inquiries,
-- clients, payments, gallery, the client_balances view, or any
-- existing policy. Safe to run on the live project.
--
-- Videos are hosted on YouTube (free, fast, adaptive quality).
-- We only store the 11-character YouTube video ID.
-- ============================================================

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  -- the check guarantees only a real-shaped YouTube ID can ever be stored,
  -- so nothing else can be injected into the player URL on the website
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text,
  category text not null default 'other'
    check (category in ('weddings','quinceaneras','sweet16','other','venue')),
  is_vertical boolean not null default false,  -- YouTube Shorts play in a tall frame
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

alter table videos enable row level security;

-- same rules as the photo gallery: public reads active, admin manages
create policy "public read active videos"
  on videos for select
  using (active = true);

create policy "auth full access videos"
  on videos for all
  to authenticated
  using (true) with check (true);
