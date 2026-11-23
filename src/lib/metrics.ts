import type { RoutineUsage, UsageSnapshot } from "../data/types";

/** Spike threshold: mean + 1.25 standard deviations of daily tokens. */
export const SPIKE_SD = 1.25;

/** Faster than this, with enough calls, is a Loop. */
export const LOOP_INTERVAL_SEC = 90;
/** Every few minutes, with enough calls, is a Watch. */
export const WATCH_INTERVAL_SEC = 300;

export type Severity = "high" | "watch";

export interface DailyPoint {
  date: string;
  label: string;
  tokens: number;
  calls: number;
  spike: boolean;
  tokenLabel: string;
  callLabel: string;
}

export interface BotRow {
  id: string;
  name: string;
  calls: number;
  tokens: number;
  share: number;
  tokenLabel: string;
  callLabel: string;
  shareLabel: string;
}

export interface RoutineRow {
  id: string;
  name: string;
  botId: string;
  botName: string;
  calls: number;
  tokens: number;
  avgIntervalSec: number;
  cadence: string;
  severity: Severity | null;
  tokenLabel: string;
  callLabel: string;
}

export interface LoopFlag {
  id: string;
  routineName: string;
  botName: string;
  calls: number;
  callLabel: string;
  cadence: string;
  severity: Severity;
  reason: string;
}

export interface SavingTip {
  title: string;
  body: string;
}

