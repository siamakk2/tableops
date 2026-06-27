-- TableOps AI — Supabase Schema Setup
-- Run this in your Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/rlvibtvyaunuiwizqigj/sql

-- STAFF TABLE
CREATE TABLE IF NOT EXISTS to_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  role TEXT DEFAULT 'Staff',
  access_level TEXT DEFAULT 'staff',
  hourly_rate NUMERIC DEFAULT 0,
  weekly_hours INTEGER DEFAULT 0,
  employment_type TEXT DEFAULT 'Full-time',
  status TEXT DEFAULT 'active',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INVENTORY TABLE
CREATE TABLE IF NOT EXISTS to_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  unit TEXT DEFAULT 'each',
  quantity NUMERIC DEFAULT 0,
  par_level NUMERIC DEFAULT 0,
  cost_per_unit NUMERIC DEFAULT 0,
  supplier TEXT DEFAULT '',
  status TEXT DEFAULT 'ok',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- DAILY P&L TABLE
CREATE TABLE IF NOT EXISTS to_pnl (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT,
  entry_date TEXT NOT NULL,
  revenue NUMERIC DEFAULT 0,
  food_cost NUMERIC DEFAULT 0,
  labor_cost NUMERIC DEFAULT 0,
  other_costs NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PREP / KITCHEN TABLE
CREATE TABLE IF NOT EXISTS to_prep (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT,
  task TEXT NOT NULL,
  assignee TEXT DEFAULT '',
  due_time TEXT DEFAULT '',
  done BOOLEAN DEFAULT FALSE,
  list_type TEXT DEFAULT 'prep',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MENU ITEMS TABLE
CREATE TABLE IF NOT EXISTS to_menu (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',
  price NUMERIC DEFAULT 0,
  food_cost NUMERIC DEFAULT 0,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RESTAURANTS TABLE
CREATE TABLE IF NOT EXISTS to_restaurants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cuisine TEXT DEFAULT '',
  city TEXT DEFAULT '',
  tables_indoor INTEGER DEFAULT 20,
  seats_indoor INTEGER DEFAULT 80,
  tables_outdoor INTEGER DEFAULT 0,
  seats_outdoor INTEGER DEFAULT 0,
  bar_seats INTEGER DEFAULT 0,
  avg_check NUMERIC DEFAULT 45,
  food_cost_target NUMERIC DEFAULT 30,
  labor_cost_target NUMERIC DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional but recommended)
-- ALTER TABLE to_staff ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE to_inventory ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE to_pnl ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE to_prep ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE to_menu ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_staff_user ON to_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_user ON to_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_pnl_user ON to_pnl(user_id);
CREATE INDEX IF NOT EXISTS idx_prep_user ON to_prep(user_id);
CREATE INDEX IF NOT EXISTS idx_menu_user ON to_menu(user_id);
