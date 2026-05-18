# Stream Brawler: Full Game Design Document (GDD)
**Project Version:** 1.0.0  
**Target Architecture:** Next.js (App Router), Supabase (PostgreSQL, Auth, Real-time), Tailwind CSS

---

## 1. Executive Summary & Core Loop

Stream Brawler is a web-based, mobile-first RPG companion built specifically to engage with Twitch livestream ecosystems. It combines a progressive item-economy, classic turn-based RPG gacha calculations, and high-stakes permanent death tracking loops. 

### Core Mechanics Loop
1. **Authenticate & Build Profile:** Users login instantly via Twitch OAuth. A public user record and baseline wallet currency balance are automatically instantiated.
2. **Roll Character Matrix:** Players execute an encrypted server-side gacha routine to roll a living fighter with exactly 4 randomized starting attribute points distributed across 6 categories.
3. **Wager Currency:** Players spend gold from their wallet balance to pay arena admission fees across three distinct difficulty tiers.
4. **Automated Combat Simulation:** The server processes a mathematical turn-based battle simulation using fighter attributes vs generated NPC templates.
5. **Outcome Execution:**
   - *On Victory:* Gold payouts are deposited, win counters tick up, and there is a 40% chance to secure highly randomized gear drops directly into a storage inventory tracking state.
   - *On Defeat:* Permadeath executes immediately. The fighter is wiped out of active storage arrays, and any active equipment is securely detached and returned back to the vault before the character is moved into a historical graveyard archive log.

---

## 2. Technical Stack & Architecture

- **Frontend View Framework:** Next.js 14+ (App Router architecture driven with `'use client'` interactive sheets).
- **Styling Utility:** Tailwind CSS (Atomic CSS layer, fully optimized for fluid mobile viewport responsive dimensions).
- **Backend Orchestration:** Serverless Route Handlers (`app/api/*`) executing explicit backend processes using the Supabase Server SDK.
- **Database & Identity:** Supabase Core Ecosystem:
  - **Auth Layer:** Twitch OAuth Secure Client Connection Provider.
  - **Database Engine:** PostgreSQL schema architecture running strict Row Level Security (RLS) tracking profiles to guard against malicious front-end manipulation.
  - **Procedural Logic:** Automated PL/pgSQL database trigger functions to sync identity profiles instantly upon user registration.

---

## 3. Database Schema Blueprint

### 3.1 `public.users`
Stores core user details and active economy balances.

### 3.2 `public.fighters`
Stores active characters and metadata. Permanent death status is tracked here.

