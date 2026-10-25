"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

// --- Types ---

interface OvercommitmentData {
  status: "green" | "yellow" | "red";
  available_minutes: number;
  committed_minutes: number;
  remaining_minutes: number;
  deep_blocks: number;
}

interface Task {
  id: number;
  date: string;
  title: string;
  type: "deep" | "shallow";
  estimated_minutes: number;
  completed: number;
  is_frog: number;
  goal_id: number | null;
  sort_order: number;
}

interface Goal {
  id: number;
  title: string;
  area: string;
  unit: string;
  q1_target: number;
  q1_actual: number;
  q2_target: number;
  q2_actual: number;
  q3_target: number;
  q3_actual: number;
  q4_target: number;
  q4_actual: number;
}

interface DailyEntry {
  id: number;
  date: string;
  energy_level: number;
  focus_word: string;
  training: number;
  spiritual: number;
  family_day: number;
  content_creation: number;
  coach_advice: string;
}

interface GoalVelocity {
  goal_id: number;
  area: string;
  title: string;
  velocity: number;
  status: "ahead" | "on_track" | "behind" | "critical";
  target: number;
  actual: number;
}

interface Achievement {
  id: string;
  name: string;
  unlocked: boolean;
}

interface ScoresData {
  daily_score: number;
  streak: number;
  weekly_avg: number;
  weekly_trend: "up" | "down" | "flat";
  prev_weekly_avg: number;
  goal_velocity: GoalVelocity[];
  achievements: Achievement[];
  total_tasks_completed: number;
  total_deep_work_hours: number;
  today_deep_work_hours: number;
  tasks_completed_today: number;
  tasks_total_today: number;
}

// --- Helpers ---

