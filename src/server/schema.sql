-- ===== ACCOUNTS =====

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  rank TEXT DEFAULT 'bronze',
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  eliminations INTEGER DEFAULT 0,
  total_games INTEGER DEFAULT 0,
  total_damage INTEGER DEFAULT 0,
  total_gravity_kills INTEGER DEFAULT 0,
  equipped_skin TEXT DEFAULT 'default',
  equipped_trail TEXT DEFAULT 'default',
  equipped_kill_effect TEXT DEFAULT 'default',
  equipped_title TEXT DEFAULT '',
  equipped_badge TEXT DEFAULT '',
  equipped_emotes TEXT DEFAULT '["gg","wow","nochmal","sorry"]'
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  display_name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  last_seen TEXT DEFAULT (datetime('now')),
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0
);

-- ===== SOCIAL =====

CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  friend_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(account_id, friend_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  from_id TEXT NOT NULL REFERENCES accounts(id),
  to_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'pending',
  UNIQUE(from_id, to_id)
);

-- ===== MATCH HISTORY =====

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mode TEXT NOT NULL,
  map TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  duration_seconds INTEGER DEFAULT 0,
  winner_id TEXT
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL REFERENCES matches(id),
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  ship_class TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  eliminations INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  damage_dealt INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  gravity_kills INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);

-- ===== PROGRESSION =====

CREATE TABLE IF NOT EXISTS unlocked_cosmetics (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  cosmetic_id TEXT NOT NULL,
  cosmetic_type TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, cosmetic_id)
);

CREATE TABLE IF NOT EXISTS achievements (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  challenge_type TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  target INTEGER NOT NULL,
  completed INTEGER DEFAULT 0,
  reward_xp INTEGER DEFAULT 0,
  reward_token TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recent_players (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  other_id TEXT NOT NULL REFERENCES accounts(id),
  last_played TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, other_id)
);

-- ===== LEGACY COMPATIBILITY =====
-- Old tables kept for migration reference (data migrated to accounts)

CREATE TABLE IF NOT EXISTS player_mods (
  player_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, mod_id)
);
