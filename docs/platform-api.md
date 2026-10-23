# Platform API (for game authors)

Menu (game picker) → room/lobby → `scene.start(getGame(session.game).sceneKey, { session, payload })`.
The platform owns the network session, the host/client loop, touch controls and fullscreen/mute/settings.
A game supplies a pure `GameSim` + a Phaser scene + a `GameDef`.

## Contract — `src/games/types.ts`
Changes vs. the lead's first draft (all optional / additive):
- `GameSim.createGame(seed, players, mode, levelIndex?)` — 4th arg from `StartPayload.levelIndex` (bubble only; ignore it).
- `GameSim.setConnected?(state, id, connected)` — host calls it when a player leaves/returns to presence.
- `ModeDef.icon?: string` — emoji on the lobby mode card (default 🎮).
- `GameDef.maxPlayers` is enforced on join (ROOM_FULL, "Oda dolu (en fazla N kişi)").

## Registering a game — `src/games/registry.ts`
Export from `src/games/<id>/index.ts`: `warGame: GameDef` + `WarScene` (key `'WarGame'`), `bombGame` + `BombScene` (`'BombGame'`).
The lead adds one import + one `READY` entry per game in registry.ts (TODO comment there); main.ts takes scenes from `GAME_SCENES`.
Until then the picker shows the provisional def as "yakında". `getGame(id)`, `GAMES`, `isPlayable(id)`.

## Scene skeleton
```ts
import { GameLoop, startPayload } from '../../ui/loop';
create({ session, payload }: { session: RoomSession; payload: StartPayload }) {
  this.loop = new GameLoop<S, I, E>(session, mySim, {
    onHostLeft: () => { toast('Oda kurucusu ayrıldı'); void session.leave(); this.scene.start('Menu'); },
    reconcileDist: 40,              // optional, default 120 (world units), or (snap, selfId) => number
    onSnapshot: (prev, next) => [], // optional, client only: synthesize events (sounds for things others did)
  });
  this.loop.start(payload);         // first start; later restarts arrive via session.onStart automatically
  mountNetMeter(this, this.loop, session);
  this.events.once('shutdown', () => { this.loop.dispose(); touch?.destroy(); closeEnd?.(); });
}
update(_t, delta) {
  this.loop.setLocalInput(readInput());      // every frame; only changes are sent
  const events = this.loop.update(Math.min(delta, 250));
  const s = this.loop.state; if (!s) return; // render s, play events
}
// host restart from the end card:
session.startGame(startPayload(session, payload.mode));
```

## `src/ui/loop.ts`
```ts
new GameLoop<S, I, E>(session: RoomSession, sim: GameSim<S, I, E>, opts?: LoopOptions<S, E>)
interface LoopOptions<S, E> {
  onHostLeft?: () => void;
  reconcileDist?: number | ((snap: S, selfId: PlayerId) => number); // keep own pos if hypot(dx,dy) < this
  onSnapshot?(prev: S | null, next: S): E[];      // client, after fast-forward + own-pos restore
  prepareSnapshot?(prev: S | null, next: S): void; // client, before fast-forward (patch local-only state)
  fastForward?(snap: S): boolean;                  // default true
}
loop.state: S | null; loop.selfId: PlayerId
loop.setLocalInput(i: I): void   // deep-compared (JSON); client sends on change, pos = sim.ownPos(state, self)
loop.update(dtMs): E[]           // fixed steps at 1000/sim.tickRate, max 5 per frame
loop.start(payload): void        // also called on every session.onStart
loop.snapshotStats(): { avg; max } | null
loop.dispose(): void
startPayload(session, mode: string, levelIndex?: number): StartPayload
randomSeed(): number
```
Host: snapshot every 8 ticks (`SNAPSHOT_EVERY`) with all inputs; applies `setOwnPos` for client-reported positions.
Client: predicts with own input + others' inputs from the last snapshot; snapshot replaces state, then
`SNAPSHOT_LEAD_TICKS` (4) steps are replayed (their events are discarded — use `onSnapshot` to synthesize).
Inputs and state must be plain JSON. Discrete commands: incrementing `seq` in I (keepalive re-sends every 3 s).

## Net — `src/net/types.ts`
`StartPayload = { seed; players: PlayerInfo[]; game: GameId; mode: string; levelIndex?: number }`.
`RoomSession.game` = host's game. `sendSnapshot(state: unknown, inputs)`, `sendInput(input: unknown, pos?: {x,y})`,
`onInput(cb(id, input, pos?))`, `onSnapshot(cb(state, inputs))`, `linkInfo(): { mode: 'p2p'|'relay'|'connecting'; rttMs }`.
Snapshots/inputs go over WebRTC P2P when connected, else the Supabase relay (transparent to games). `roomApi.createRoom(name, game, maxPlayers?)`.

## Touch — `src/ui/touch.ts`
```ts
mountTouchControls(spec: { left: TouchGroup; right: TouchGroup }): {
  isDown(id: string): boolean; onPress(id: string, cb: () => void): () => void;
  setLabel(id: string, text: string): void; setEnabled(id: string, on: boolean): void; destroy(): void;
}
type TouchGroup = TouchButtonSpec[] | { dpad: true };          // dpad ids: 'up' 'down' 'left' 'right'
interface TouchButtonSpec { id: string; label: string; size?: 'normal' | 'big' | 'small'; shape?: 'pill' | 'circle' | 'square' }
```
Mount only on touch devices: `if (isTouch()) touch = mountTouchControls(...)` (`isTouch` from `ui/dom`).
normal = 58×120 pill, big = Ø100 pink circle, small = 52×52 square. >3 buttons in a group → 2-column grid
(use `small` for up to ~6 command buttons). Gutters are measured from the groups and the canvas refits;
the swap setting flips sides. Releases on pointerup/cancel/blur; `onPress` fires on up→down.
Example (bomb): `{ left: { dpad: true }, right: [{ id: 'bomb', label: '💣', size: 'big' }] }`.

## Helpers
- `ui/dom`: `h(tag, props, ...children)`, `toast(msg)`, `load(key)`, `save(key, value)`, `mount(el)`, `cssColor(n)`, `isTouch()`.
- `ui/audio`: `playTone({ freq, dur, type?, vol?, slideTo?, delay? })`, `playNoise({ dur, vol?, filter?, delay? })` — respect mute.
- `ui/endcard`: `showEndCard({ title, lines: string[], body?, isHost, onRestart, onMenu }): () => void` (returns close).
- `ui/netmeter`: `mountNetMeter(scene, loop, session)` — FPS, link ("P2P 23ms"/"Sunucu") + snapshot gaps top-left, follows the "Ping/FPS göster" setting. (Passing `isHost: boolean` still works, without link info.)
- Canvas is 960×540 (`Phaser.Scale.FIT`); fullscreen/mute/settings buttons are global (top-right).
