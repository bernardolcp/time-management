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

function formatDateHeading(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

const energyEmojis: Record<number, string> = {
  1: "\u{1F634}", // sleepy
  2: "\u{1F614}", // pensive
  3: "\u{1F610}", // neutral
  4: "\u{1F60A}", // happy
  5: "\u{26A1}",  // high energy
};

const AREA_CONFIG: Record<string, { emoji: string; color: string; bgColor: string; barColor: string }> = {
  "Saude": { emoji: "\u{1F4AA}", color: "text-emerald-700", bgColor: "bg-emerald-50", barColor: "bg-emerald-500" },
  "Saúde": { emoji: "\u{1F4AA}", color: "text-emerald-700", bgColor: "bg-emerald-50", barColor: "bg-emerald-500" },
  "Familia": { emoji: "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}", color: "text-rose-700", bgColor: "bg-rose-50", barColor: "bg-rose-500" },
  "Família": { emoji: "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}", color: "text-rose-700", bgColor: "bg-rose-50", barColor: "bg-rose-500" },
  "Espiritual": { emoji: "\u{1F64F}", color: "text-violet-700", bgColor: "bg-violet-50", barColor: "bg-violet-500" },
  "Criativo": { emoji: "\u{1F3A8}", color: "text-amber-700", bgColor: "bg-amber-50", barColor: "bg-amber-500" },
};

function getAreaConfig(area: string) {
  return AREA_CONFIG[area] ?? { emoji: "\u{1F3AF}", color: "text-zinc-700", bgColor: "bg-zinc-50", barColor: "bg-zinc-500" };
}

// --- Component ---

export default function Dashboard() {
  const [overcommitment, setOvercommitment] = useState<OvercommitmentData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dailyEntry, setDailyEntry] = useState<DailyEntry | null>(null);
  const [scores, setScores] = useState<ScoresData | null>(null);
  const [scoresLoading, setScoresLoading] = useState(true);
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
      // scores are non-critical, silently fail
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

  // --- Grouped tasks: frog first, then deep, then shallow ---

  const frogTasks = tasks.filter((t) => t.is_frog);
  const deepTasks = tasks.filter((t) => !t.is_frog && t.type === "deep");
  const shallowTasks = tasks.filter((t) => !t.is_frog && t.type === "shallow");
  const groupedTasks = [...frogTasks, ...deepTasks, ...shallowTasks];

  // --- Quick stats ---

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;

  const goalTaskCounts: Record<number, number> = {};
  for (const t of tasks) {
    if (t.goal_id) {
      goalTaskCounts[t.goal_id] = (goalTaskCounts[t.goal_id] || 0) + 1;
    }
  }

  const topGoalIds = Object.entries(goalTaskCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id]) => Number(id));

  const topGoalNames = topGoalIds
    .map((id) => goals.find((g) => g.id === id))
    .filter(Boolean)
    .map((g) => g!.area || g!.title);

  // --- Alert banner config ---

  const alertConfig = {
    green: {
      bg: "bg-emerald-50",
      border: "border-emerald-500",
      text: "text-emerald-800",
      icon: "text-emerald-600",
      message: (r: number) =>
        `You have ${formatMinutes(r)} of buffer. Productive day ahead!`,
    },
    yellow: {
      bg: "bg-amber-50",
      border: "border-amber-500",
      text: "text-amber-800",
      icon: "text-amber-600",
      message: (r: number) =>
        `Only ${formatMinutes(r)} buffer. Consider moving shallow tasks.`,
    },
    red: {
      bg: "bg-red-50",
      border: "border-red-500",
      text: "text-red-800",
      icon: "text-red-600",
      message: (r: number) =>
        `Overcommitted by ${formatMinutes(Math.abs(r))}! Move or cut tasks.`,
    },
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-zinc-400 text-sm">Loading dashboard...</div>
      </div>
    );
  }

  const alert = overcommitment ? alertConfig[overcommitment.status] : null;

  // Habit badges for daily entry summary
  const habits = dailyEntry
    ? [
        { label: "\u{1F4AA}", active: !!dailyEntry.training },
        { label: "\u{1F64F}", active: !!dailyEntry.spiritual },
        { label: "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}", active: !!dailyEntry.family_day },
        { label: "\u{1F3A8}", active: !!dailyEntry.content_creation },
      ]
    : [];

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">{formatDateHeading()}</p>
      </div>

      {/* Today's Entry Summary */}
      {dailyEntry ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 flex items-center gap-4">
          <span className="text-2xl" title={`Energy: ${dailyEntry.energy_level}/5`}>
            {energyEmojis[dailyEntry.energy_level] ?? "\u{1F610}"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {dailyEntry.focus_word && (
                <span className="text-sm font-semibold text-zinc-900">
                  {dailyEntry.focus_word}
                </span>
              )}
              <span className="text-xs text-zinc-400">today&apos;s focus</span>
            </div>
            <div className="flex gap-2 mt-1.5">
              {habits.map((h, i) => (
                <span
                  key={i}
                  className={`text-lg ${h.active ? "" : "grayscale opacity-30"}`}
                  title={h.active ? "Done" : "Not done"}
                >
                  {h.label}
                </span>
              ))}
            </div>
          </div>
          <Link
            href="/entry"
            className="text-xs text-zinc-500 hover:text-zinc-700 underline underline-offset-2"
          >
            Edit
          </Link>
        </div>
      ) : (
        <Link
          href="/entry"
          className="block rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50 p-5 text-center hover:bg-emerald-100 transition-colors"
        >
          <span className="text-2xl block mb-1">{"\u{2600}\u{FE0F}"}</span>
          <span className="text-sm font-semibold text-emerald-800">Programar o dia</span>
          <p className="text-xs text-emerald-600 mt-1">Set your energy, focus word, and habits</p>
        </Link>
      )}

      {/* Overcommitment Alert */}
      {overcommitment && alert && (
        <div className={`rounded-lg border-l-4 ${alert.bg} ${alert.border} p-5`}>
          <p className={`font-semibold ${alert.text}`}>
            {alert.message(overcommitment.remaining_minutes)}
          </p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-zinc-500">Available</span>
              <p className={`font-medium ${alert.text}`}>
                {formatMinutes(overcommitment.available_minutes)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500">Committed</span>
              <p className={`font-medium ${alert.text}`}>
                {formatMinutes(overcommitment.committed_minutes)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500">Remaining</span>
              <p className={`font-medium ${alert.text}`}>
                {formatMinutes(overcommitment.remaining_minutes)}
              </p>
            </div>
            <div>
              <span className="text-zinc-500">Deep blocks</span>
              <p className={`font-medium ${alert.text}`}>
                {overcommitment.deep_blocks}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Goal Progress Cards */}
      {goals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-3">Goal Progress (Q1)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {goals.slice(0, 4).map((goal) => {
              const config = getAreaConfig(goal.area);
              const target = goal.q1_target || 0;
              const actual = goal.q1_actual || 0;
              const pct = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;

              return (
                <div
                  key={goal.id}
                  className={`rounded-lg border border-zinc-200 bg-white p-4 ${config.bgColor} bg-opacity-30`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{config.emoji}</span>
                    <h3 className={`text-sm font-semibold ${config.color}`}>{goal.title}</h3>
                  </div>
                  <div className="w-full bg-zinc-200 rounded-full h-2 mb-2">
                    <div
                      className={`${config.barColor} h-2 rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold ${config.color}`}>{pct}%</span>
                    <span className="text-zinc-500">
                      {actual}/{target} {goal.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Performance Dashboard */}
      {scoresLoading ? (
        <div className="space-y-4">
          <div className="h-5 w-32 bg-zinc-200 rounded animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div className="sm:col-span-1 h-36 bg-zinc-100 rounded-lg animate-pulse" />
            <div className="sm:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[68px] bg-zinc-100 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-zinc-100 rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="flex gap-3 overflow-hidden">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 w-20 bg-zinc-100 rounded-lg animate-pulse flex-shrink-0" />
            ))}
          </div>
        </div>
      ) : scores ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">Performance</h2>

          {/* Score Ring + Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            {/* Daily Score Ring */}
            <div className="sm:col-span-1 flex flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white p-4">
              <div className="relative w-24 h-24">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke="#e4e4e7"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke={
                      scores.daily_score <= 40
                        ? "#ef4444"
                        : scores.daily_score <= 70
                        ? "#f59e0b"
                        : "#10b981"
                    }
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(scores.daily_score / 100) * 263.9} 263.9`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span
                    className={`text-2xl font-bold font-mono ${
                      scores.daily_score <= 40
                        ? "text-red-600"
                        : scores.daily_score <= 70
                        ? "text-amber-600"
                        : "text-emerald-600"
                    }`}
                  >
                    {scores.daily_score}
                  </span>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400 mt-1 font-medium">
                Daily Score
              </span>
            </div>

            {/* Stats Row (4 cards) */}
            <div className="sm:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Streak */}
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 23c-3.866 0-7-3.134-7-7 0-3.866 3.134-9 7-14 3.866 5 7 10.134 7 14 0 3.866-3.134 7-7 7z" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Streak</span>
                </div>
                <p className="text-xl font-bold font-mono text-zinc-900">
                  {scores.streak}
                  <span className="text-xs font-normal text-zinc-400 ml-1">dias</span>
                </p>
              </div>

              {/* Week Avg */}
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h4l3-8 4 16 3-8h4" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Semana</span>
                </div>
                <p className="text-xl font-bold font-mono text-zinc-900 flex items-center gap-1">
                  {scores.weekly_avg}
                  {scores.weekly_trend === "up" && (
                    <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  )}
                  {scores.weekly_trend === "down" && (
                    <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                  {scores.weekly_trend === "flat" && (
                    <svg className="w-4 h-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                    </svg>
                  )}
                </p>
              </div>

              {/* Deep Work */}
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M12 6v6l4 2" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Deep Work</span>
                </div>
                <p className="text-xl font-bold font-mono text-zinc-900">
                  {scores.today_deep_work_hours}
                  <span className="text-xs font-normal text-zinc-400 ml-1">h</span>
                </p>
              </div>

              {/* Completion */}
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-medium">Tasks</span>
                </div>
                <p className="text-xl font-bold font-mono text-zinc-900">
                  {scores.tasks_completed_today}
                  <span className="text-sm font-normal text-zinc-400">/{scores.tasks_total_today}</span>
                </p>
              </div>
            </div>
          </div>

          {/* Goal Velocity Bars */}
          {scores.goal_velocity.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {scores.goal_velocity.map((gv) => {
                const config = getAreaConfig(gv.area);
                const velocityColors = {
                  critical: { bg: "bg-red-100", bar: "bg-red-500", text: "text-red-700", label: "Critico" },
                  behind: { bg: "bg-amber-100", bar: "bg-amber-500", text: "text-amber-700", label: "Atras" },
                  on_track: { bg: "bg-emerald-100", bar: "bg-emerald-500", text: "text-emerald-700", label: "No ritmo" },
                  ahead: { bg: "bg-blue-100", bar: "bg-blue-500", text: "text-blue-700", label: "Adiantado" },
                };
                const vc = velocityColors[gv.status];
                const barWidth = Math.min(gv.velocity * 100, 150);

                return (
                  <div
                    key={gv.goal_id}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 flex items-center gap-3"
                  >
                    <span className="text-base flex-shrink-0">{config.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-zinc-700 truncate">{gv.area}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${vc.bg} ${vc.text}`}>
                          {vc.label}
                        </span>
                      </div>
                      <div className="w-full bg-zinc-100 rounded-full h-1.5">
                        <div
                          className={`${vc.bar} h-1.5 rounded-full transition-all duration-500`}
                          style={{ width: `${Math.min(barWidth, 100)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {gv.actual}/{gv.target}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {gv.velocity}x
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Achievements Row */}
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
            {scores.achievements.map((ach) => {
              const achievementIcons: Record<string, string> = {
                first_frog: "M12 2C8.13 2 5 5.13 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.87-3.13-7-7-7z",
                streak_3: "M12 23c-3.866 0-7-3.134-7-7 0-3.866 3.134-9 7-14 3.866 5 7 10.134 7 14 0 3.866-3.134 7-7 7z",
                streak_7: "M12 23c-3.866 0-7-3.134-7-7 0-3.866 3.134-9 7-14 3.866 5 7 10.134 7 14 0 3.866-3.134 7-7 7z",
                streak_14: "M12 23c-3.866 0-7-3.134-7-7 0-3.866 3.134-9 7-14 3.866 5 7 10.134 7 14 0 3.866-3.134 7-7 7z",
                streak_30: "M12 23c-3.866 0-7-3.134-7-7 0-3.866 3.134-9 7-14 3.866 5 7 10.134 7 14 0 3.866-3.134 7-7 7z",
                deep_focus: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z",
                perfect_day: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
                consistent_week: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z",
                goal_crusher: "M5 13l4 4L19 7",
                centurion: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
              };

              return (
                <div
                  key={ach.id}
                  className={`flex flex-col items-center flex-shrink-0 w-[72px] rounded-lg border px-2 py-2 transition-all ${
                    ach.unlocked
                      ? "border-zinc-200 bg-white"
                      : "border-zinc-100 bg-zinc-50 opacity-40"
                  }`}
                >
                  <div className="relative">
                    <svg
                      className={`w-5 h-5 ${ach.unlocked ? "text-emerald-500" : "text-zinc-300"}`}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d={achievementIcons[ach.id] || achievementIcons.centurion} />
                    </svg>
                    {ach.unlocked ? (
                      <svg className="w-2.5 h-2.5 text-emerald-600 absolute -top-1 -right-1.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    ) : (
                      <svg className="w-2.5 h-2.5 text-zinc-400 absolute -top-1 -right-1.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[9px] text-zinc-500 mt-1 text-center leading-tight truncate w-full">
                    {ach.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Today's Tasks */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 mb-3">Today&apos;s Tasks</h2>
        {groupedTasks.length === 0 ? (
          <p className="text-sm text-zinc-400 py-4">No tasks for today.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
            {groupedTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors"
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleTask(task)}
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    task.completed
                      ? "bg-zinc-900 border-zinc-900 text-white"
                      : "border-zinc-300 hover:border-zinc-400"
                  }`}
                  aria-label={`Mark "${task.title}" as ${task.completed ? "incomplete" : "complete"}`}
                >
                  {task.completed ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : null}
                </button>

                {/* Frog indicator */}
                {task.is_frog ? (
                  <span className="text-base" title="Eat the frog!">
                    {"\u{1F438}"}
                  </span>
                ) : null}

                {/* Title */}
                <span
                  className={`flex-1 text-sm ${
                    task.completed
                      ? "line-through text-zinc-400"
                      : "text-zinc-900"
                  }`}
                >
                  {task.title}
                </span>

                {/* Estimate */}
                <span className="text-xs text-zinc-400 tabular-nums">
                  {formatMinutes(task.estimated_minutes)}
                </span>

                {/* Type badge */}
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    task.type === "deep"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {task.type}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Deep Work Blocks */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Deep Work Blocks
          </p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {overcommitment?.deep_blocks ?? 0}
          </p>
          <p className="text-xs text-zinc-400 mt-1">available today</p>
        </div>

        {/* Tasks Completed */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Tasks Completed
          </p>
          <p className="text-2xl font-bold text-zinc-900 mt-1">
            {completedCount}
            <span className="text-sm font-normal text-zinc-400"> / {totalCount}</span>
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {totalCount > 0
              ? `${Math.round((completedCount / totalCount) * 100)}% done`
              : "no tasks"}
          </p>
        </div>

        {/* Top Goal Areas */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Top Goal Areas
          </p>
          {topGoalNames.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {topGoalNames.map((name, i) => (
                <li key={i} className="text-sm text-zinc-700 truncate">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400 mt-2">No goal-linked tasks</p>
          )}
        </div>
      </div>

      {/* Coach Quick-Check */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">{"\u{1F9D1}\u{200D}\u{1F3EB}"}</span>
          <h2 className="text-lg font-semibold text-zinc-900">Coach</h2>
        </div>

        <button
          onClick={handleCoachCheck}
          disabled={coachLoading}
          className="w-full rounded-lg bg-zinc-900 text-white py-2.5 px-4 text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {coachLoading ? "Thinking..." : "Como esta indo o dia?"}
        </button>

        {coachResponse && (
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-700 whitespace-pre-wrap">
            {coachResponse}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={coachQuestion}
            onChange={(e) => setCoachQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCoachQuestion()}
            placeholder="Ask the coach something..."
            className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
          />
          <button
            onClick={handleCoachQuestion}
            disabled={coachLoading || !coachQuestion.trim()}
            className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
