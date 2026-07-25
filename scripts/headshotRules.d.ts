// Types for headshotRules.js — the data-free half of HEADSHOT, imported by the
// browser so the client scores a guess with the same code as the server.

export type HeadshotPlayer = {
  id: string;
  name: string;
  aliases: string[];
  realName: string;
  country: string;
  countryFr: string;
  cc: string;
  region: string;
  team: string;
  teamHistory: string[];
  roles: string[];
  birthDate: string;
  majors: number;
  status: "active" | "inactive" | "retired";
};

export type MatchState = "hit" | "near" | "miss";
export type Direction = "up" | "down" | null;

export type Cell = { state: MatchState; dir: Direction };
export type NumericCell = Cell & { value: number | null };

export type Comparison = {
  correct: boolean;
  nationality: Cell;
  team: Cell;
  role: Cell;
  age: NumericCell;
  majors: NumericCell;
};

export type Attribute = "nationality" | "team" | "role" | "age" | "majors";

export function seededShuffle<T>(arr: T[], seedStr: string | number): T[];
export function todayKey(now?: number): string;
export function msUntilNextDay(now?: number): number;
export function ageOf(player: HeadshotPlayer | null, onDate?: string | number): number | null;
export function pickDaily(pool: HeadshotPlayer[], dateKey: string, mode?: string): HeadshotPlayer | null;
export function pickSequence(pool: HeadshotPlayer[], seed: string, length: number): HeadshotPlayer[];
export function compare(guess: HeadshotPlayer, target: HeadshotPlayer, onDate?: string | number): Comparison;
export function findPlayer(query: string, pool: HeadshotPlayer[]): HeadshotPlayer | null;
export function searchPlayers(query: string, pool: HeadshotPlayer[], limit?: number, exclude?: string[]): HeadshotPlayer[];
export function normalizeName(s: string): string;

export const ATTRIBUTES: readonly Attribute[];
