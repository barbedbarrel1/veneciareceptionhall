-- ============================================================
-- VENECIA RECEPTION HALL — SUPABASE SETUP
-- Run this entire file in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Packages: the templates. Website reads these, admin edits them.
create table packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_price numeric(10,2) not null,
  description text,
  included_items text[],            -- array of strings for the checklist on packages.html
  is_popular boolean default false, -- drives the "most popular" badge
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- Inquiries: public website form writes here. Anonymous inserts allowed.
create table inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  event_type text,
  event_date date,
  guest_count int,
  message text,
  status text not null default 'new'
    check (status in ('new','contacted','booked','lost')),
  converted_client_id uuid,         -- set when converted, proves website ROI
  created_at timestamptz default now()
);

-- Clients: booked business. contract_price is SNAPSHOTTED at booking
-- so future package price changes never shift existing balances.
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  event_type text,
  event_date date not null,
  package_id uuid references packages(id),
  contract_price numeric(10,2) not null,
  status text not null default 'active'
    check (status in ('active','completed','cancelled')),
  notes text,
  created_at timestamptz default now()
);

-- Payments: append-only ledger. Never edit history — add rows.
-- Credits (client removed something) = positive amounts with type 'credit'.
create table payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) not null,
  amount numeric(10,2) not null,    -- sign set by type: see payments_amount_sign_check
  type text not null default 'payment'
    check (type in ('deposit','payment','credit','refund')),
  method text,                       -- cash, zelle, card, check...
  note text,
  paid_at date not null default current_date,
  created_at timestamptz default now(),
  -- balance = contract - sum(amount): deposits/payments/credits lower it (positive),
  -- refunds are money handed back (negative). A wrong sign can't be saved.
  constraint payments_amount_sign_check check (
    (type in ('deposit','payment','credit') and amount > 0)
    or (type = 'refund' and amount < 0)
  )
);

