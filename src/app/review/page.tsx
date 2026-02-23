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
  return d.toLocaleDateString("pt-BR", { month: "short", day: "numeric" });
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-500";
  if (score >= 40) return "text-orange-500";
  return "text-red-500";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-50 border-emerald-200";
  if (score >= 60) return "bg-amber-50 border-amber-200";
  if (score >= 40) return "bg-orange-50 border-orange-200";
  return "bg-red-50 border-red-200";
}

function scoreRingColor(score: number): string {
  if (score >= 80) return "stroke-emerald-500";
  if (score >= 60) return "stroke-amber-500";
  if (score >= 40) return "stroke-orange-500";
  return "stroke-red-500";
}

function velocityLabel(v: string): { text: string; color: string } {
  if (v === "ahead") return { text: "Adiantado", color: "text-emerald-600 bg-emerald-50" };
  if (v === "on_track") return { text: "No ritmo", color: "text-amber-600 bg-amber-50" };
  return { text: "Atrasado", color: "text-red-600 bg-red-50" };
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

// --- Score Circle Component ---

function ScoreCircle({
  score,
  size = 64,
  strokeWidth = 4,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-200"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={scoreRingColor(score)}
        />
      </svg>
      <span className={`absolute text-sm font-bold ${scoreColor(score)}`}>
        {score}
      </span>
    </div>
  );
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

  // Fetch existing daily reviews for the week
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
        } catch {
          // skip
        }
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

  // Fetch weekly AI review if it exists (triggered separately)
  const generateWeeklyReview = useCallback(async () => {
    setLoadingWeekly(true);
    try {
      const res = await fetch(`/api/review/weekly?week_start=${weekKey}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.error) {
          setWeeklyReview(data);
        }
      }
    } catch {
      // skip
    }
    setLoadingWeekly(false);
  }, [weekKey]);

  // Reset weekly review on week change
  useEffect(() => {
    setWeeklyReview(null);
  }, [weekKey]);

  const generateDailyReview = async (date: string) => {
    setLoadingDaily(date);
    try {
      const res = await fetch(`/api/review/daily?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.error) {
          setDailyReviews((prev) => ({ ...prev, [date]: data }));
        }
      }
    } catch {
      // skip
    }
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

  function prevWeek() {
    setWeekStart((prev) => addDays(prev, -7));
  }

  function nextWeek() {
    setWeekStart((prev) => addDays(prev, 7));
  }

  // Compute aggregate stats from available daily reviews
  const reviewEntries = Object.values(dailyReviews);
  const avgScore = reviewEntries.length > 0
    ? Math.round(reviewEntries.reduce((s, r) => s + r.score, 0) / reviewEntries.length)
    : 0;
  const totalDeepMinutes = reviewEntries.reduce((s, r) => s + r.stats.deep_work_minutes, 0);
  const totalCompleted = reviewEntries.reduce((s, r) => s + r.stats.tasks_completed, 0);
  const totalTasks = reviewEntries.reduce((s, r) => s + r.stats.tasks_total, 0);
  const avgCompletionRate = totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header with Week Selector and Weekly Score */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-zinc-900">Review</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={prevWeek}
              className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            <span className="text-sm font-medium text-zinc-600">
              {formatWeekLabel(weekStart)} - {formatWeekLabel(addDays(weekStart, 6))}
            </span>
            <button
              onClick={nextWeek}
              className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
        {weeklyReview && (
          <ScoreCircle score={weeklyReview.weekly_score} size={56} strokeWidth={4} />
        )}
      </div>

      {/* Daily Scores Grid */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Daily Scores</h2>
        <div className="grid grid-cols-7 gap-3">
          {weekDates.map((date, i) => {
            const review = dailyReviews[date];
            const isExpanded = expandedDay === date;
            const isLoading = loadingDaily === date;
            const dayLabel = DAY_NAMES[i];
            const shortDate = new Date(date + "T00:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" });

            return (
              <div key={date} className="col-span-1">
                <div
                  className={`rounded-lg border p-3 transition-all cursor-pointer ${
                    review ? scoreBg(review.score) : "bg-zinc-50 border-zinc-200"
                  } ${isExpanded ? "ring-2 ring-zinc-400" : "hover:shadow-sm"}`}
                  onClick={() => setExpandedDay(isExpanded ? null : date)}
                >
                  <div className="text-center">
                    <div className="text-xs font-semibold text-zinc-500 mb-1">{dayLabel}</div>
                    <div className="text-[10px] text-zinc-400 mb-2">{shortDate}</div>
                    {review ? (
                      <>
                        <ScoreCircle score={review.score} size={44} strokeWidth={3} />
                        <div className="mt-2 text-[10px] text-zinc-500">
                          {review.stats.tasks_completed}/{review.stats.tasks_total}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {review.stats.deep_work_minutes}min
                        </div>
                      </>
                    ) : (
                      <div className="py-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            generateDailyReview(date);
                          }}
                          disabled={isLoading}
                          className="text-[10px] px-2 py-1 rounded bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                        >
                          {isLoading ? (
                            <span className="inline-flex items-center gap-1">
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              ...
                            </span>
                          ) : (
                            "Gerar"
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Expanded Daily Review */}
        {expandedDay && dailyReviews[expandedDay] && (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-700">
                Review - {new Date(expandedDay + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              <button
                onClick={() => setExpandedDay(null)}
                className="text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="prose prose-sm prose-zinc max-w-none text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed">
              {dailyReviews[expandedDay].review_text}
            </div>
          </div>
        )}
      </section>

      {/* Weekly AI Review */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Weekly AI Review</h2>
          <button
            onClick={generateWeeklyReview}
            disabled={loadingWeekly}
            className="text-xs px-3 py-1.5 rounded-md bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loadingWeekly ? (
              <>
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Gerando...
              </>
            ) : (
              weeklyReview ? "Regenerar Review" : "Gerar Weekly Review"
            )}
          </button>
        </div>

        {weeklyReview ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm space-y-5">
            {/* Score + Stats Row */}
            <div className="flex items-start gap-6">
              <ScoreCircle score={weeklyReview.weekly_score} size={80} strokeWidth={5} />
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-zinc-400">Media diaria</div>
                  <div className="text-lg font-bold text-zinc-800">{weeklyReview.stats.avg_daily_score}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-400">Deep Work</div>
                  <div className="text-lg font-bold text-zinc-800">{(weeklyReview.stats.total_deep_work / 60).toFixed(1)}h</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-400">Streak</div>
                  <div className="text-lg font-bold text-zinc-800">{weeklyReview.stats.streak} dias</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-400">Melhor dia</div>
                  <div className="text-lg font-bold text-zinc-800">
                    {weeklyReview.stats.best_day
                      ? `${weeklyReview.stats.best_day.score}`
                      : "-"}
                  </div>
                </div>
              </div>
            </div>

            {/* Goal Velocity */}
            {weeklyReview.stats.goal_velocity.length > 0 && (
              <div>
                <div className="text-xs font-medium text-zinc-500 mb-2">Velocidade das Metas</div>
                <div className="flex flex-wrap gap-2">
                  {weeklyReview.stats.goal_velocity.map((g) => {
                    const { text, color } = velocityLabel(g.velocity);
                    return (
                      <span
                        key={g.area + g.title}
                        className={`text-xs px-2 py-1 rounded-full font-medium ${color}`}
                      >
                        {g.area}: {text}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Review Text */}
            <div className="prose prose-sm prose-zinc max-w-none text-sm text-zinc-600 whitespace-pre-wrap leading-relaxed border-t border-zinc-100 pt-4">
              {weeklyReview.review_text}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-400">
            Clique em &quot;Gerar Weekly Review&quot; para gerar a analise da semana com AI.
            {Object.keys(dailyReviews).length === 0 && (
              <div className="mt-2 text-xs">Gere os daily reviews primeiro para ter dados mais ricos.</div>
            )}
          </div>
        )}
      </section>

      {/* Stats Summary */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">Stats da Semana</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-400 mb-1">Score medio</div>
            <div className={`text-2xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-400 mb-1">Deep Work total</div>
            <div className="text-2xl font-bold text-zinc-800">{(totalDeepMinutes / 60).toFixed(1)}h</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-400 mb-1">Tarefas</div>
            <div className="text-2xl font-bold text-zinc-800">{totalCompleted}/{totalTasks}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-xs text-zinc-400 mb-1">Completion Rate</div>
            <div className={`text-2xl font-bold ${scoreColor(avgCompletionRate)}`}>{avgCompletionRate}%</div>
          </div>
        </div>
      </section>

      {/* Manual Notes (Collapsible) */}
      <section className="mb-8">
        <button
          onClick={() => setManualOpen(!manualOpen)}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4 hover:text-zinc-700 transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${manualOpen ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          Manual Notes
          {manualSaved && (
            <span className="text-xs text-emerald-600 font-medium normal-case tracking-normal ml-2">Saved!</span>
          )}
        </button>

        {manualOpen && (
          <div className="rounded-lg border border-zinc-200 bg-white p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Wins (what went well)
              </label>
              <textarea
                value={manualReview.wins}
                onChange={(e) => setManualReview((prev) => ({ ...prev, wins: e.target.value }))}
                onBlur={saveManual}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none"
                placeholder="What went well this week?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Didn&apos;t work
              </label>
              <textarea
                value={manualReview.didnt_work}
                onChange={(e) => setManualReview((prev) => ({ ...prev, didnt_work: e.target.value }))}
                onBlur={saveManual}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none"
                placeholder="What didn't work? What would you change?"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Deep work hours
              </label>
              <input
                type="number"
                value={manualReview.deep_work_hours}
                onChange={(e) =>
                  setManualReview((prev) => ({
                    ...prev,
                    deep_work_hours: parseFloat(e.target.value) || 0,
                  }))
                }
                onBlur={saveManual}
                min={0}
                step={0.5}
                className="w-32 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Notes
              </label>
              <textarea
                value={manualReview.notes}
                onChange={(e) => setManualReview((prev) => ({ ...prev, notes: e.target.value }))}
                onBlur={saveManual}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none"
                placeholder="Any other thoughts or reflections..."
              />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
