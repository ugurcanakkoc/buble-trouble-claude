# Bubble Online — design

Private, non-commercial online co-op remake of the *Bubble Trouble 2* gameplay for 2–3 friends
(Ankara + Konya), PC browser and phone. Original art/audio only (no ripped assets).

## Stack
Vite + TypeScript + Phaser 4 (`phaser@4.x`) + `@supabase/supabase-js` 2. Tests: vitest.
Supabase project `bubble-trouble` (`zrsqnxldmgnkbvkbcrny`, eu-central-1). Only Realtime is used
(public broadcast + presence channels), no tables. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Modules
| Folder | Purpose | Depends on |
|---|---|---|
| `src/sim/` | Pure deterministic game simulation. No Phaser, no DOM, no Math.random. | `sim/types.ts` |
| `src/net/` | Supabase Realtime rooms: create/join by code, presence, input/snapshot messages. | `sim/types.ts`, `net/types.ts` |
| `src/ui/` | Phaser scenes, procedural graphics, WebAudio sfx, touch controls, host/client game loop. | sim + net public APIs |

Contracts: [src/sim/types.ts](../src/sim/types.ts), [src/net/types.ts](../src/net/types.ts).

### Sim public API (`src/sim/index.ts`)
```ts
export * from './types';
export const LEVELS: LevelDef[];                         // 15 levels, from levels.json
export function createGame(seed: number, players: PlayerInfo[], levelIndex?: number): GameState;
export function step(state: GameState, inputs: Record<PlayerId, InputState>): SimEvent[]; // mutates state, advances 1 tick (1/60 s)
```

### Net public API (`src/net/index.ts`)
```ts
export * from './types';
export const roomApi: RoomApi;
```

## Gameplay rules
- World 960×480, floor at y=480, gravity on balls only. Fixed 60 Hz tick.
- Ball sizes 3..0, radius 40/26/16/9, bounce peak heights fixed per size (higher for bigger), horizontal speed constant ~100 u/s, elastic on walls/blocks.
- Pop size n>0 → two balls size n-1 moving opposite directions with a small upward kick. Score per pop: 50/100/150/200 for size 3/2/1/0.
- Weapons: harpoon (1 rope at a time, rises 600 u/s to ceiling or first wall/block above), double (2 ropes), sticky (rope sticks at ceiling 3 s), gun (bullets 900 u/s, fire rate 8/s, max 6 alive). Weapon power-up lasts until level end.
- Power-ups drop at 15% chance per pop, fall, live 6 s on floor: shield (absorbs one hit), clock (freeze balls 5 s), dynamite (all balls → size 0), life (+1), time (+10 s), double, sticky, gun.
- Shared 5 lives. A ball touching a player (no shield, not invulnerable) → lives−1, phase `dying` 2 s, level restarts with full timer. Timer runs out → same as a hit. lives 0 → `gameOver`.
- All balls cleared → `levelComplete` 2 s → next level (`ready` 1.5 s). After level 15 → `victory`.
- Ladders: player overlapping a ladder with up/down climbs; platforms (walls) are solid for players and balls. Breakable blocks: hp hits from projectiles.
- Players don't collide with each other. Disconnected player (`connected=false`) is removed from play.

## Networking (host-authoritative)
- Room code 4 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; channel `room:<CODE>`; presence key = player id, payload `{name,color,isHost}`. Max 3. Join fails if no host in presence after sync (ROOM_NOT_FOUND), 3 present (ROOM_FULL), or host presence `inGame=true` (GAME_STARTED).
- Host: runs `step` at 60 Hz with latest input per player, broadcasts `snapshot` (full GameState) at 10 Hz.
- Client: sends `input` on change + keepalive 1 s. Runs local `step` between snapshots for smoothness (prediction); on each snapshot replaces its state with the snapshot, but keeps its own player's x when within 24 u (avoid snapback jitter). SFX/particles from locally produced SimEvents.
- Message budget (3 players): ~10 snapshot sends × 3 deliveries + inputs ≈ 40 msg/s < 100/s free limit.
- Host leaves → clients see "Oda kurucusu ayrıldı" and return to menu.

## Screens (Turkish UI)
1. **Menu**: username input (required, ≤12 chars, remembered in localStorage), buttons "Oda Kur", "Odaya Katıl" + code input.
2. **Lobby**: big room code, player list with colors, host sees "Başlat" (enabled with ≥1 player; solo allowed for testing).
3. **Game**: play area scaled to fit (letterbox), HUD (level, time bar, lives, per-player name+score), names above characters, touch controls (◀ ▶ on left, ▲▼ + FIRE on right) shown on touch devices, landscape hint in portrait.
4. **Game over / victory** overlay; host can "Tekrar Oyna" (start again from level 1).

## Out of scope (v1)
Accounts, saved progress, versus mode, level editor, joining mid-game, host migration.

## Testing
- `src/sim/*.test.ts`: splitting, scoring, power-up effects, hit/lives, level completion, determinism (same seed+inputs → same state).
- Net: manual + Playwright two-tab smoke test (create room, join, start, both see same balls).