function formatMinutes(n: number): string {
  const abs = Math.abs(n);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = n < 0 ? "-" : "";
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function getTodayISO(): string {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

// --- Component ---

export default function Dashboard() {
  const [overcommitment, setOvercommitment] = useState<OvercommitmentData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dailyEntry, setDailyEntry] = useState<DailyEntry | null>(null);
  const [scores, setScores] = useState<ScoresData | null>(null);
  const [, setScoresLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  // Coach state
  const [coachResponse, setCoachResponse] = useState<string>("");
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachQuestion, setCoachQuestion] = useState("");

  const today = getTodayISO();

  const fetchOvercommitment = useCallback(async () => {
    const res = await fetch(`/api/overcommitment?date=${today}`);
    if (res.ok) setOvercommitment(await res.json());
  }, [today]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?date=${today}`);
    if (res.ok) setTasks(await res.json());
  }, [today]);

  const fetchGoals = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) setGoals(await res.json());
  }, []);

  const fetchDailyEntry = useCallback(async () => {
    const res = await fetch(`/api/daily-entry?date=${today}`);
    if (res.ok) {
      const data = await res.json();
      setDailyEntry(data);
    }
  }, [today]);

  const fetchScores = useCallback(async () => {
    setScoresLoading(true);
    try {
      const res = await fetch(`/api/scores?date=${today}`);
      if (res.ok) setScores(await res.json());
    } catch (_error) {
      // scores are non-critical
    }
    setScoresLoading(false);
  }, [today]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      await Promise.all([fetchOvercommitment(), fetchTasks(), fetchGoals(), fetchDailyEntry(), fetchScores()]);
      setLoading(false);
    }
    loadAll();
  }, [fetchOvercommitment, fetchTasks, fetchGoals, fetchDailyEntry, fetchScores]);

  // --- Toggle task completed ---

  async function toggleTask(task: Task) {
    const newCompleted = task.completed ? 0 : 1;
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: newCompleted }),
    });
    if (res.ok) {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, completed: newCompleted } : t))
      );
      fetchOvercommitment();
    }
  }

  // --- Coach functions ---

  async function handleCoachCheck() {
    setCoachLoading(true);
    try {
      const completedTasks = tasks.filter((t) => t.completed).map((t) => t.title);
      const pendingTasks = tasks.filter((t) => !t.completed).map((t) => t.title);
      const goalSummary = goals.map((g) => `${g.area}: ${g.q1_actual}/${g.q1_target} ${g.unit}`);

      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "accountability_check",
          tasks_completed: completedTasks,
          tasks_pending: pendingTasks,
          goals: goalSummary,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCoachResponse(data.message || data.response || JSON.stringify(data));
      } else {
        setCoachResponse("Could not reach the coach right now. Try again later.");
      }
    } catch {
      setCoachResponse("Could not reach the coach right now. Try again later.");
    }
    setCoachLoading(false);
  }

  async function handleCoachQuestion() {
    if (!coachQuestion.trim()) return;
    setCoachLoading(true);
    try {
      const completedTasks = tasks.filter((t) => t.completed).map((t) => t.title);
      const pendingTasks = tasks.filter((t) => !t.completed).map((t) => t.title);

      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "accountability_check",
          context: coachQuestion,
          tasks_completed: completedTasks,
          tasks_pending: pendingTasks,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCoachResponse(data.message || data.response || JSON.stringify(data));
      } else {
        setCoachResponse("Could not reach the coach right now. Try again later.");
      }
    } catch {
      setCoachResponse("Could not reach the coach right now. Try again later.");
    }
    setCoachQuestion("");
    setCoachLoading(false);
  }

  // --- Grouped tasks ---

  const frogTasks = tasks.filter((t) => t.is_frog);
  const deepTasks = tasks.filter((t) => !t.is_frog && t.type === "deep");
  const shallowTasks = tasks.filter((t) => !t.is_frog && t.type === "shallow");
  const groupedTasks = [...frogTasks, ...deepTasks, ...shallowTasks];

  // --- Date parts ---

  const now = new Date();
  const dayNum = now.getDate();
  const monthName = now.toLocaleDateString("en-US", { month: "long" });
  const yearStr = now.getFullYear();
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });

  // --- Habits ---

  const habitLabels = ["Training", "Spiritual", "Family", "Creative"];
  const habitValues = dailyEntry
    ? [dailyEntry.training, dailyEntry.spiritual, dailyEntry.family_day, dailyEntry.content_creation]
    : [0, 0, 0, 0];

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="font-ui text-sm text-tempo-muted animate-pulse">Loading...</p>
      </div>
    );
  }

  // Overcommitment bar percentage
  const commitPct = overcommitment
    ? Math.min(Math.round((overcommitment.committed_minutes / Math.max(overcommitment.available_minutes, 1)) * 100), 100)
    : 0;

  const commitStatusLabel =
    overcommitment?.status === "red"
      ? "Over capacity"
      : overcommitment?.status === "yellow"
        ? "Near limit"
        : "On track";

  return (
    <div className="max-w-[640px] px-14 py-12">

      {/* ── Hero: Date ── */}
      <header className="mb-14">
        <p
          className="font-display leading-none text-tempo-text"
          style={{ fontSize: "96px", letterSpacing: "-0.04em" }}
        >
          {dayNum}
        </p>
        <div className="flex items-baseline gap-4 mt-1">
          <span className="font-ui text-sm font-medium uppercase text-tempo-text" style={{ letterSpacing: "0.12em" }}>
            {monthName}
          </span>
          <span className="font-ui text-sm text-tempo-muted" style={{ letterSpacing: "0.08em" }}>
            {yearStr}
          </span>
          <span className="font-ui text-sm text-tempo-muted ml-auto">
            {weekday}
          </span>
        </div>

        {/* Focus block */}
        {dailyEntry?.focus_word && (
          <div className="mt-6 pt-6 border-t border-tempo-border">
            <p className="font-ui text-[11px] font-medium uppercase text-tempo-muted mb-1" style={{ letterSpacing: "0.12em" }}>
              Today&apos;s intention
            </p>
            <p className="font-accent text-tempo-text" style={{ fontSize: "28px", lineHeight: "1.3" }}>
              {dailyEntry.focus_word}
            </p>
          </div>
        )}
      </header>

      {/* ── Metrics Row ── */}
      <div className="grid grid-cols-4 gap-8 mb-12 pb-12 border-b border-tempo-border">
        {/* Energy */}
        <div>
          <p className="font-display text-tempo-text" style={{ fontSize: "40px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
            {dailyEntry?.energy_level ?? "—"}
            <span className="font-ui text-base text-tempo-muted font-normal">/5</span>
          </p>
          <p className="font-ui text-[11px] text-tempo-muted uppercase mt-0.5" style={{ letterSpacing: "0.1em" }}>
            Energy
          </p>
        </div>

        {/* Score */}
        <div>
          <p className="font-display text-tempo-text" style={{ fontSize: "40px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
            {scores ? scores.daily_score : "—"}
          </p>
          <p className="font-ui text-[11px] text-tempo-muted uppercase mt-0.5" style={{ letterSpacing: "0.1em" }}>
            Daily Score
          </p>
          {scores && scores.weekly_trend === "up" && (
            <p className="font-ui text-xs text-tempo-text mt-1">
              +{Math.round(scores.weekly_avg - scores.prev_weekly_avg)} vs avg
            </p>
          )}
        </div>

        {/* Streak */}
        <div>
          <p className="font-display text-tempo-text" style={{ fontSize: "40px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
            {scores ? scores.streak : "—"}
          </p>
          <p className="font-ui text-[11px] text-tempo-muted uppercase mt-0.5" style={{ letterSpacing: "0.1em" }}>
            Day Streak
          </p>
        </div>

        {/* Deep Work */}
        <div>
          <p className="font-display text-tempo-text" style={{ fontSize: "40px", lineHeight: "1.1", letterSpacing: "-0.02em" }}>
            {scores ? scores.today_deep_work_hours : "—"}
            <span className="font-ui text-base text-tempo-muted font-normal">h</span>
          </p>
          <p className="font-ui text-[11px] text-tempo-muted uppercase mt-0.5" style={{ letterSpacing: "0.1em" }}>
            Deep Work
          </p>
        </div>
      </div>

      {/* ── Overcommitment Bar ── */}
      {overcommitment && (
        <div className="mb-12 pb-12 border-b border-tempo-border">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-ui text-[11px] font-medium uppercase text-tempo-muted" style={{ letterSpacing: "0.12em" }}>
              Time Allocation
            </span>
            <span className="font-ui text-xs text-tempo-muted">
              {commitStatusLabel}
            </span>
          </div>
          {/* Bar — 6px, no rounding, with threshold marker */}
          <div className="relative w-full" style={{ height: "6px", background: "var(--border)" }}>
            <div
              className="absolute left-0 top-0 h-full transition-all duration-700"
              style={{
                width: `${commitPct}%`,
                background: overcommitment.status === "red" ? "var(--accent)" : "var(--text)",
                opacity: overcommitment.status === "red" ? 1 : 0.25,
              }}
            />
            {/* Threshold tick at 100% */}
            <div
              className="absolute bg-tempo-text"
              style={{ left: "100%", top: "-6px", width: "1.5px", height: "18px" }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="font-ui text-xs text-tempo-muted">
              {formatMinutes(overcommitment.committed_minutes)} committed
            </span>
            <span className="font-ui text-xs text-tempo-muted">
              {formatMinutes(overcommitment.available_minutes)} available
            </span>
          </div>
        </div>
      )}

      {/* ── Daily Entry CTA (if missing) ── */}
      {!dailyEntry && (
        <Link
          href="/entry"
          className="block border border-dashed border-tempo-border p-8 text-center hover:border-tempo-accent transition-colors mb-12"
        >
          <p className="font-body text-tempo-muted text-lg">Start your day</p>
          <p className="font-ui text-xs text-tempo-accent mt-1" style={{ letterSpacing: "0.04em" }}>
            Set energy, focus word & habits
          </p>
        </Link>
      )}

      {/* ── Tasks: "Today" ── */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-5 pb-3 border-b border-tempo-border">
          <h2 className="font-display text-tempo-text" style={{ fontSize: "24px" }}>Today</h2>
          <Link href="/plan" className="font-ui text-xs text-tempo-muted hover:text-tempo-text transition-colors" style={{ letterSpacing: "0.04em" }}>
            View plan
          </Link>
        </div>

        {groupedTasks.length === 0 ? (
          <p className="font-body text-tempo-muted py-6">No tasks for today.</p>
        ) : (
          <div>
            {groupedTasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-start gap-3.5 py-3.5 border-b border-tempo-border ${
                  task.is_frog ? "border-l-[3px] border-l-tempo-accent pl-3.5 -ml-[3px]" : ""
                }`}
              >
                {/* Square checkbox */}
                <button
                  onClick={() => toggleTask(task)}
                  className="flex-shrink-0 mt-[3px] relative"
                  style={{ width: "16px", height: "16px" }}
                  aria-label={`Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`}
                >
                  <div
                    className={`w-full h-full transition-colors ${
                      task.completed
                        ? "border-tempo-text"
                        : "border-tempo-muted"
                    }`}
                    style={{ border: "1.5px solid" }}
                  />
                  {task.completed && (
                    <div
                      className="absolute"
                      style={{
                        left: "4px", top: "1px", width: "5px", height: "9px",
                        border: "solid var(--text)", borderWidth: "0 1.5px 1.5px 0",
                        transform: "rotate(45deg)"
                      }}
                    />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`font-body text-base leading-snug ${
                    task.completed ? "line-through text-tempo-muted" : "text-tempo-text"
                  }`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.is_frog ? (
                      <span
                        className="font-ui font-semibold uppercase inline-block bg-tempo-accent-light text-tempo-accent"
                        style={{ fontSize: "9px", letterSpacing: "0.14em", padding: "2px 7px" }}
                      >
                        Frog
                      </span>
                    ) : (
                      <span
                        className={`font-ui font-semibold uppercase inline-block ${
                          task.type === "deep"
                            ? "bg-tempo-blue-light text-tempo-text"
                            : "bg-tempo-surface text-tempo-muted"
                        }`}
                        style={{ fontSize: "9px", letterSpacing: "0.14em", padding: "2px 7px" }}
                      >
                        {task.type}
                      </span>
                    )}
                  </div>
                </div>

                {/* Time */}
                <span className={`font-ui text-[13px] text-tempo-muted flex-shrink-0 mt-[3px] tabular-nums ${
                  task.completed ? "line-through" : ""
                }`}>
                  {task.estimated_minutes} min
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Goals ── */}
      {goals.length > 0 && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-5 pb-3 border-b border-tempo-border">
            <h2 className="font-display text-tempo-text" style={{ fontSize: "24px" }}>Q1 Goals</h2>
            <Link href="/goals" className="font-ui text-xs text-tempo-muted hover:text-tempo-text transition-colors" style={{ letterSpacing: "0.04em" }}>
              All goals
            </Link>
          </div>

          {goals.slice(0, 4).map((goal) => {
            const target = goal.q1_target || 0;
            const actual = goal.q1_actual || 0;
            const pct = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;

            return (
              <div key={goal.id} className="py-4 border-b border-tempo-border last:border-b-0">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-body text-base text-tempo-text">{goal.title}</span>
                  <span className="font-ui text-[13px] text-tempo-muted tabular-nums">{pct}%</span>
                </div>
                {/* 3px progress bar — opacity-based */}
                <div className="relative w-full mt-1.5" style={{ height: "3px", background: "var(--border)" }}>
                  <div
                    className="absolute left-0 top-0 h-full bg-tempo-text transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      opacity: pct >= 75 ? 1 : pct >= 50 ? 0.5 : 0.25,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ── Habits (7-day dot matrix) ── */}
      {dailyEntry && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-5 pb-3 border-b border-tempo-border">
            <h2 className="font-display text-tempo-text" style={{ fontSize: "24px" }}>Habits</h2>
            <span className="font-ui text-[11px] text-tempo-muted uppercase" style={{ letterSpacing: "0.1em" }}>
              M &nbsp; T &nbsp; W &nbsp; T &nbsp;&nbsp; F &nbsp; S &nbsp; S
            </span>
          </div>

          {habitLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-3 py-2">
              <span className="font-ui text-[13px] text-tempo-text w-[120px] flex-shrink-0">{label}</span>
              <div className="flex gap-1.5">
                {/* 7 dots: simulate week data. Today = accent if done, empty dots for future */}
                {Array.from({ length: 7 }).map((_, dayIdx) => {
                  const isToday = dayIdx === new Date().getDay() - 1; // Mon=0
                  const isFuture = dayIdx > (new Date().getDay() - 1);
                  const isDone = isToday ? !!habitValues[i] : !isFuture && Math.random() > 0.3; // placeholder for past

                  let dotClass = "border-[1.5px] border-tempo-border bg-transparent"; // empty / future
                  if (isDone && isToday) {
                    dotClass = "bg-tempo-olive border-[1.5px] border-tempo-olive";
                  } else if (isDone) {
                    dotClass = "bg-tempo-olive border-[1.5px] border-tempo-olive opacity-60";
                  } else if (!isFuture && !isDone) {
                    dotClass = "bg-tempo-border border-[1.5px] border-tempo-border"; // missed
                  }

                  return (
                    <div
                      key={dayIdx}
                      className={`rounded-full ${dotClass}`}
                      style={{ width: "18px", height: "18px" }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Coach ── */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-5 pb-3 border-b border-tempo-border">
          <h2 className="font-display text-tempo-text" style={{ fontSize: "24px" }}>Coach</h2>
        </div>

        <button
          onClick={handleCoachCheck}
          disabled={coachLoading}
          className="font-ui text-[13px] font-medium bg-tempo-text text-tempo-bg px-6 py-2.5 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ letterSpacing: "0.04em" }}
        >
          {coachLoading ? "Thinking..." : "How's my day going?"}
        </button>

        {coachResponse && (
          <div className="mt-6 pl-6 border-l-2 border-tempo-border">
            <p className="font-accent text-[17px] text-tempo-muted mb-1">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </p>
            <p className="font-body text-base italic leading-relaxed whitespace-pre-wrap" style={{ color: "var(--journal)" }}>
              {coachResponse}
            </p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <input
            type="text"
            value={coachQuestion}
            onChange={(e) => setCoachQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCoachQuestion()}
            placeholder="Ask the coach..."
            className="flex-1 font-body text-base px-0 py-2 bg-transparent text-tempo-text placeholder:text-tempo-muted border-b border-tempo-border focus:border-tempo-accent transition-colors"
          />
          <button
            onClick={handleCoachQuestion}
            disabled={coachLoading || !coachQuestion.trim()}
            className="font-ui text-[13px] font-medium text-tempo-text px-5 py-2 border border-tempo-text hover:bg-tempo-text hover:text-tempo-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ letterSpacing: "0.04em" }}
          >
            Send
          </button>
        </div>
      </section>
    </div>
  );
}
