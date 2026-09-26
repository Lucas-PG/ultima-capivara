export const PROTOCOL_VERSION = 4;
export const WORLD_VERSION = 'ilha-v3-rio-2';
export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 20;
export const MAX_PLAYERS = 16;
export type Mode = 'battle-royale' | 'deathmatch';
export type Phase = 'lobby' | 'countdown' | 'playing' | 'results';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type WeaponId = 'pistol' | 'smg' | 'm4' | 'shotgun' | 'dmr' | 'sniper' | 'machete' | 'slingshot';
export type ConsumableId = 'bandage' | 'medkit' | 'guarana' | 'acai' | 'rapadura';
export interface Vec3 { x: number; y: number; z: number }
export interface RoomConfig { mode: Mode; capacity: number; bots: boolean; difficulty: Difficulty; duration: 300 | 480 | 600; adapt?: number /* practice only: legacy adaptive difficulty in [-1, 1] */ }
export const DEFAULT_CONFIG: RoomConfig = { mode: 'battle-royale', capacity: 8, bots: true, difficulty: 'normal', duration: 480 };
export interface PlayerProfile { id: string; name: string; color: string; ready: boolean; connected: boolean }
export interface RoomState { code: string; myId: string; hostId: string; isHost: boolean; phase: Phase; config: RoomConfig; players: PlayerProfile[] }
export interface SessionCallbacks {
  room: (room: RoomState | null) => void;
  start: (config: RoomConfig, players: PlayerProfile[], matchId: string) => void;
  input: (playerId: string, input: InputFrame) => void;
  action: (playerId: string, action: PlayerAction) => void;
  player: (profile: PlayerProfile, status: 'join' | 'disconnect' | 'reconnect' | 'expired') => void;
  snapshot: (snapshot: WorldSnapshot) => void;
  events: (events: GameEvent[]) => void;
  error: (message: string) => void;
  closed: (reason: string) => void;
}
export interface InputFrame {
  seq: number; moveX: number; moveZ: number; yaw: number; pitch: number;
  sprint: boolean; crouch: boolean; jump: boolean; fire: boolean; ads: boolean; lean: number;
  clientTime: number; firePressId?: number;
}
export type PlayerAction =
  | { type: 'reload'; id: number }
  | { type: 'slot'; id: number; slot: number }
  | { type: 'interact'; id: number; target: string }
  | { type: 'consume'; id: number; item: ConsumableId }
  | { type: 'parachute'; id: number }
  | { type: 'jump'; id: number }
  | { type: 'trigger'; id: number; yaw: number; pitch: number; lean: number; ads: boolean; clientTime: number };
