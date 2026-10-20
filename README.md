# Venecia Reception Hall — Website + Admin Panel

Vanilla HTML/CSS/JS · Supabase backend · GitHub Pages hosting. Zero subscription costs.

## Project structure

```
venecia/
├── index.html                  Home (main conversion page)
├── gallery.html                Gallery with filters + lightbox
├── packages.html               Packages + FAQ
├── about.html                  The venue / 3 halls / map
├── contact.html                Inquiry form (writes to Supabase)
├── gracias.html                Thank-you page after form submit
├── 404.html                    Custom 404
├── admin.html                  Admin panel (login-gated)
├── venecia_supabase_setup.sql  Run this ONCE in Supabase SQL Editor
├── style.css                   Public site design system
├── admin.css                   Admin panel styles
├── config.js                   ← PUT YOUR SUPABASE KEYS HERE
├── main.js                     Public site logic (i18n, forms, gallery, packages)
├── admin.js                    Admin logic (auth, dashboard, clients, payments)
└── images/                     Drop real photos here (see below)
```

## Setup (in order)

### 1. Supabase
1. Create a project at supabase.com (free tier is fine)
2. SQL Editor → New query → paste ALL of `venecia_supabase_setup.sql` → Run
3. Authentication → Users → Add user → create login(s) for the owner (and manager)
4. Storage → New bucket → name: `gallery-images` → **Public bucket: ON**
5. On that bucket, add policies allowing `authenticated` users to INSERT and DELETE
6. Settings → API → copy the **Project URL** and **anon public key**

### 2. Connect the site
Open `config.js` and paste your URL + anon key. That's the only file you edit to go live. (The anon key is safe in frontend code — Row Level Security is the real lock.)

### 3. Real photos
- Hero: save the best ballroom shot as `images/hero.jpg` (it's already wired in style.css)
- Gallery: upload photos through **the admin panel → Settings → Gallery** (they go to Supabase Storage and appear on the site instantly, categorized and filterable)
- Event cards on the homepage: replace the `<div class="ph">Photo</div>` placeholders in index.html with `<img>` tags

### 4. GitHub Pages
1. Push this folder to a repo
2. Settings → Pages → deploy from `main` branch, root folder
3. Add the custom domain (veneciareceptionhall.com) and update its DNS

### 5. Social + footer links
Search each HTML file for `href="#"` in the `.socials` block and paste their real Facebook / Instagram / TikTok URLs.

## Admin panel logic worth knowing
- **Balance** = contract price − sum of ALL payment rows. Computed by the `client_balances` view in Supabase, never stored, can't go stale.
- **Credits** (client removes something from a package): stored as NEGATIVE payment rows with a note. They reduce the balance but do NOT count as collected income.
- **Cancellations** are a status change, never a delete — kept deposits stay in collected income and history is preserved.
- **Convert to client** on an inquiry links the lead to the client record (`converted_client_id`) — this is how you later prove "the website generated $X in bookings."

## Printing (admin)
- **Invoice**: open a client → 🖨 Invoice (also in the Payments window). Package, included items, full payment history, balance, "Paid in full" stamp when settled. Internal notes are never printed.
- **Receipt**: 🖨 next to any payment, or "Print receipt" right after adding a payment. Shows the balance *as of that payment*, so reprinting old receipts stays accurate. Has signature lines.
- **Client list**: Clients tab → 🖨 Print list prints exactly what's filtered on screen, with totals.
- Choose **Save as PDF** in the print dialog to text/email it to the client. Invoice no. = `VEN-` + first 8 of the client id; receipt no. = `R-` + first 8 of the payment id.

## Videos
- One-time: run `videos_setup.sql` in the Supabase SQL Editor (adds a new `videos` table only).
- Upload the video to YouTube (Unlisted is fine) → Admin → Settings → Videos → paste the link. Shorts links play in a tall frame automatically.
- The gallery's ▶ Videos tab appears as soon as one video exists. Only thumbnails load; YouTube's player loads when someone taps play, so the page stays fast no matter how many videos there are.

## Language toggle
EN/ES button in the nav swaps every element tagged `data-i18n` using the STRINGS object in `main.js`. Choice is saved in localStorage. To change any wording, edit the STRINGS object — both languages live in one place.

## Not included (by design, phase 2 material)
- Email notification when a new inquiry arrives (Supabase Edge Function + Resend free tier — currently the owner checks the Inquiries tab, which shows a count badge)
- Analytics (add Plausible or GA4 script tag when ready)
