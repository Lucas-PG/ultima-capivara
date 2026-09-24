import type { Vec3 } from './types';
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, speed: number, dt: number) => lerp(a, b, 1 - Math.exp(-speed * dt));
export const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function aimDirection(yaw: number, pitch: number): Vec3 { return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }; }
export const emptyInput = () => ({ seq: 0, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: false, fire: false, ads: false, lean: 0, clientTime: 0 });
