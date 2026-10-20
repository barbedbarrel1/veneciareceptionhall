-- ============================================================
-- VENECIA — per-client invoice description (add-on, run ONCE)
--
-- Adds two OPTIONAL columns to clients. Both start empty (null) for every
-- existing client, and when empty the invoice keeps showing the package's
-- name + included items exactly as it does today.
--
-- Does NOT touch: contract_price, payments, the client_balances view,
-- or any policy. No numbers change.
-- ============================================================

alter table clients
  add column if not exists invoice_title text,    -- e.g. "Paquete 4 · Premium (custom)"
  add column if not exists invoice_items text[];  -- what's included, as printed on the invoice
