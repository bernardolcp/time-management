"use client";

import { useState, useEffect, useCallback } from "react";

// --- Helpers ---

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatWeekLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function velocityLabel(v: string): { text: string; color: string } {
  if (v === "ahead") return { text: "Ahead", color: "bg-tempo-olive-light text-tempo-text" };
  if (v === "on_track") return { text: "On track", color: "bg-tempo-blue-light text-tempo-text" };
  return { text: "Behind", color: "bg-tempo-accent text-white" };
}

// --- Types ---

interface DailyReview {
  score: number;
  review_text: string;
  stats: {
    tasks_completed: number;
    tasks_total: number;
    deep_work_minutes: number;
    completion_rate: number;
  };
}

interface WeeklyReview {
  weekly_score: number;
  review_text: string;
  stats: {
    avg_daily_score: number;
    total_deep_work: number;
    best_day: { date: string; score: number } | null;
    worst_day: { date: string; score: number } | null;
    streak: number;
    goal_velocity: { area: string; title: string; velocity: string }[];
  };
}

interface ManualReview {
  week_start: string;
  wins: string;
  didnt_work: string;
  deep_work_hours: number;
  notes: string;
}

// --- Main Page ---

export default function ReviewPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [dailyReviews, setDailyReviews] = useState<Record<string, DailyReview>>({});
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);
  const [manualReview, setManualReview] = useState<ManualReview>({
    week_start: "",
    wins: "",
    didnt_work: "",
    deep_work_hours: 0,
    notes: "",
  });
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [loadingDaily, setLoadingDaily] = useState<string | null>(null);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [manualSaved, setManualSaved] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const weekKey = formatDate(weekStart);
  const weekDates = Array.from({ length: 7 }, (_, i) => formatDate(addDays(weekStart, i)));

  // Fetch existing daily reviews
  useEffect(() => {
    const fetchDailyReviews = async () => {
      const reviews: Record<string, DailyReview> = {};
      const promises = weekDates.map(async (date) => {
        try {
          const res = await fetch(`/api/review/daily?date=${date}`);
          if (res.ok) {
            const data = await res.json();
            if (data.score !== undefined && !data.error) {
              reviews[date] = data;
            }
          }
        } catch { /* skip */ }
      });
      await Promise.all(promises);
      setDailyReviews(reviews);
    };
    fetchDailyReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  // Fetch manual review
  useEffect(() => {
    fetch(`/api/reviews?week_start=${weekKey}`)
      .then((res) => res.json())
      .then((data) => {
        setManualReview({
          week_start: data.week_start ?? weekKey,
          wins: data.wins ?? "",
          didnt_work: data.didnt_work ?? "",
          deep_work_hours: data.deep_work_hours ?? 0,
          notes: data.notes ?? "",
        });
      });
  }, [weekKey]);

  useEffect(() => {
    setWeeklyReview(null);
  }, [weekKey]);

  const generateWeeklyReview = useCallback(async () => {
    setLoadingWeekly(true);
    try {
      const res = await fetch(`/api/review/weekly?week_start=${weekKey}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.error) setWeeklyReview(data);
      }
    } catch { /* skip */ }
    setLoadingWeekly(false);
  }, [weekKey]);

  const generateDailyReview = async (date: string) => {
    setLoadingDaily(date);
    try {
      const res = await fetch(`/api/review/daily?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.error) setDailyReviews((prev) => ({ ...prev, [date]: data }));
      }
    } catch { /* skip */ }
    setLoadingDaily(null);
  };

  const saveManual = useCallback(async () => {
    await fetch("/api/reviews", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        week_start: weekKey,
        wins: manualReview.wins,
        didnt_work: manualReview.didnt_work,
        deep_work_hours: manualReview.deep_work_hours,
        notes: manualReview.notes,
      }),
    });
    setManualSaved(true);
    setTimeout(() => setManualSaved(false), 2000);
  }, [weekKey, manualReview]);

  function prevWeek() { setWeekStart((prev) => addDays(prev, -7)); }
  function nextWeek() { setWeekStart((prev) => addDays(prev, 7)); }

  // Stats
  const reviewEntries = Object.values(dailyReviews);
  const avgScore = reviewEntries.length > 0
    ? Math.round(reviewEntries.reduce((s, r) => s + r.score, 0) / reviewEntries.length)
    : 0;
  const totalDeepMinutes = reviewEntries.reduce((s, r) => s + r.stats.deep_work_minutes, 0);
  const totalCompleted = reviewEntries.reduce((s, r) => s + r.stats.tasks_completed, 0);
  const totalTasks = reviewEntries.reduce((s, r) => s + r.stats.tasks_total, 0);
  const avgCompletionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return (
    <div style={{ maxWidth: "720px" }}>
      {/* Header */}
      <div className="flex items-end justify-between mb-8 pb-4 border-b border-tempo-border">
        <div>
          <h1 className="font-display text-tempo-text" style={{ fontSize: "36px", lineHeight: "1.1" }}>
            Review
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={prevWeek} className="font-ui text-tempo-muted hover:text-tempo-text transition-colors text-sm">
            ←
          </button>
          <span className="font-ui text-[13px] text-tempo-text font-medium">
            {formatWeekLabel(weekStart)} – {formatWeekLabel(addDays(weekStart, 6))}
          </span>
          <button onClick={nextWeek} className="font-ui text-tempo-muted hover:text-tempo-text transition-colors text-sm">
            →
          </button>
        </div>
      </div>

      {/* Daily Scores */}
      <section className="mb-10">
        <h2
          className="font-ui font-medium text-tempo-muted mb-4"
          style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
        >
          Daily Scores
        </h2>
        <div className="grid grid-cols-7 gap-3">
          {weekDates.map((date, i) => {
            const review = dailyReviews[date];
            const isExpanded = expandedDay === date;
            const isLoading = loadingDaily === date;
            const dayLabel = DAY_NAMES[i];
            const shortDate = new Date(date + "T12:00:00").getDate();

            return (
              <div key={date}>
                <button
                  onClick={() => setExpandedDay(isExpanded ? null : date)}
                  className={`w-full border p-3 text-center transition-all ${
                    isExpanded ? "border-tempo-text" : "border-tempo-border hover:border-tempo-muted"
                  }`}
                >
                  <div className="font-ui text-[11px] text-tempo-muted mb-0.5" style={{ letterSpacing: "0.04em" }}>
                    {dayLabel}
                  </div>
                  <div className="font-ui text-[10px] text-tempo-border mb-2">{shortDate}</div>
                  {review ? (
                    <>
                      <div className="font-display text-tempo-text" style={{ fontSize: "28px", lineHeight: "1" }}>
                        {review.score}
                      </div>
                      <div className="font-ui text-[10px] text-tempo-muted mt-1">
                        {review.stats.tasks_completed}/{review.stats.tasks_total}
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        generateDailyReview(date);
                      }}
                      disabled={isLoading}
                      className="font-ui text-[10px] text-tempo-muted hover:text-tempo-text transition-colors mt-2"
                    >
                      {isLoading ? "..." : "Generate"}
                    </button>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Expanded Review */}
        {expandedDay && dailyReviews[expandedDay] && (
          <div className="mt-4 pl-6 border-l-2 border-tempo-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-ui text-[11px] font-medium uppercase text-tempo-muted" style={{ letterSpacing: "0.08em" }}>
                {new Date(expandedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <button
                onClick={() => setExpandedDay(null)}
                className="font-ui text-[11px] text-tempo-muted hover:text-tempo-text transition-colors"
              >
                Close
              </button>
            </div>
            <p className="font-body text-[15px] text-tempo-text whitespace-pre-wrap" style={{ color: "var(--journal)", lineHeight: "1.65" }}>
              {dailyReviews[expandedDay].review_text}
            </p>
          </div>
        )}
      </section>

      {/* Stats */}
      <section className="mb-10">
        <h2
          className="font-ui font-medium text-tempo-muted mb-4"
          style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
        >
          Week Summary
        </h2>
        <div className="grid grid-cols-4 gap-0 border border-tempo-border">
          {[
            { label: "Avg Score", value: String(avgScore) },
            { label: "Deep Work", value: `${(totalDeepMinutes / 60).toFixed(1)}h` },
            { label: "Tasks", value: `${totalCompleted}/${totalTasks}` },
            { label: "Completion", value: `${avgCompletionRate}%` },
          ].map((item, i) => (
            <div key={i} className={`p-4 text-center ${i < 3 ? "border-r border-tempo-border" : ""}`}>
              <div className="font-display text-tempo-text" style={{ fontSize: "28px", lineHeight: "1" }}>
                {item.value}
              </div>
              <div className="font-ui text-[10px] text-tempo-muted uppercase mt-1" style={{ letterSpacing: "0.08em" }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly AI Review */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2
            className="font-ui font-medium text-tempo-muted"
            style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
          >
            AI Review
          </h2>
          <button
            onClick={generateWeeklyReview}
            disabled={loadingWeekly}
            className="font-ui text-[12px] text-tempo-muted hover:text-tempo-text disabled:opacity-50 transition-colors"
            style={{ letterSpacing: "0.04em" }}
          >
            {loadingWeekly ? "Generating..." : weeklyReview ? "Regenerate" : "Generate"}
          </button>
        </div>

        {weeklyReview ? (
          <div className="space-y-5">
            {/* Score + stats */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="font-display text-tempo-text" style={{ fontSize: "40px", lineHeight: "1" }}>
                  {weeklyReview.weekly_score}
                </div>
                <div className="font-ui text-[10px] text-tempo-muted uppercase mt-1" style={{ letterSpacing: "0.08em" }}>
                  Weekly Score
                </div>
              </div>
              <div>
                <div className="font-display text-tempo-text" style={{ fontSize: "28px" }}>
                  {weeklyReview.stats.avg_daily_score}
                </div>
                <div className="font-ui text-[10px] text-tempo-muted uppercase mt-1" style={{ letterSpacing: "0.08em" }}>
                  Daily Avg
                </div>
              </div>
              <div>
                <div className="font-display text-tempo-text" style={{ fontSize: "28px" }}>
                  {(weeklyReview.stats.total_deep_work / 60).toFixed(1)}h
                </div>
                <div className="font-ui text-[10px] text-tempo-muted uppercase mt-1" style={{ letterSpacing: "0.08em" }}>
                  Deep Work
                </div>
              </div>
              <div>
                <div className="font-display text-tempo-text" style={{ fontSize: "28px" }}>
                  {weeklyReview.stats.streak}
                </div>
                <div className="font-ui text-[10px] text-tempo-muted uppercase mt-1" style={{ letterSpacing: "0.08em" }}>
                  Day Streak
                </div>
              </div>
            </div>

            {/* Goal Velocity */}
            {weeklyReview.stats.goal_velocity.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {weeklyReview.stats.goal_velocity.map((g) => {
                  const { text, color } = velocityLabel(g.velocity);
                  return (
                    <span
                      key={g.area + g.title}
                      className={`font-ui px-2 py-0.5 ${color}`}
                      style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em" }}
                    >
                      {g.area}: {text}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Review text — journal style */}
            <div className="pl-6 border-l-2 border-tempo-border">
              <p className="font-body text-[15px] whitespace-pre-wrap" style={{ color: "var(--journal)", lineHeight: "1.65" }}>
                {weeklyReview.review_text}
              </p>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-tempo-border py-10 text-center">
            <p className="font-body text-tempo-muted text-sm">
              Generate a weekly review to see your AI analysis.
            </p>
            {Object.keys(dailyReviews).length === 0 && (
              <p className="font-ui text-[11px] text-tempo-border mt-2">Generate daily reviews first for richer insights.</p>
            )}
          </div>
        )}
      </section>

      {/* Manual Notes */}
      <section className="mb-8">
        <button
          onClick={() => setManualOpen(!manualOpen)}
          className="flex items-center gap-2 font-ui font-medium text-tempo-muted mb-4 hover:text-tempo-text transition-colors"
          style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
        >
          <span style={{ display: "inline-block", transform: manualOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
            →
          </span>
          Manual Notes
          {manualSaved && (
            <span className="text-tempo-accent font-medium normal-case tracking-normal ml-2">Saved</span>
          )}
        </button>

        {manualOpen && (
          <div className="space-y-5 pl-6 border-l-2 border-tempo-border">
            <div>
              <label className="font-ui text-[11px] font-medium uppercase text-tempo-muted mb-2 block" style={{ letterSpacing: "0.08em" }}>
                Wins
              </label>
              <textarea
                value={manualReview.wins}
                onChange={(e) => setManualReview((prev) => ({ ...prev, wins: e.target.value }))}
                onBlur={saveManual}
                rows={3}
                className="w-full font-body text-[15px] border border-tempo-border bg-transparent px-3 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent focus:outline-none transition-colors resize-none"
                placeholder="What went well this week?"
              />
            </div>

            <div>
              <label className="font-ui text-[11px] font-medium uppercase text-tempo-muted mb-2 block" style={{ letterSpacing: "0.08em" }}>
                Didn&apos;t work
              </label>
              <textarea
                value={manualReview.didnt_work}
                onChange={(e) => setManualReview((prev) => ({ ...prev, didnt_work: e.target.value }))}
                onBlur={saveManual}
                rows={3}
                className="w-full font-body text-[15px] border border-tempo-border bg-transparent px-3 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent focus:outline-none transition-colors resize-none"
                placeholder="What didn't work?"
              />
            </div>

            <div>
              <label className="font-ui text-[11px] font-medium uppercase text-tempo-muted mb-2 block" style={{ letterSpacing: "0.08em" }}>
                Deep work hours
              </label>
              <input
                type="number"
                value={manualReview.deep_work_hours}
                onChange={(e) => setManualReview((prev) => ({ ...prev, deep_work_hours: parseFloat(e.target.value) || 0 }))}
                onBlur={saveManual}
                min={0}
                step={0.5}
                className="w-24 font-ui text-sm border border-tempo-border bg-transparent px-2 py-1.5 text-tempo-text focus:border-tempo-accent focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="font-ui text-[11px] font-medium uppercase text-tempo-muted mb-2 block" style={{ letterSpacing: "0.08em" }}>
                Notes
              </label>
              <textarea
                value={manualReview.notes}
                onChange={(e) => setManualReview((prev) => ({ ...prev, notes: e.target.value }))}
                onBlur={saveManual}
                rows={3}
                className="w-full font-body text-[15px] border border-tempo-border bg-transparent px-3 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent focus:outline-none transition-colors resize-none"
                placeholder="Any other reflections..."
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
