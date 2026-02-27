"use client";

import { useEffect, useState, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  sort_order: number;
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

interface BehaviorLog {
  date: string;
  done: number;
}

interface Behavior {
  id: number;
  title: string;
  goal_id: number | null;
  frequency: string;
  logs: BehaviorLog[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AREAS = ["Health", "Career", "Finance", "Relationships"] as const;

function getCurrentQuarter(): number {
  const month = new Date().getMonth(); // 0-indexed
  if (month <= 2) return 1;
  if (month <= 5) return 2;
  if (month <= 8) return 3;
  return 4;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getStreak(logs: BehaviorLog[]): number {
  let streak = 0;
  const today = formatDate(new Date());
  const sorted = [...logs]
    .filter((l) => l.date <= today)
    .sort((a, b) => (a.date > b.date ? -1 : 1));

  for (const log of sorted) {
    if (log.done) streak++;
    else break;
  }
  return streak;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const AREA_COLORS: Record<string, string> = {
  Health: "bg-emerald-100 text-emerald-700",
  Career: "bg-blue-100 text-blue-700",
  Finance: "bg-amber-100 text-amber-700",
  Relationships: "bg-purple-100 text-purple-700",
};

const AREA_EMOJI: Record<string, string> = {
  "Saude": "\u{1F4AA}",
  "Saúde": "\u{1F4AA}",
  "Familia": "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}",
  "Família": "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}",
  "Espiritual": "\u{1F64F}",
  "Criativo": "\u{1F3A8}",
};

const VELOCITY_COLORS = {
  critical: { bg: "bg-red-100", bar: "bg-red-500", text: "text-red-700", label: "Critico" },
  behind: { bg: "bg-amber-100", bar: "bg-amber-500", text: "text-amber-700", label: "Atras" },
  on_track: { bg: "bg-emerald-100", bar: "bg-emerald-500", text: "text-emerald-700", label: "No ritmo" },
  ahead: { bg: "bg-blue-100", bar: "bg-blue-500", text: "text-blue-700", label: "Adiantado" },
};

function getTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function progressColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [goalVelocity, setGoalVelocity] = useState<GoalVelocity[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Goal form state
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: "",
    area: "Health",
    unit: "",
    q1_target: 0,
    q2_target: 0,
    q3_target: 0,
    q4_target: 0,
  });

  // Add Behavior form state
  const [showBehaviorForm, setShowBehaviorForm] = useState(false);
  const [behaviorForm, setBehaviorForm] = useState({
    title: "",
    goal_id: "" as string,
    frequency: "daily",
  });

  const currentQuarter = getCurrentQuarter();
  const monday = getMonday(new Date());
  const weekDates = getWeekDates(monday);

  // ------- Fetchers -------

  const fetchGoals = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) setGoals(await res.json());
  }, []);

  const fetchBehaviors = useCallback(async () => {
    const res = await fetch(
      `/api/behaviors?week_start=${formatDate(monday)}`
    );
    if (res.ok) setBehaviors(await res.json());
  }, [monday]);

  const fetchVelocity = useCallback(async () => {
    try {
      const res = await fetch(`/api/scores?date=${getTodayISO()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.goal_velocity) setGoalVelocity(data.goal_velocity);
      }
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => {
    Promise.all([fetchGoals(), fetchBehaviors(), fetchVelocity()]).finally(() =>
      setLoading(false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- Goal Actions -------

  async function createGoal() {
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(goalForm),
    });
    if (res.ok) {
      await fetchGoals();
      setShowGoalForm(false);
      setGoalForm({
        title: "",
        area: "Health",
        unit: "",
        q1_target: 0,
        q2_target: 0,
        q3_target: 0,
        q4_target: 0,
      });
    }
  }

  async function deleteGoal(id: number) {
    const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
    if (res.ok) setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  async function adjustActual(goal: Goal, delta: number) {
    const qKey = `q${currentQuarter}_actual` as keyof Goal;
    const newVal = Math.max(0, (goal[qKey] as number) + delta);
    const res = await fetch(`/api/goals/${goal.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [qKey]: newVal }),
    });
    if (res.ok) {
      const updated = await res.json();
      setGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    }
  }

  // ------- Behavior Actions -------

  async function createBehavior() {
    const payload: Record<string, unknown> = {
      title: behaviorForm.title,
      frequency: behaviorForm.frequency,
    };
    if (behaviorForm.goal_id) payload.goal_id = Number(behaviorForm.goal_id);

    const res = await fetch("/api/behaviors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      await fetchBehaviors();
      setShowBehaviorForm(false);
      setBehaviorForm({ title: "", goal_id: "", frequency: "daily" });
    }
  }

  async function toggleLog(behaviorId: number, date: string) {
    const res = await fetch("/api/behaviors/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ behavior_id: behaviorId, date }),
    });
    if (res.ok) {
      const { behavior_id, date: d, done } = await res.json();
      setBehaviors((prev) =>
        prev.map((b) =>
          b.id === behavior_id
            ? {
                ...b,
                logs: b.logs.map((l) =>
                  l.date === d ? { ...l, done } : l
                ),
              }
            : b
        )
      );
    }
  }

  async function deleteBehavior(id: number) {
    const res = await fetch(`/api/behaviors/${id}`, { method: "DELETE" });
    if (res.ok) setBehaviors((prev) => prev.filter((b) => b.id !== id));
  }

  // ------- Render Helpers -------

  function renderQuarterBar(goal: Goal, q: number) {
    const target = goal[`q${q}_target` as keyof Goal] as number;
    const actual = goal[`q${q}_actual` as keyof Goal] as number;
    const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
    const isCurrentQ = q === currentQuarter;

    return (
      <div key={q} className="space-y-1">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className={isCurrentQ ? "font-semibold text-zinc-800" : ""}>
            Q{q}
          </span>
          <div className="flex items-center gap-1">
            {isCurrentQ && (
              <button
                onClick={() => adjustActual(goal, -1)}
                className="w-5 h-5 flex items-center justify-center rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs leading-none"
              >
                -
              </button>
            )}
            <span className={isCurrentQ ? "font-medium text-zinc-800" : ""}>
              {actual}/{target}
            </span>
            {isCurrentQ && (
              <button
                onClick={() => adjustActual(goal, 1)}
                className="w-5 h-5 flex items-center justify-center rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs leading-none"
              >
                +
              </button>
            )}
          </div>
        </div>
        <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${progressColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // ------- Main Render -------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      {/* ======== GOALS SECTION ======== */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Goals 2026</h1>
          <button
            onClick={() => setShowGoalForm(!showGoalForm)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
          >
            {showGoalForm ? "Cancel" : "Add Goal"}
          </button>
        </div>

        {/* Goal Velocity Cards */}
        {goalVelocity.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {goalVelocity.map((gv) => {
              const emoji = AREA_EMOJI[gv.area] ?? "\u{1F3AF}";
              const vc = VELOCITY_COLORS[gv.status];
              const barWidth = Math.min(gv.velocity * 100, 150);

              return (
                <div
                  key={gv.goal_id}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2.5 flex items-center gap-3"
                >
                  <span className="text-base flex-shrink-0">{emoji}</span>
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

        {/* Add Goal Form */}
        {showGoalForm && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Goal title"
                value={goalForm.title}
                onChange={(e) =>
                  setGoalForm({ ...goalForm, title: e.target.value })
                }
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              />
              <select
                value={goalForm.area}
                onChange={(e) =>
                  setGoalForm({ ...goalForm, area: e.target.value })
                }
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Unit (e.g. books, km, R$)"
                value={goalForm.unit}
                onChange={(e) =>
                  setGoalForm({ ...goalForm, unit: e.target.value })
                }
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([1, 2, 3, 4] as const).map((q) => (
                <div key={q}>
                  <label className="block text-xs text-zinc-500 mb-1">
                    Q{q} Target
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={goalForm[`q${q}_target` as keyof typeof goalForm]}
                    onChange={(e) =>
                      setGoalForm({
                        ...goalForm,
                        [`q${q}_target`]: Number(e.target.value),
                      })
                    }
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowGoalForm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createGoal}
                disabled={!goalForm.title.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Save Goal
              </button>
            </div>
          </div>
        )}

        {/* Goals Grid */}
        {goals.length === 0 ? (
          <p className="text-zinc-400 text-sm">No goals yet. Add your first goal above.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="relative rounded-xl border border-zinc-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Delete button */}
                <button
                  onClick={() => deleteGoal(goal.id)}
                  className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-full text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete goal"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {/* Title + badges */}
                <div className="flex items-center gap-2 mb-4 pr-6">
                  <h3 className="font-semibold text-zinc-900">{goal.title}</h3>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      AREA_COLORS[goal.area] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {goal.area}
                  </span>
                  {goal.unit && (
                    <span className="text-[11px] text-zinc-400">
                      {goal.unit}
                    </span>
                  )}
                </div>

                {/* Quarter bars */}
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((q) => renderQuarterBar(goal, q))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ======== BEHAVIORS SECTION ======== */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold tracking-tight">Weekly Behaviors</h2>
          <button
            onClick={() => setShowBehaviorForm(!showBehaviorForm)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors"
          >
            {showBehaviorForm ? "Cancel" : "Add Behavior"}
          </button>
        </div>

        {/* Add Behavior Form */}
        {showBehaviorForm && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 space-y-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Behavior title"
                value={behaviorForm.title}
                onChange={(e) =>
                  setBehaviorForm({ ...behaviorForm, title: e.target.value })
                }
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              />
              <select
                value={behaviorForm.goal_id}
                onChange={(e) =>
                  setBehaviorForm({ ...behaviorForm, goal_id: e.target.value })
                }
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              >
                <option value="">No linked goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <select
                value={behaviorForm.frequency}
                onChange={(e) =>
                  setBehaviorForm({ ...behaviorForm, frequency: e.target.value })
                }
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              >
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowBehaviorForm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createBehavior}
                disabled={!behaviorForm.title.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Save Behavior
              </button>
            </div>
          </div>
        )}

        {/* Behaviors Table */}
        {behaviors.length === 0 ? (
          <p className="text-zinc-400 text-sm">No behaviors yet. Add your first behavior above.</p>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left font-medium text-zinc-500 px-5 py-3">
                    Behavior
                  </th>
                  {weekDates.map((d, i) => (
                    <th
                      key={i}
                      className="text-center font-medium text-zinc-500 px-2 py-3 w-14"
                    >
                      <div>{DAY_LABELS[i]}</div>
                      <div className="text-[10px] text-zinc-400 font-normal">
                        {d.getDate()}/{d.getMonth() + 1}
                      </div>
                    </th>
                  ))}
                  <th className="text-center font-medium text-zinc-500 px-3 py-3 w-16">
                    Streak
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {behaviors.map((b) => (
                  <tr
                    key={b.id}
                    className="border-b border-zinc-50 last:border-none hover:bg-zinc-50/50"
                  >
                    <td className="px-5 py-3 font-medium text-zinc-800">
                      {b.title}
                    </td>
                    {b.logs.map((log, i) => (
                      <td key={i} className="text-center px-2 py-3">
                        <button
                          onClick={() => toggleLog(b.id, log.date)}
                          className={`w-7 h-7 rounded-md border transition-colors ${
                            log.done
                              ? "bg-emerald-500 border-emerald-500 text-white"
                              : "border-zinc-200 hover:border-zinc-300 text-transparent hover:bg-zinc-50"
                          }`}
                        >
                          {log.done ? (
                            <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          ) : null}
                        </button>
                      </td>
                    ))}
                    <td className="text-center px-3 py-3">
                      <span className="inline-flex items-center justify-center min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600">
                        {getStreak(b.logs)}
                      </span>
                    </td>
                    <td className="px-2 py-3">
                      <button
                        onClick={() => deleteBehavior(b.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-full text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Delete behavior"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
