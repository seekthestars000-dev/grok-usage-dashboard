/**
 * The only data-access module in the app.
 *
 * UI code must import `getUsage` from here and must not fetch, read
 * fixtures, or invent numbers anywhere else.
 *
 * To plug in a real usage API:
 *   1. Keep the `UsageSnapshot` return type.
 *   2. Replace the body of `getUsage` with a fetch to your endpoint.
 *   3. Set `source` to `"api"` so the Sample data badge hides.
 *   4. Put the base URL in an env var (see README). Do not commit secrets.
 *
 * Example:
 *
 *   export async function getUsage(): Promise<UsageSnapshot> {
 *     const response = await fetch(import.meta.env.VITE_USAGE_API_URL);
 *     if (!response.ok) throw new Error(`Usage API ${response.status}`);
 *     return response.json() as Promise<UsageSnapshot>;
 *   }
 */
import type { BotUsage, DailyUsage, RoutineUsage, UsageSnapshot } from "./types";

export type { BotUsage, DailyUsage, RoutineUsage, UsagePeriod, UsageSnapshot, UsageSource } from "./types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LIMIT_TOKENS = 2_000_000;
const TIME_ZONE = "America/New_York";

interface BotSeed {
  id: string;
  name: string;
  routines: Array<{
    id: string;
    name: string;
    /** Typical gap between calls, in seconds. */
    intervalSec: number;
    /** Typical call count for the open week. */
    calls: number;
    /** Typical tokens per call. */
    tokensPerCall: number;
  }>;
}

const BOT_SEEDS: BotSeed[] = [
  {
    id: "market",
    name: "Market Watch",
    routines: [
      { id: "tape", name: "Five-minute tape", intervalSec: 52, calls: 1_840, tokensPerCall: 213 },
      { id: "quote-ping", name: "Quote ping", intervalSec: 180, calls: 210, tokensPerCall: 89 },
      { id: "close", name: "Close recap", intervalSec: 86_400, calls: 5, tokensPerCall: 8_260 },
    ],
  },
  {
    id: "research",
    name: "Research Desk",
    routines: [
      { id: "cite-expand", name: "Citation expander", intervalSec: 38, calls: 312, tokensPerCall: 798 },
      { id: "lit-sweep", name: "Nightly literature sweep", intervalSec: 86_400, calls: 14, tokensPerCall: 13_314 },
    ],
  },
  {
    id: "draft",
    name: "Draft Room",
    routines: [
      { id: "hooks", name: "Hook variant loop", intervalSec: 16, calls: 428, tokensPerCall: 172 },
      { id: "chapter", name: "Longform chapter pass", intervalSec: 14_400, calls: 11, tokensPerCall: 14_427 },
    ],
  },
  {
    id: "inbox",
    name: "Inbox Triage",
    routines: [
      { id: "reply-draft", name: "Thread reply drafts", intervalSec: 1_800, calls: 46, tokensPerCall: 2_648 },
      { id: "unread", name: "Unread digest", intervalSec: 7_200, calls: 28, tokensPerCall: 2_293 },
    ],
  },
  {
    id: "ops",
    name: "Ops Pager",
    routines: [{ id: "pager", name: "Alert brief", intervalSec: 21_600, calls: 9, tokensPerCall: 2_489 }],
  },
];

/** Mulberry32. Deterministic so a given refresh seed is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Most recent Monday 00:00 in the runtime local zone, at or before `now`. */
function startOfWeek(now: Date): Date {
  const start = startOfDay(now);
  const day = start.getDay();
  const daysSinceMonday = (day + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function formatWeekLabel(start: Date, asOf: Date): string {
  const startMonth = start.toLocaleDateString("en-US", { month: "short", timeZone: TIME_ZONE });
  const endMonth = asOf.toLocaleDateString("en-US", { month: "short", timeZone: TIME_ZONE });
  const startDay = Number(asOfParts(start).day);
  const endDay = Number(asOfParts(asOf).day);
  if (startMonth === endMonth) return `${startMonth} ${startDay} – ${endDay}`;
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}

interface ZonedParts {
  year: string;
  month: string;
  day: string;
  weekday: string;
  hour: string;
  minute: string;
  dayPeriod: string;
  timeZoneName: string;
  monthShort: string;
}

function asOfParts(date: Date): ZonedParts {
  const bag: Record<string, string> = {};
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
    timeZoneName: "short",
  });
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  return {
    year: bag.year ?? "",
    month: bag.month ?? "",
    day: bag.day ?? "",
    weekday: bag.weekday ?? "",
    hour: bag.hour ?? "",
    minute: bag.minute ?? "",
    dayPeriod: bag.dayPeriod ?? "",
    timeZoneName: bag.timeZoneName ?? "EST",
    monthShort: bag.month ?? "",
  };
}

function formatAsOfLabel(date: Date): string {
  const parts = asOfParts(date);
  return `${parts.weekday}, ${parts.monthShort} ${parts.day}, ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${parts.timeZoneName}`;
}

function formatResetLabel(date: Date): string {
  const parts = asOfParts(date);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long", timeZone: TIME_ZONE });
  return `${weekday}, ${parts.monthShort} ${parts.day}, 12:00 AM ${parts.timeZoneName}`;
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TIME_ZONE });
}

