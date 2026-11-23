/**
 * Usage snapshot contract.
 *
 * `getUsage()` in `source.ts` is the only data access point. A real API
 * should return this shape. Derived fields (percent used, projections,
 * spike flags, loop tags, saving tips) are computed in the UI from these
 * raw numbers so the API does not have to pre-aggregate them.
 */

/** Where the snapshot came from. `mock` shows the Sample data badge. */
export type UsageSource = "mock" | "api";

/** One bot (agent) that spent tokens this period. */
export interface BotUsage {
  id: string;
  name: string;
  /** Completed model calls attributed to this bot in the current week. */
  calls: number;
  /** Tokens attributed to this bot in the current week. */
  tokens: number;
}

/**
 * A named routine inside a bot.
 * `avgIntervalSec` is the mean gap between consecutive calls over the week.
 * The UI tags it Loop when it fires faster than once a minute, and Watch
 * when it fires every few minutes, once call volume is high enough.
 */
export interface RoutineUsage {
  id: string;
  botId: string;
  name: string;
  calls: number;
  tokens: number;
  /** Mean seconds between calls. Larger means less frequent. */
  avgIntervalSec: number;
}

/** One calendar day in the trailing 30-day series. Dates are `YYYY-MM-DD`. */
export interface DailyUsage {
  date: string;
  /** Short axis label, e.g. "Nov 22". */
  label: string;
  tokens: number;
  calls: number;
}

/** The open weekly token window. */
export interface UsagePeriod {
  /** Hard weekly token cap. */
  limitTokens: number;
  /** Tokens consumed since `weekStartedAt`. */
  usedTokens: number;
  /** ISO-8601 instant the current week opened (typically Monday 00:00 local). */
  weekStartedAt: string;
}

/**
 * Raw usage payload. Labels are preformatted for the reference clock
 * (America/New_York) so a server can own timezone display. The client
 * recomputes the reset countdown from `resetAt` when it ticks.
 */
export interface UsageSnapshot {
  source: UsageSource;
  /** ISO-8601 instant the numbers were measured. */
  asOf: string;
  /** Human clock for the footer, e.g. "Sun, Nov 22, 7:46 PM EST". */
  asOfLabel: string;
  /** Inclusive week range, e.g. "Nov 16 – Nov 22". */
  weekLabel: string;
  /** ISO-8601 instant the weekly limit resets. */
  resetAt: string;
  /** Human reset clock, e.g. "Monday, Nov 23, 12:00 AM EST". */
  resetLabel: string;
  period: UsagePeriod;
  bots: BotUsage[];
  routines: RoutineUsage[];
  /** Trailing 30 calendar days, oldest first. */
  daily: DailyUsage[];
}