```sql
CREATE TABLE public.fighters (
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
name TEXT NOT NULL,
sprite_id TEXT NOT NULL,
wins INTEGER DEFAULT 0 NOT NULL,
is_dead BOOLEAN DEFAULT false NOT NULL,
killed_by TEXT,
died_at TIMESTAMP WITH TIME ZONE,
death_replay_id UUID,
stat_power INTEGER DEFAULT 0 NOT NULL,
stat_vitality INTEGER DEFAULT 0 NOT NULL,
stat_toughness INTEGER DEFAULT 0 NOT NULL,
stat_speed INTEGER DEFAULT 0 NOT NULL,
stat_finesse INTEGER DEFAULT 0 NOT NULL,
stat_luck INTEGER DEFAULT 0 NOT NULL,
created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

### 3.3 `public.inventory`
Stores items collected by users and relates them to an active fighter if equipped.

```sql
CREATE TABLE public.inventory (
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
item_template_id TEXT NOT NULL,
bonus_stats JSONB NOT NULL,
equipped_to UUID REFERENCES public.fighters(id) ON DELETE SET NULL,
created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

### 3.4 `public.match_queue`
Stores structural match data and complete procedural history strings.

```sql
CREATE TABLE public.match_queue (
id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
challenger_id UUID REFERENCES public.fighters(id) ON DELETE CASCADE NOT NULL,
status TEXT NOT NULL CHECK (status IN ('queued', 'active', 'completed', 'canceled')),
winner_id UUID REFERENCES public.fighters(id) ON DELETE SET NULL,
fight_log JSONB,
created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
```

## 4. Key Security Policies (RLS Rules)

To maintain absolute server-side authority, RLS is enabled on all core tables. Client-side actions are tightly scoped via the following PostgreSQL authorization profiles:

```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fighters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- 1. Profile Level Security Controls
CREATE POLICY "Allow users to read their own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Allow users to update their own profile data" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- 2. Character Generation & Sync Controls
CREATE POLICY "Allow users to view all active characters" ON public.fighters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert their own fighters" ON public.fighters FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to update their own fighters" ON public.fighters FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. Inventory Protection Controls
CREATE POLICY "Allow users to read their own inventory" ON public.inventory FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Allow users to insert items into inventory" ON public.inventory FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow users to update their own inventory slots" ON public.inventory FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

## 5. System Architecture & Mechanics Implementation

### 5.1 Automated Database Hook (Trigger Script)
Synchronizes the custom transactional user space with internal identity generation:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
INSERT INTO public.users (id, twitch_id, email, wallet_balance)
VALUES (
new.id,
new.raw_user_meta_data->>'preferred_username',
new.email,
1000
);
RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
```

### 5.2 Server-Side Gacha Allocation Matrix
**File:** `/api/fighters/generate`

- Evaluates user validation checks.
- Guarantees exactly 4 points are seeded into the base data matrix every single time across 6 category configurations via server loop routines. This prevents data injection vulnerabilities by computing values completely out of client reach.

### 5.3 Combat Simulation Rule Set
**File:** `/api/arena/fight`

- Deducts admission fees instantly upon arrival to insulate systems against browser-refresh exploits.

**Attribute Evaluation Map:**

- **Speed:** Dictates initiative roll multipliers at the start of every combat turn (Speed + Random Variance).
- **Power:** Core damage modifier offset directly by the opponent's raw toughness threshold.
- **Vitality:** Multiplies the base maximum structural health capacity (10 + Vitality * 2).
- **Luck:** Increases critical hit multipliers.

**Safety Closure Routines:**

- If a fighter dies, a transactional clean-up runs immediately: `is_dead` becomes `true`, a structural tombstone timestamp is recorded, and all equipped items are completely stripped from the character instance and returned back to the vault storage list.
- Loot drops are bound exclusively inside successful victory boundaries.

### 5.4 Inventory Slot Reconciliation Control
**File:** `/api/inventory/equip`

Prevents items from stacking up or multiple weapons from equipping simultaneously.

When an item activation is triggered, the route extracts the target blueprint slot definition from the server registry (weapon, armor, trinket), queries the active brawler's matching equipment instances, updates matching items to equipped_to = null, and applies the single targeted modification.

## 6. Item Registry Definition Blueprint

Items use a static registry configuration file (`utils/items.ts`). Modifiers scale directly based on predefined rarity matrices:

| ID | Name | Slot | Stat | Modifier | Rarity |
|---|---|---|---|---|---|
| `rusty_dagger` | Rusty Dagger | Weapon | Power | +1 | Common |
| `iron_sword` | Iron Sword | Weapon | Power | +3 | Rare |
| `knight_greatsword` | Knight Greatsword | Weapon | Power | +6 | Epic |
| `excalibur` | Excalibur | Weapon | Finesse | +12 | Legendary |
| `padded_vest` | Padded Vest | Armor | Toughness | +1 | Common |
| `chainmail` | Chainmail Tunic | Armor | Toughness | +3 | Rare |
| `plate_armor` | Guardian Plate | Armor | Vitality | +5 | Epic |
| `rabbit_foot` | Lucky Rabbit Foot | Trinket | Luck | +2 | Rare |

## 7. Frontend Layout Architecture

The application dashboard uses an atomic responsive structure built with Tailwind CSS. It provides smooth layouts across varied devices:

- **Left Sidebar/Sticky Header Column:** Global branding monitor panel, dynamic live connection indicator, server-synchronized reactive wallet tracking monitor, and a collapsible accordion character detail readout window.

**Tabbed Workspace System Panels:**

- **The Vault:** Renders an elegant multi-column grid of inventory assets displaying rarity indicators, detailed attribute descriptors, and dynamic mouse-hover equip triggers.
- **The Arena:** Houses difficulty selection triggers (Safe Bet, Fair Fight, Suicide Mission) matched to a live, styled log output readout window.
- **The Blacksmith:** Placeholder space designated for future item progression loops (fusion/upgrading).
- **The Graveyard:** Component space dedicated to highlighting fallen characters and historical run statistics.