export interface UsageView {
  pct: number;
  pctLabel: string;
  usedLabel: string;
  limitLabel: string;
  projectionPct: number;
  projectionLabel: string;
  overPace: boolean;
  totalCalls: number;
  totalCallsLabel: string;
  bots: BotRow[];
  routines: RoutineRow[];
  daily: DailyPoint[];
  spikeCount: number;
  peakLabel: string;
  peakDay: string;
  flags: LoopFlag[];
  highCount: number;
  watchCount: number;
  tips: SavingTip[];
  resetInLabel: string;
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatCalls(value: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatPercent(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function formatShare(share: number): string {
  const percent = share * 100;
  return percent >= 10 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`;
}

export function formatCadence(seconds: number): string {
  if (seconds < 90) return `every ${Math.max(1, Math.round(seconds))}s`;
  if (seconds < 3600) return `every ${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) {
    const hours = seconds / 3600;
    return `every ${hours >= 10 ? Math.round(hours) : Math.round(hours * 10) / 10}h`;
  }
  const days = seconds / 86400;
  return days < 1.5 ? "daily" : `every ${Math.round(days)}d`;
}

export function classifyRoutine(calls: number, avgIntervalSec: number): Severity | null {
  // Loop: faster than once a minute, with enough calls to be a routine rather than a burst.
  if (avgIntervalSec <= LOOP_INTERVAL_SEC && calls >= 80) return "high";
  // Watch: every few minutes, still hot enough to tighten into a loop.
  if (avgIntervalSec <= WATCH_INTERVAL_SEC && calls >= 150) return "watch";
  return null;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function standardDeviation(values: number[], average: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function formatResetCountdown(resetAt: string, now = Date.now()): string {
  const remaining = Math.max(0, new Date(resetAt).getTime() - now);
  const totalMinutes = Math.floor(remaining / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function botName(snapshot: UsageSnapshot, botId: string): string {
  return snapshot.bots.find((bot) => bot.id === botId)?.name ?? botId;
}

function buildTips(snapshot: UsageSnapshot, flags: LoopFlag[], projectionPct: number, resetInLabel: string): SavingTip[] {
  const tips: SavingTip[] = [];
  const used = snapshot.period.usedTokens;
  const limit = snapshot.period.limitTokens;
  const pct = limit === 0 ? 0 : (used / limit) * 100;
  const loops = flags.filter((flag) => flag.severity === "high");

  if (loops.length > 0) {
    const names = loops.map((flag) => flag.routineName);
    const subject =
      names.length <= 1 ? (names[0] ?? "A routine") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    tips.push({
      title: "Slow the tight loops",
      body: `${subject} ${loops.length === 1 ? "is" : "are"} firing faster than once a minute. A five-minute minimum gap cuts most of this week's call volume without touching the routines you actually read.`,
    });
  }

  const topBot = [...snapshot.bots].sort((left, right) => right.tokens - left.tokens)[0];
  if (topBot && used > 0 && topBot.tokens / used >= 0.3) {
    tips.push({
      title: `Trim ${topBot.name}`,
      body: `${topBot.name} is ${formatShare(topBot.tokens / used)} of tokens this week. Run it only during the hours you read the output, and keep the overnight passes off.`,
    });
  }

  const replies = snapshot.routines.find((routine) => routine.id === "reply-draft" || /reply/i.test(routine.name));
  if (replies && replies.calls >= 20) {
    tips.push({
      title: "Batch the reply drafts",
      body: `${replies.name} ran ${formatCalls(replies.calls)} times. One pass an hour, covering every open thread, spends far fewer calls than a draft per message.`,
    });
  }

  if (projectionPct > 100) {
    tips.push({
      title: "This pace clears the cap",
      body: `Projected finish is ${formatPercent(projectionPct)}% of the weekly limit, with ${resetInLabel} left. Pause the tape routines and keep Draft Room if you need the headroom.`,
    });
  } else if (pct >= 50) {
    tips.push({
      title: "Leave room for the rest of the week",
      body: `${formatPercent(pct)}% of the cap is used, and the current pace lands near ${formatPercent(projectionPct)}% by reset (${resetInLabel}). Freeze anything you will not read before ${snapshot.resetLabel}.`,
    });
  } else if (tips.length < 4) {
    const watch = flags.find((flag) => flag.severity === "watch");
    if (watch) {
      tips.push({
        title: `Back off ${watch.routineName}`,
        body: `${watch.routineName} is on a ${watch.cadence} cadence across ${watch.callLabel} calls. Add a backoff before it tightens into a loop.`,
      });
    }
  }

  if (tips.length === 0) {
    tips.push({
      title: "Usage is inside the band",
      body: `${formatPercent(pct)}% of the weekly limit is used, projected to finish near ${formatPercent(projectionPct)}%. No routine is firing fast enough to flag.`,
    });
  }

  return tips.slice(0, 4);
}

function projectTokens(snapshot: UsageSnapshot, now: number): number {
  const used = snapshot.period.usedTokens;
  const started = new Date(snapshot.period.weekStartedAt).getTime();
  const elapsed = Math.max(60_000, now - started);
  return used * (WEEK_MS / elapsed);
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function deriveView(snapshot: UsageSnapshot, now = Date.now()): UsageView {
  const limit = snapshot.period.limitTokens;
  const used = snapshot.period.usedTokens;
  const pct = limit === 0 ? 0 : (used / limit) * 100;
  const projectedTokens = projectTokens(snapshot, now);
  const projectionPct = limit === 0 ? 0 : (projectedTokens / limit) * 100;
  const resetInLabel = formatResetCountdown(snapshot.resetAt, now);

  const tokenSeries = snapshot.daily.map((day) => day.tokens);
  const average = mean(tokenSeries);
  const deviation = standardDeviation(tokenSeries, average);
  const spikeLine = average + SPIKE_SD * deviation;
  const daily: DailyPoint[] = snapshot.daily.map((day) => ({
    date: day.date,
    label: day.label,
    tokens: day.tokens,
    calls: day.calls,
    spike: deviation > 0 && day.tokens >= spikeLine,
    tokenLabel: formatTokens(day.tokens),
    callLabel: formatCalls(day.calls),
  }));
  const peak = daily.reduce<DailyPoint | null>((best, day) => (best === null || day.tokens > best.tokens ? day : best), null);

  const bots: BotRow[] = [...snapshot.bots]
    .sort((left, right) => right.tokens - left.tokens)
    .map((bot) => {
      const share = used === 0 ? 0 : bot.tokens / used;
      return {
        id: bot.id,
        name: bot.name,
        calls: bot.calls,
        tokens: bot.tokens,
        share,
        tokenLabel: formatTokens(bot.tokens),
        callLabel: formatCalls(bot.calls),
        shareLabel: formatShare(share),
      };
    });

  const routines: RoutineRow[] = snapshot.routines.map((routine: RoutineUsage) => ({
    id: routine.id,
    name: routine.name,
    botId: routine.botId,
    botName: botName(snapshot, routine.botId),
    calls: routine.calls,
    tokens: routine.tokens,
    avgIntervalSec: routine.avgIntervalSec,
    cadence: formatCadence(routine.avgIntervalSec),
    severity: classifyRoutine(routine.calls, routine.avgIntervalSec),
    tokenLabel: formatTokens(routine.tokens),
    callLabel: formatCalls(routine.calls),
  }));

  const flags: LoopFlag[] = routines
    .filter((routine): routine is RoutineRow & { severity: Severity } => routine.severity !== null)
    .map((routine) => {
      const reason =
        routine.severity === "high"
          ? `${routine.cadence} across ${routine.callLabel} calls. That is a loop, not a schedule.`
          : `${routine.cadence} and ${routine.callLabel} calls. Add a backoff before it tightens further.`;
      return {
        id: routine.id,
        routineName: routine.name,
        botName: routine.botName,
        calls: routine.calls,
        callLabel: routine.callLabel,
        cadence: routine.cadence,
        severity: routine.severity,
        reason,
      };
    })
    .sort((left, right) => {
      if (left.severity !== right.severity) return left.severity === "high" ? -1 : 1;
      return right.calls - left.calls;
    });

  const totalCalls = snapshot.routines.reduce((sum, routine) => sum + routine.calls, 0);

  return {
    pct,
    pctLabel: formatPercent(pct),
    usedLabel: formatTokens(used),
    limitLabel: formatTokens(limit),
    projectionPct,
    projectionLabel: formatPercent(projectionPct),
    overPace: projectionPct > 100,
    totalCalls,
    totalCallsLabel: formatCalls(totalCalls),
    bots,
    routines,
    daily,
    spikeCount: daily.filter((day) => day.spike).length,
    peakLabel: peak ? peak.tokenLabel : "0",
    peakDay: peak ? peak.label : "—",
    flags,
    highCount: flags.filter((flag) => flag.severity === "high").length,
    watchCount: flags.filter((flag) => flag.severity === "watch").length,
    tips: buildTips(snapshot, flags, projectionPct, resetInLabel),
    resetInLabel,
  };
}
