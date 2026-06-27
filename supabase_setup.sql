-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dfytyzgbihqggkwuzkfx/sql/new

CREATE TABLE IF NOT EXISTS to_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT DEFAULT '',
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS to_pnl (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT DEFAULT '',
  entry_date TEXT NOT NULL,
  revenue NUMERIC DEFAULT 0,
  food_cost NUMERIC DEFAULT 0,
  labor_cost NUMERIC DEFAULT 0,
  other_costs NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS to_prep (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT DEFAULT '',
  task TEXT NOT NULL,
  assignee TEXT DEFAULT '',
  due_time TEXT DEFAULT '',
  done BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS to_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT DEFAULT '',
  name TEXT NOT NULL,
  category TEXT DEFAULT 'Other',
  unit TEXT DEFAULT 'each',
  quantity NUMERIC DEFAULT 0,
  par_level NUMERIC DEFAULT 0,
  cost_per_unit NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'ok',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS to_menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  restaurant_id TEXT DEFAULT '',
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'Other',
  price NUMERIC DEFAULT 0,
  food_cost NUMERIC DEFAULT 0,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
