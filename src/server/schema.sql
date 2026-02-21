-- Player accounts
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  rank TEXT DEFAULT 'bronze',
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  eliminations INTEGER DEFAULT 0
);

-- Unlocked mods per player
CREATE TABLE IF NOT EXISTS player_mods (
  player_id TEXT NOT NULL REFERENCES players(id),
  mod_id TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, mod_id)
);

-- Unlocked cosmetics
CREATE TABLE IF NOT EXISTS player_cosmetics (
  player_id TEXT NOT NULL REFERENCES players(id),
  cosmetic_id TEXT NOT NULL,
  cosmetic_type TEXT NOT NULL,
  unlocked_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, cosmetic_id)
);

-- Match history
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  map TEXT NOT NULL,
  started_at TEXT DEFAULT (datetime('now')),
  duration_seconds INTEGER,
  winner_id TEXT REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id TEXT NOT NULL REFERENCES matches(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  ship_class TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  eliminations INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);