-- Gallery: powers gallery.html, managed from admin Settings tab.
create table gallery (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  category text not null default 'venue'
    check (category in ('weddings','quinceaneras','sweet16','other','venue')),
  alt_text text,                     -- SEO: describe photo + keywords
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. INDEXES (the queries the admin panel runs constantly)
-- ============================================================
create index idx_payments_client on payments(client_id);
create index idx_payments_paid_at on payments(paid_at);
create index idx_clients_event_date on clients(event_date);
create index idx_clients_status on clients(status);
create index idx_inquiries_status on inquiries(status);

-- ============================================================
-- 3. VIEW: client balances
-- One query gives the admin panel everything: paid, owed, status.
-- Balance is always computed, never stored — it can't go stale.
-- ============================================================
create or replace view client_balances as
select
  c.id,
  c.name,
  c.phone,
  c.email,
  c.event_type,
  c.event_date,
  c.status,
  c.contract_price,
  coalesce(sum(p.amount), 0)                    as total_paid,
  c.contract_price - coalesce(sum(p.amount), 0) as balance_owed
from clients c
left join payments p on p.client_id = c.id
group by c.id;

-- security_invoker makes the view respect RLS of the querying user
alter view client_balances set (security_invoker = true);

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- Rule: public can insert inquiries + read packages/gallery.
-- Everything else requires a logged-in user (owner/manager).
-- ============================================================
alter table packages  enable row level security;
alter table inquiries enable row level security;
alter table clients   enable row level security;
alter table payments  enable row level security;
alter table gallery   enable row level security;

-- PACKAGES: anyone can read active ones (website), only auth can manage
create policy "public read active packages"
  on packages for select
  using (active = true);

create policy "auth full access packages"
  on packages for all
  to authenticated
  using (true) with check (true);

-- INQUIRIES: anonymous INSERT only (the contact form).
-- Public can never read/edit them. Auth users manage everything.
create policy "public can submit inquiries"
  on inquiries for insert
  to anon
  with check (true);

create policy "auth full access inquiries"
  on inquiries for all
  to authenticated
  using (true) with check (true);

-- CLIENTS: auth only. The public never touches money data.
create policy "auth full access clients"
  on clients for all
  to authenticated
  using (true) with check (true);

-- PAYMENTS: auth only.
create policy "auth full access payments"
  on payments for all
  to authenticated
  using (true) with check (true);

-- GALLERY: public reads active photos, auth manages.
create policy "public read active gallery"
  on gallery for select
  using (active = true);

create policy "auth full access gallery"
  on gallery for all
  to authenticated
  using (true) with check (true);

-- ============================================================
-- 5. SEED DATA — Venecia's REAL packages (from client documents)
-- All prices are + tax. Where a package has two capacity tiers,
-- base_price = the lower tier and the description shows both.
-- Edit any of these later through the admin Settings tab —
-- no SQL needed once the site is live.
-- ============================================================
insert into packages (name, base_price, description, included_items, is_popular, sort_order) values

('Paquete 1 · Hall Rental', 3900.00,
 'The venue, staffed and glowing — bring your own food and cake. Medium hall (200 guests) $3,900 · Big hall (300 guests) $4,900, plus tax.',
 array[
   'Round tables & cushion chairs',
   'Table & chair linens',
   'Centerpiece decorations',
   'Unlimited soda, water & ice',
   'Up-lighting + laser show',
   'Bartender & 3 servers',
   'Manager & 2 security on site'
 ], false, 1),

('Paquete 2 · Small Hall All-Inclusive', 4900.00,
 'The full experience for an intimate celebration — up to 100 guests, plus tax.',
 array[
   'Tables, chairs & linens of your choice',
   'Decorated cake, gift, main & signing tables',
   'LED lighting & wall backdrop decor',
   'Unlimited soda, water & ice',
   'Full meal for 100 guests, served',
   'Servers, bartender, plates & cutlery',
   'DJ for the full event (7 hours)',
   'Cake for 100 guests',
   'On-site ceremony option & dance rehearsal access',
   'Master of ceremonies & event planner',
   'Luxury glassware & giant LED letters',
   'Manager & security on site'
 ], false, 2),

('Paquete 3 · All-Inclusive', 6900.00,
 'Our most popular package — food, cake, DJ and decor, all handled. 200 guests $6,900 · 300 guests $7,900, plus tax.',
 array[
   'Tables, chairs & linens of your choice',
   'Decorated cake, gift, main & signing tables',
   'Slide show on screens + LED lighting',
   'Wall backdrop decoration',
   'Unlimited soda, water & ice',
   'Full meal (Mexican, American or Italian), served',
   'Servers, bartender, plates & cutlery',
   'DJ for the full event (7 hours)',
   'Cake for all your guests',
   'On-site ceremony option & dance rehearsal access',
   'Private room for the bride or quinceañera',
   'Master of ceremonies & event coordinator',
   'Luxury glassware & giant LED letters',
   'Manager & security on site'
 ], true, 3),

('Paquete 4 · Premium Experience', 9900.00,
 'Everything in Paquete 3 — plus open bar, party bus and the crazy hour. 200 guests $9,900 · 300 guests $10,900, plus tax.',
 array[
   'Everything in Paquete 3',
   'Unlimited mixed drinks & beer',
   'Champagne + toast glasses',
   'Table service or buffet setup',
   'Arch, pillar & diamond-overlay decor',
   'Centerpieces included',
   '3 hours of party bus',
   'Movie theater room for the kids',
   'Ceremony chapel room',
   'Crazy hour show (LED sticks & balloons)',
   'Giant marquee letters',
   'Cloud fog effect for the special dance'
 ], false, 4);

-- ============================================================
-- 6. STORAGE: gallery photo bucket
-- Creates the public bucket the admin panel uploads photos to,
-- plus policies letting logged-in users upload/delete.
-- (Public read is covered by the bucket's public flag.)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('gallery-images', 'gallery-images', true)
on conflict (id) do nothing;

create policy "auth upload gallery images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'gallery-images');

create policy "auth delete gallery images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'gallery-images');
