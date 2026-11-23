import { useState } from "react";
import type { DailyPoint } from "../lib/metrics";

interface UsageChartProps {
  daily: DailyPoint[];
}

export function UsageChart({ daily }: UsageChartProps) {
  const [active, setActive] = useState<string | null>(null);
  const peak = daily.reduce((max, day) => Math.max(max, day.tokens), 0);
  const ticks = daily.filter((_, index) => index % 5 === 0 || index === daily.length - 1);

  return (
    <div className="chart-wrap">
      <div className="chart" role="img" aria-label="Daily token usage for the last 30 days">
        {daily.map((day) => {
          const height = peak === 0 ? 0 : Math.max(2, (day.tokens / peak) * 100);
          const open = active === day.date;
          return (
            <button
              key={day.date}
              type="button"
              className="bar-col"
              aria-pressed={open}
              aria-label={`${day.label}, ${day.tokenLabel} tokens, ${day.callLabel} calls${day.spike ? ", spike" : ""}`}
              onClick={() => setActive(open ? null : day.date)}
              onMouseEnter={() => setActive(day.date)}
              onMouseLeave={() => setActive((current) => (current === day.date ? null : current))}
              onFocus={() => setActive(day.date)}
              onBlur={() => setActive((current) => (current === day.date ? null : current))}
            >
              <span className={day.spike ? "bar spike" : "bar"} style={{ height: `${height}%` }} />
              {open ? (
                <span className="tooltip" role="tooltip">
                  <p className="muted">{day.label}</p>
                  <p className="mono">{day.tokenLabel} tokens</p>
                  <p className="mono calls">{day.callLabel} calls</p>
                  {day.spike ? <p className="spike-label">Spike</p> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="axis" aria-hidden="true">
        {ticks.map((day) => (
          <span key={day.date}>{day.label}</span>
        ))}
      </div>
    </div>
  );
}
