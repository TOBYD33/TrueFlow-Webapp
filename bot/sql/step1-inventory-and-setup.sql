-- Step 1 — Run this entire block in Supabase SQL Editor (safe to re-run)
-- Adds: setup_state column to whatsapp_sessions
--       inventory_items table
--       inventory_movements table
--       update_inventory_stock RPC function

-- ── SETUP STATE ─────────────────────────────────────────────────────────────
alter table whatsapp_sessions
  add column if not exists setup_state jsonb;

-- ── INVENTORY ITEMS ──────────────────────────────────────────────────────────
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  name text not null,
  sku text,
  description text,
  quantity_on_hand numeric(12,2) default 0,
  unit_cost numeric(12,2),
  unit_price numeric(12,2),
  currency text default 'NGN',
  low_stock_threshold numeric(12,2) default 5,
  category text,
  image_url text,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists inventory_items_org_status_idx on inventory_items (org_id, status);

drop trigger if exists inventory_items_updated_at on inventory_items;
create trigger inventory_items_updated_at
  before update on inventory_items
  for each row execute function update_updated_at();

-- ── INVENTORY MOVEMENTS ──────────────────────────────────────────────────────
create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  item_id uuid references inventory_items(id) on delete cascade,
  change_type text not null,
  -- 'restock' | 'sale' | 'adjustment'
  quantity_change numeric(12,2) not null,
  quantity_after numeric(12,2) not null,
  unit_cost_at_time numeric(12,2),
  reference_type text,
  -- 'receipt' | 'client_payment' | 'manual'
  reference_id uuid,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists inventory_movements_org_item_idx
  on inventory_movements (org_id, item_id, created_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table inventory_items enable row level security;
alter table inventory_movements enable row level security;

drop policy if exists "Org members see inventory" on inventory_items;
create policy "Org members see inventory"
  on inventory_items for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

drop policy if exists "Org admins manage inventory" on inventory_items;
create policy "Org admins manage inventory"
  on inventory_items for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

drop policy if exists "Org members see movements" on inventory_movements;
create policy "Org members see movements"
  on inventory_movements for select using (
    org_id in (select org_id from org_members where user_id = auth.uid())
  );

drop policy if exists "Org admins manage movements" on inventory_movements;
create policy "Org admins manage movements"
  on inventory_movements for all using (
    org_id in (
      select org_id from org_members
      where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- ── RPC: update_inventory_stock ──────────────────────────────────────────────
create or replace function update_inventory_stock(
  p_item_id uuid,
  p_quantity_change numeric,
  p_change_type text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_notes text default null,
  p_created_by uuid default null
) returns void as $$
declare
  v_new_qty numeric;
  v_unit_cost numeric;
  v_org_id uuid;
begin
  select quantity_on_hand, unit_cost, org_id
  into v_new_qty, v_unit_cost, v_org_id
  from inventory_items where id = p_item_id for update;

  v_new_qty := v_new_qty + p_quantity_change;

  if v_new_qty < 0 then
    raise exception 'Stock cannot go below zero';
  end if;

  update inventory_items
  set quantity_on_hand = v_new_qty, updated_at = now()
  where id = p_item_id;

  insert into inventory_movements (
    org_id, item_id, change_type, quantity_change, quantity_after,
    unit_cost_at_time, reference_type, reference_id, notes, created_by
  ) values (
    v_org_id, p_item_id, p_change_type, p_quantity_change, v_new_qty,
    v_unit_cost, p_reference_type, p_reference_id, p_notes, p_created_by
  );
end;
$$ language plpgsql security definer;
