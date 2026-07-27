// Types for pentakillRules.js — the data-free half of PENTAKILL.

export type LolChampion = {
  id: string;
  key: number;
  name: string;
  nameFr: string;
  title: string;
  titleFr: string;
  classes: string[];
  positions: string[];
  regions: string[];
  resource: string;
  rangeType: "Melee" | "Ranged";
  damageType: "Physical" | "Magic";
  difficulty: number | null;
  releaseDate: string | null;
  releaseYear: number | null;
  attackRange: number | null;
  moveSpeed: number | null;
  ratings: { damage: number; toughness: number; control: number; mobility: number; utility: number };
  be: number | null;
  rp: number | null;
  skills: string[];
  image: string;
};

export type MatchState = "hit" | "near" | "miss";
export type Cell = { state: MatchState; dir?: "up" | "down" | null };
export type NumericCell = Cell & { value: number | null };

export type Comparison = {
  correct: boolean;
  classes: Cell;
  positions: Cell;
  regions: Cell;
  resource: Cell;
  rangeType: Cell;
  damageType: Cell;
  releaseYear: NumericCell;
  difficulty: NumericCell;
  attackRange: NumericCell;
  be: NumericCell;
};

export function seededShuffle<T>(arr: T[], seedStr: string | number): T[];
export function todayKey(now?: number): string;
export function msUntilNextDay(now?: number): number;
export function pickDaily<T>(pool: T[], dateKey: string, mode?: string): T | null;
export function pickSequence<T>(pool: T[], seed: string, length: number): T[];
export function normalizeName(s: string): string;
export function compare(guess: LolChampion, target: LolChampion): Comparison;
export function compareSet(guess: string[] | string, target: string[] | string): Cell;
export function findChampion(query: string, pool: LolChampion[]): LolChampion | null;
export function searchChampions(query: string, pool: LolChampion[], limit?: number, exclude?: string[]): LolChampion[];

export const ATTRIBUTES: readonly string[];
export const YEAR_SLACK: number;