export interface WeaponState { id: WeaponId; ammo: number; reserve: number; rarity: number }
export interface ActorState {
  id: string; name: string; color: string; bot: boolean; connected: boolean;
  pos: Vec3; velocity: Vec3; yaw: number; pitch: number; lean: number;
  hp: number; armor: number; helmet: number; alive: boolean; grounded: boolean;
  crouch: boolean; sprint: boolean; ads: boolean;
  swimming: boolean; wetUntil: number;
  stage: 'plane' | 'falling' | 'parachute' | 'ground';
  kills: number; deaths: number; damage: number;
  weapons: WeaponState[]; slot: number;
  consumables: Record<ConsumableId, number>;
  reloadUntil: number; useUntil: number; using: ConsumableId | null;
  respawnAt: number; protectionUntil: number; lastInput: number; shotHeat: number;
}
export interface Collider { id: string; min: Vec3; max: Vec3; material: 'stone' | 'wood' | 'metal' | 'earth'; pieceId?: string }
export interface KitPlacement extends Vec3 { id: string; piece: string; yaw: number; scale?: number }
export interface NavigationGraph { points: Vec3[]; links: number[][] }
export interface MapObject {
  id: string; kind: 'box' | 'cylinder' | 'cone' | 'sphere' | 'roof' | 'palm' | 'tree' | 'grass' | 'sign' | 'boat' | 'barrel' | 'rock' | 'lamp';
  pos: Vec3; scale: Vec3; rotation?: number; color: string; detail?: string;
}
export interface District { id: string; name: string; x: number; z: number; radius: number; color: string }
export interface SpawnPoint extends Vec3 { mode: Mode | 'both'; yaw: number; district?: string }
export interface LootSpawn extends Vec3 { id: string; kind: 'weapon' | 'ammo' | 'armor' | 'helmet' | ConsumableId; weapon?: WeaponId }
export interface ChestSpec extends Vec3 { id: string }
export interface WorldSpec {
  version: string; size: number; colliders: Collider[]; objects: MapObject[];
  spawns: SpawnPoint[]; loot: LootSpawn[]; chests: ChestSpec[]; districts: District[];
  pieces?: KitPlacement[]; arenaBoundary?: string[]; walkways?: Collider[]; navigation?: NavigationGraph;
}
// Loot spilled from a chest carries where it came from and when, so clients can
// animate it arcing out; its x/y/z is already the landing spot.
export interface LootState extends LootSpawn { active: boolean; rarity: number; respawnAt: number; from?: Vec3; spawnedAt?: number }
export interface ZoneState { x: number; z: number; radius: number; nextRadius: number; nextX: number; nextZ: number; phase: number; shrinking: boolean; timeLeft: number; damage: number }
export interface MatchResult { id: string; name: string; color: string; bot: boolean; kills: number; deaths: number; damage: number; place: number; winner: boolean; shots: number; hits: number; headshots: number; survived: number; chests: number }
export interface WorldSnapshot {
  protocol: number; world: string; matchId: string; tick: number; time: number; phase: Phase;
  config: RoomConfig; countdown: number; remaining: number; actors: ActorState[];
  loot: LootState[]; openedChests: string[]; zone: ZoneState;
  results: MatchResult[]; plane: Vec3;
}
// What a shot's endpoint struck when it was not a capybara; `normal` faces the shooter's side.
export type Surface = 'dirt' | 'sand' | 'foliage' | 'stone' | 'wood' | 'metal' | 'water';
export type GameEvent =
  | { type: 'shot'; id: number; actor: string; weapon: WeaponId; origin: Vec3; end: Vec3; hit: boolean; surface?: Surface; normal?: Vec3 }
  | { type: 'damage'; id: number; actor: string; target: string; amount: number; head: boolean; pos: Vec3; armorBreak?: boolean }
  // `from` is the eliminator's position and `distance` the gap in metres at the moment of the kill.
  | { type: 'kill'; id: number; actor: string | null; target: string; weapon: WeaponId | 'storm' | 'fall'; from?: Vec3; distance?: number }
  | { type: 'pickup'; id: number; actor: string; item: string }
  | { type: 'reload'; id: number; actor: string; weapon: WeaponId }
  | { type: 'respawn'; id: number; actor: string }
  | { type: 'water'; id: number; actor: string; pos: Vec3; entering: boolean }
  | { type: 'use'; id: number; actor: string; item: ConsumableId }
  // A slow projectile (slingshot stone) struck the world after its flight.
  | { type: 'impact'; id: number; actor: string; weapon: WeaponId; pos: Vec3; surface: Surface; normal: Vec3 }
  // A bot has locked onto a human and will open fire after `delay` seconds.
  | { type: 'alert'; id: number; actor: string; target: string; delay: number }
  | { type: 'notice'; id: number; text: string };
export interface Settings {
  sensitivity: number; fov: number; graphics: 'low' | 'medium' | 'high'; frameLimit: 30 | 60; reducedMotion: boolean;
  master: number; effects: number; ambience: number; music: number;
  adsToggle: boolean; bindings: Record<string, string>;
  // Legacy "Ajuste automático": practice bots adapt to recent placements.
  adaptive: boolean;
  // HUD preferences: FPS readout, interface size (0.8 to 1.2) and colour-blind friendly aim feedback.
  showFps: boolean; uiScale: number; crosshairColor: 'white' | 'yellow' | 'cyan' | 'magenta'; hitPalette: 'default' | 'colorblind';
}
export interface RenderFrame { snapshot: WorldSnapshot | null; playerId: string; input: InputFrame; dt: number; playing: boolean; spectateId: string | null; predicted?: Vec3; remoteActors?: ReadonlyMap<string, ActorState> }
// Kit colours (bandana and vest trim), never fur: every player still reads as a capybara (style bible §3.7).
export const PLAYER_COLORS = ['#1fb5a8', '#e76f51', '#ffc23d', '#3d6fb6', '#a468ff', '#f28db2', '#8cc453', '#f4f1e8'];