function isoDate(date: Date): string {
  const parts = asOfParts(date);
  const month = date.toLocaleDateString("en-US", { month: "2-digit", timeZone: TIME_ZONE });
  const day = date.toLocaleDateString("en-US", { day: "2-digit", timeZone: TIME_ZONE });
  return `${parts.year}-${month}-${day}`;
}

function jitter(random: () => number, center: number, spread: number): number {
  return center * (1 + (random() * 2 - 1) * spread);
}

function buildDaily(asOf: Date, random: () => number): DailyUsage[] {
  const today = startOfDay(asOf);
  const days: DailyUsage[] = [];
  const spikeSlots = new Set<number>();
  while (spikeSlots.size < 4) {
    spikeSlots.add(2 + Math.floor(random() * 26));
  }

  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * DAY_MS);
    const index = 29 - offset;
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const base = weekend ? 150_000 : 172_000;
    const spiked = spikeSlots.has(index);
    const tokens = Math.round(jitter(random, spiked ? base * 2.7 : base, spiked ? 0.12 : 0.1));
    const calls = Math.max(1, Math.round(tokens / (spiked ? 458 : 458)));
    days.push({
      date: isoDate(date),
      label: formatDayLabel(date),
      tokens,
      calls,
    });
  }
  return days;
}

/**
 * Tight loops and watches jitter inside their flag band.
 * Scheduled routines keep their seed cadence so labels stay "every 30m" / "daily".
 */
function jitterInterval(random: () => number, baseSec: number): number {
  if (baseSec <= 90) return Math.round(clamp(jitter(random, baseSec, 0.22), 8, 75));
  if (baseSec <= 300) return Math.round(clamp(jitter(random, baseSec, 0.15), 120, 280));
  return baseSec;
}

function buildRoutines(random: () => number): { bots: BotUsage[]; routines: RoutineUsage[] } {
  const bots: BotUsage[] = [];
  const routines: RoutineUsage[] = [];

  for (const seed of BOT_SEEDS) {
    let calls = 0;
    let tokens = 0;
    for (const routine of seed.routines) {
      const routineCalls = Math.max(1, Math.round(jitter(random, routine.calls, 0.18)));
      const routineTokens = Math.round(routineCalls * jitter(random, routine.tokensPerCall, 0.1));
      calls += routineCalls;
      tokens += routineTokens;
      routines.push({
        id: routine.id,
        botId: seed.id,
        name: routine.name,
        calls: routineCalls,
        tokens: routineTokens,
        avgIntervalSec: jitterInterval(random, routine.intervalSec),
      });
    }
    bots.push({ id: seed.id, name: seed.name, calls, tokens });
  }

  return { bots, routines };
}

function scaleToBudget(bots: BotUsage[], routines: RoutineUsage[], target: number): void {
  const current = bots.reduce((sum, bot) => sum + bot.tokens, 0);
  if (current <= 0) return;
  const factor = target / current;
  for (const bot of bots) bot.tokens = Math.round(bot.tokens * factor);
  for (const routine of routines) routine.tokens = Math.round(routine.tokens * factor);
  const drift = target - bots.reduce((sum, bot) => sum + bot.tokens, 0);
  if (bots[0]) bots[0].tokens += drift;
  const routineDrift = target - routines.reduce((sum, routine) => sum + routine.tokens, 0);
  if (routines[0]) routines[0].tokens += routineDrift;
}

/**
 * Build a fresh sample snapshot.
 * `seed` changes on each refresh so the page can show a new sample.
 */
export function createMockSnapshot(now = new Date(), seed = now.getTime()): UsageSnapshot {
  const random = mulberry32(hashString(String(seed)));
  const weekStarted = startOfWeek(now);
  const resetAt = new Date(weekStarted.getTime() + WEEK_MS);
  const elapsed = Math.max(60_000, now.getTime() - weekStarted.getTime());
  const progress = clamp(elapsed / WEEK_MS, 0.04, 0.98);
  const targetUsed = Math.round(LIMIT_TOKENS * clamp(0.42 + progress * 0.38 + (random() - 0.5) * 0.08, 0.28, 0.92));
  const { bots, routines } = buildRoutines(random);
  scaleToBudget(bots, routines, targetUsed);

  return {
    source: "mock",
    asOf: now.toISOString(),
    asOfLabel: formatAsOfLabel(now),
    weekLabel: formatWeekLabel(weekStarted, now),
    resetAt: resetAt.toISOString(),
    resetLabel: formatResetLabel(resetAt),
    period: {
      limitTokens: LIMIT_TOKENS,
      usedTokens: targetUsed,
      weekStartedAt: weekStarted.toISOString(),
    },
    bots,
    routines,
    daily: buildDaily(now, random),
  };
}

/**
 * Load the current usage snapshot.
 * The mock waits briefly so loading, error, and refresh states are real.
 */
export async function getUsage(): Promise<UsageSnapshot> {
  await new Promise((resolve) => {
    setTimeout(resolve, 280);
  });
  return createMockSnapshot(new Date(), Date.now());
}
