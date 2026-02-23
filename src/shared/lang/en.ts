import type { de } from "./de";

export const en: Record<keyof typeof de, string> = {
  // ===== HUD =====
  "hud.hp": "HP",
  "hud.energy": "ENERGY",
  "hud.special": "SPECIAL",
  "hud.ready": "READY",
  "hud.destroyed": "DESTROYED",
  "hud.respawning": "Respawning in {s}...",
  "hud.boost": "BOOST",
  "hud.copied": "Copied!",
  "hud.room": "Room: {code}  [copy]",
  "hud.kills": "{n} KILLS",
  "hud.wave": "Wave {n}",
  "hud.mutators": "Mutators:",

  // ===== Game Over =====
  "gameover.title": "GAME OVER",
  "gameover.teamWins": "Team {team} wins!",
  "gameover.playerWins": "{name} wins!",
  "gameover.score": "{name}: {kills} kills / {deaths} deaths",
  "gameover.returnToMenu": "Press ENTER to return to menu",

  // ===== Mode HUD =====
  "mode.tag.youAreIt": "YOU ARE IT! (Hit someone!)",
  "mode.tag.playerIsIt": "{name} is IT!",
  "mode.potato.bomb": "BOMB! {t}s",
  "mode.potato.carrierHasBomb": "{name} has the bomb ({t}s)",
  "mode.capture.red": "RED: {score}",
  "mode.capture.blue": "BLUE: {score}",
  "mode.capture.yourTeam": "Your Team: {team}",
  "mode.capture.teamRed": "RED",
  "mode.capture.teamBlue": "BLUE",
  "mode.survival.waveStarting": "Wave {n} starts in {s}s...",
  "mode.survival.waveInfo": "Wave {n}  |  Enemies: {enemies}",
  "mode.survival.lives": "Lives: {n}",
  "mode.gravity.active": "GRAVITY SHIFT ACTIVE!",

  // ===== Menu =====
  "menu.title": "ORBITAL CLASH",
  "menu.subtitle": "SPACE ARENA",
  "menu.selectShip": "SELECT SHIP",
  "menu.selectMap": "SELECT MAP",
  "menu.selectMode": "SELECT MODE",
  "menu.ship.hp": "HP: {n}",
  "menu.ship.spd": "SPD: {n}",
  "menu.ship.wpn": "WPN: {name}",
  "menu.ship.spc": "SPC: {name}",
  "ship.stat.hp": "Hit Points",
  "ship.stat.speed": "Speed",
  "ship.stat.weapon": "Weapon",
  "ship.stat.special": "Special Ability",
  "weapon.dual-shot": "Dual Shot",
  "weapon.dual-shot.desc": "Two fast parallel shots",
  "weapon.heavy-shot": "Heavy Shot",
  "weapon.heavy-shot.desc": "Slow, heavy single shot",
  "weapon.homing-missile": "Homing Missile",
  "weapon.homing-missile.desc": "Target-seeking missile",
  "weapon.spread-shot": "Spread Shot",
  "weapon.spread-shot.desc": "Three shots in a fan",
  "special.phase-dash": "Phase Dash",
  "special.phase-dash.desc": "Short sprint - invisible and invulnerable",
  "special.shield-bubble": "Shield Bubble",
  "special.shield-bubble.desc": "Protective bubble absorbing damage for 3s",
  "special.emp-pulse": "EMP Pulse",
  "special.emp-pulse.desc": "Electromagnetic pulse stuns nearby enemies",
  "special.gravity-bomb": "Gravity Bomb",
  "special.gravity-bomb.desc": "Gravity field pulls enemies in",
  "menu.continue": "Continue",
  "menu.singleplayer": "Singleplayer",
  "menu.multiplayer": "Multiplayer",
  "menu.quickPlay": "Quick Play",
  "menu.friends": "Friends",
  "menu.back": "Back",
  "menu.controls1": "WASD = Move  |  Mouse = Aim  |  Left Click = Shoot",
  "menu.controls2": "Right Click / Space = Special  |  Shift = Boost",
  "menu.shortcuts": "Space / F / P = Shortcuts",

  // Mode descriptions
  "mode.desc.0": "Most kills wins",
  "mode.desc.1": "Hold the zone",
  "mode.desc.2": "Gravity shifts",
  "mode.desc.3": "1v1, best of 5",
  "mode.desc.4": "Asteroid = HP loss",
  "mode.desc.5": "Survive waves",
  "mode.desc.6": "Pass the bomb!",
  "mode.desc.7": "Bring core to base",

  // ===== Post Game =====
  "postgame.title": "ROUND OVER!",
  "postgame.loading": "Loading results...",
  "postgame.winner": "Winner: {name}",
  "postgame.headers.rank": "#",
  "postgame.headers.name": "Name",
  "postgame.headers.class": "Class",
  "postgame.headers.kills": "Kills",
  "postgame.headers.deaths": "Deaths",
  "postgame.headers.damage": "Damage",
  "postgame.headers.accuracy": "Accuracy",
  "postgame.playAgain": "Play Again!",
  "postgame.toMenu": "Main Menu",

  // ===== Friends =====
  "friends.title": "FRIENDS ({online}/{total} Online)",
  "friends.empty": "No friends yet. Press S to search.",
  "friends.offline": "Offline",
  "friends.inGame": "In Game",
  "friends.online": "Online",
  "friends.join": "[Join]",
  "friends.requests": "Requests ({n})",
  "friends.requestText": "{name} wants to be your friend",
  "friends.searchBtn": "Search",
  "friends.requestsBtn": "Requests",
  "friends.back": "Back",
  "friends.searchPrompt": "Enter username:",
  "friends.noResult": "No user found",
  "friends.requestSent": "Request sent to {name}!",

  // ===== Login =====
  "login.title": "LOGIN",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Login",
  "login.register": "Register",
  "login.back": "Back",
  "login.hint": "Click a field and type the value. Tab = next field.",

  // ===== Register =====
  "register.title": "CREATE ACCOUNT",
  "register.username": "Username",
  "register.passwordHint": "Password (min. 6 characters)",
  "register.passwordRepeat": "Repeat password",
  "register.submit": "Register",
  "register.back": "Back",
  "register.guestMigration": "Your guest progress will be transferred!",

  // ===== Profile =====
  "profile.title": "PROFILE",
  "profile.level": "Level {n}",
  "profile.typeAccount": "Type: Registered",
  "profile.typeGuest": "Type: Guest",
  "profile.notLoggedIn": "Not logged in",
  "profile.challenges": "Challenges: {done}/{total} daily, {wDone}/{wTotal} weekly",
  "profile.achievements": "Achievements: {done}/{total}",
  "profile.guestHint": "Register to add friends and unlock cosmetics!",
  "profile.challengesBtn": "Challenges",
  "profile.cosmeticsBtn": "Cosmetics",
  "profile.backBtn": "Back",
  "profile.logout": "Logout",
  "profile.account": "Profile",
  "profile.login": "Login",

  // ===== Matchmaking =====
  "matchmaking.title": "SEARCHING FOR PLAYERS",
  "matchmaking.queue": "{n} players in queue",
  "matchmaking.botFallback": "Bot game in {s}s if no match",
  "matchmaking.cancel": "Cancel",

  // ===== Challenges =====
  "challenges.title": "CHALLENGES",
  "challenges.daily": "DAILY",
  "challenges.weekly": "WEEKLY",
  "challenges.achievements": "ACHIEVEMENTS",
  "challenges.empty": "Play a round to receive challenges!",
  "challenges.back": "Back to Profile",

  // ===== Cosmetics =====
  "cosmetics.title": "COSMETICS",
  "cosmetics.skins": "Skins",
  "cosmetics.trails": "Trails",
  "cosmetics.effects": "Effects",
  "cosmetics.titles": "Titles",
  "cosmetics.unlocked": "Unlocked",
  "cosmetics.achievement": "Achievement",
  "cosmetics.back": "Back",

  // ===== Mod Select =====
  "mods.loadout": "{name} - MOD LOADOUT",
  "mods.weaponMod": "WEAPON MOD",
  "mods.shipMod": "SHIP MOD",
  "mods.passiveMod": "PASSIVE MOD",
  "mods.controls": "CONTROLS",
  "mods.continue": "Continue",
  "mods.back": "Back",

  // Weapon mods
  "mods.weapon.0": "Piercing",
  "mods.weapon.0.desc": "Shots pass through first enemy",
  "mods.weapon.1": "Ricochet",
  "mods.weapon.1.desc": "Shots bounce off walls",
  "mods.weapon.2": "Gravity-Sync",
  "mods.weapon.2.desc": "Shots curve more with gravity",
  "mods.weapon.3": "Rapid Fire",
  "mods.weapon.3.desc": "+40% fire rate, -30% damage",

  // Ship mods
  "mods.ship.0": "Afterburner",
  "mods.ship.0.desc": "Longer boost, slower regen",
  "mods.ship.1": "Hull Plating",
  "mods.ship.1.desc": "+25% HP, -15% speed",
  "mods.ship.2": "Drift Master",
  "mods.ship.2.desc": "Less friction, faster turns",
  "mods.ship.3": "Gravity Anchor",
  "mods.ship.3.desc": "Less affected by gravity",

  // Passive mods
  "mods.passive.0": "Scavenger",
  "mods.passive.0.desc": "Kills drop HP pickups",
  "mods.passive.1": "Overcharge",
  "mods.passive.1.desc": "3 consecutive hits = 2x damage",
  "mods.passive.2": "Ghost Trail",
  "mods.passive.2.desc": "Leave damaging trail",
  "mods.passive.3": "Radar",
  "mods.passive.3.desc": "See off-screen enemies",

  // Control modes
  "controls.standard": "Standard (WASD)",
  "controls.standard.desc": "WASD = Direction, Mouse = Aim",
  "controls.relative": "Ship-Relative",
  "controls.relative.desc": "W/S = Forward/Back, A/D = Strafe",

  // ===== Settings =====
  "settings.title": "GAME SETTINGS",
  "settings.difficulty": "BOT DIFFICULTY",
  "settings.botCount": "BOT COUNT",
  "settings.hint": "Q/E = Difficulty  |  W/S = Bots  |  1-5 = Difficulty direct",
  "settings.mutators": "MUTATORS",
  "settings.start": "LET'S GO!",
  "settings.back": "Back",

  // ===== Online Lobby =====
  "lobby.title": "MULTIPLAYER LOBBY",
  "lobby.createRoom": "Create new room",
  "lobby.enterCode": "Or enter room code:",
  "lobby.joinHint": "ENTER to join",
  "lobby.shareCode": "Code to share:",
  "lobby.copied": "Copied!",
  "lobby.copy": "[ Copy ]",
  "lobby.back": "Back",
  "lobby.creating": "Creating room...",
  "lobby.createFailed": "Failed to create room",
  "lobby.joining": "Joining room {id}...",
  "lobby.connected": "Connected to room {id}. Waiting for players...",
  "lobby.timeout": "Connection timed out. Server may not be deployed.",

  // ===== Emotes =====
  "emotes.title": "EMOTES (1-8)",
  "emotes.cooldown": "Cooldown: {t}s",

  // ===== Kill Feed =====
  "killfeed.gravity": "[Gravity]",
  "killfeed.ricochet": "[Ricochet]",
  "killfeed.homing": "[Homing]",
  "killfeed.melee": "[Melee]",
  "killfeed.emp": "[EMP]",

  // ===== Announcements =====
  "announce.doubleKill": "Double Kill!",
  "announce.tripleKill": "Triple Kill!",
  "announce.multiKill": "Multi-Kill!",
  "announce.unstoppable": "Unstoppable!",
  "announce.godlike": "Godlike!",

  // ===== Invites =====
  "invite.banner": "{name} invites you!  [Enter = Accept]  [Esc = Decline]",

  // ===== Errors =====
  "error.fillAllFields": "Please fill all fields",
  "error.loginFailed": "Login failed",
  "error.passwordsMismatch": "Passwords do not match",
  "error.passwordTooShort": "Password must be at least 6 characters",
  "error.registerFailed": "Registration failed",
  "error.searchFailed": "Search failed",
  "error.connectionFailed": "Connection failed",

  // ===== Language =====
  "lang.toggle": "DE | EN",
};
