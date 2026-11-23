import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getUsage } from "./data/source";
import { deriveView } from "./lib/metrics";
import { RoutineTable } from "./components/RoutineTable";
import { UsageChart } from "./components/UsageChart";

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={spinning ? "icon spin" : "icon"}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
  );
}

export function App() {
  const query = useQuery({
    queryKey: ["usage"],
    queryFn: getUsage,
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (query.isPending) {
    return (
      <main className="page">
        <header className="header">
          <div>
            <p className="kicker">Grok Bot</p>
            <h1 className="title">Weekly usage</h1>
          </div>
        </header>
        <section className="state" aria-busy="true">
          <h2>Loading usage</h2>
          <p>Reading the latest sample.</p>
        </section>
      </main>
    );
  }

  if (query.isError || !query.data) {
    const message = query.error instanceof Error ? query.error.message : "Usage request failed";
    return (
      <main className="page">
        <header className="header">
          <div>
            <p className="kicker">Grok Bot</p>
            <h1 className="title">Weekly usage</h1>
          </div>
        </header>
        <section className="state" role="alert">
          <h2>Could not load usage</h2>
          <p>{message}</p>
          <button type="button" className="refresh" onClick={() => void query.refetch()}>
            <RefreshIcon spinning={query.isFetching} />
            Try again
          </button>
        </section>
      </main>
    );
  }

  const snapshot = query.data;
  const view = deriveView(snapshot, now);
  const sample = snapshot.source === "mock";
  const barWidth = Math.max(0, Math.min(100, view.pct));
  const flagAside =
    view.flags.length === 0
      ? "None"
      : `${view.highCount} high${view.watchCount ? ` · ${view.watchCount} watch` : ""}`;

  return (
    <main className="page" aria-busy={query.isFetching}>
      <header className="header">
        <div>
          <p className="kicker">Grok Bot</p>
          <h1 className="title">Weekly usage</h1>
          <p className="subtitle">
            {snapshot.weekLabel}
            <span className="faint"> · </span>
            {sample ? "Mock feed" : "Live feed"}
            {sample ? <span className="badge">Sample data</span> : null}
          </p>
        </div>
        <button
          type="button"
          className="refresh"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshIcon spinning={query.isFetching} />
          {query.isFetching ? "Refreshing" : "Refresh"}
        </button>
      </header>

      {query.isError ? (
        <p className="alert" role="alert">
          Could not refresh. The last numbers are still showing.
        </p>
      ) : null}

      <section className="card limit">
        <div className="limit-top">
          <p className="muted">Weekly limit</p>
          <p className="reset-copy">
            Resets {snapshot.resetLabel}
            <span className="countdown">in {view.resetInLabel}</span>
          </p>
        </div>
        <p className="pct">
          {view.pctLabel}
          <span className="pct-unit">%</span>
        </p>
        <p className="token-line">
          <span className="mono">{view.usedLabel}</span> of <span className="mono">{view.limitLabel}</span> tokens
        </p>
        <div
          className="track limit-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(view.pct)}
          aria-label="Weekly token limit used"
        >
          <div className={view.pct >= 85 ? "fill warn" : "fill"} style={{ width: `${barWidth}%` }} />
        </div>
        <dl className="stat-grid">
          <div>
            <dt>Projected</dt>
            <dd className={view.overPace ? "warn" : undefined}>{view.projectionLabel}%</dd>
          </div>
          <div>
            <dt>Calls</dt>
            <dd>{view.totalCallsLabel}</dd>
          </div>
          <div>
            <dt>Loops</dt>
            <dd className={view.flags.length > 0 ? "warn" : undefined}>{view.flags.length}</dd>
          </div>
        </dl>
      </section>

      <div className="board">
        <div className="split chart-row">
          <section className="card">
            <div className="section-head">
              <h2>Daily usage</h2>
              <p className="aside">{view.spikeCount === 1 ? "1 spike" : `${view.spikeCount} spikes`}</p>
            </div>
            <p className="sr-only">
              {view.spikeCount} spike days in the last 30. Peak was {view.peakLabel} tokens on {view.peakDay}.
            </p>
            <UsageChart daily={view.daily} />
            <div className="legend">
              <span>
                <span className="swatch" aria-hidden="true" />
                Last 30 days
              </span>
              <span>
                <span className="swatch spike" aria-hidden="true" />
                Spike, above mean + 1.25 sd
              </span>
            </div>
          </section>

          <section className="card">
            <div className="section-head">
              <h2>High-frequency loops</h2>
              <p className="aside">{flagAside}</p>
            </div>
            {view.flags.length === 0 ? (
              <p className="empty">No routine is calling often enough to flag.</p>
            ) : (
              <ul className="flags">
                {view.flags.map((flag) => (
                  <li key={flag.id}>
                    <div className="row-top">
                      <p className="name">{flag.routineName}</p>
                      <p className="tag">{flag.severity === "high" ? "Loop" : "Watch"}</p>
                    </div>
                    <p className="bot-name">{flag.botName}</p>
                    <p className="reason">{flag.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="split detail-row">
          <section className="card">
            <div className="section-head">
              <h2>By bot</h2>
              <p className="aside">Tokens this week</p>
            </div>
            <ul className="bots">
              {view.bots.map((bot) => (
                <li key={bot.id}>
                  <div className="bot-top">
                    <p className="name">{bot.name}</p>
                    <p className="mono">{bot.tokenLabel}</p>
                  </div>
                  <div className="track bot-track">
                    <div className="fill series" style={{ width: `${Math.max(bot.share * 100, 2)}%` }} />
                  </div>
                  <p className="share">
                    <span className="mono">{bot.callLabel}</span> calls · {bot.shareLabel} of tokens
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <div className="section-head">
              <h2>By routine</h2>
              <p className="aside">Calls, tokens, cadence</p>
            </div>
            <RoutineTable routines={view.routines} />
          </section>
        </div>

        <section className="card">
          <h2>Saving tips</h2>
          <ol className="tips">
            {view.tips.map((tip, index) => (
              <li key={tip.title}>
                <span className="index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="name">{tip.title}</p>
                  <p className="reason">{tip.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <p className="footnote" aria-live="polite">
        As of {snapshot.asOfLabel}.{" "}
        {sample
          ? "Sample numbers — refresh pulls a new sample until a usage API is connected."
          : "Live usage."}
      </p>
    </main>
  );
}
