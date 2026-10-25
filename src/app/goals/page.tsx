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

const AREAS = ["Saúde", "Família", "Espiritual", "Criativo", "Carreira", "Finanças"] as const;

function getCurrentQuarter(): number {
  const month = new Date().getMonth();
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
  return d.toISOString().split("T")[0];
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

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Goal form state
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: "",
    area: "Saúde",
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

  useEffect(() => {
    Promise.all([fetchGoals(), fetchBehaviors()]).finally(() =>
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
      setGoalForm({ title: "", area: "Saúde", unit: "", q1_target: 0, q2_target: 0, q3_target: 0, q4_target: 0 });
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
            ? { ...b, logs: b.logs.map((l) => (l.date === d ? { ...l, done } : l)) }
            : b
        )
      );
    }
  }

  async function deleteBehavior(id: number) {
    const res = await fetch(`/api/behaviors/${id}`, { method: "DELETE" });
    if (res.ok) setBehaviors((prev) => prev.filter((b) => b.id !== id));
  }

  // ------- Render -------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full font-body text-tempo-muted">
        Loading...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "720px" }}>
      {/* ======== GOALS SECTION ======== */}
      <section className="mb-12">
        <div className="flex items-end justify-between mb-8 pb-4 border-b border-tempo-border">
          <h1 className="font-display text-tempo-text" style={{ fontSize: "36px", lineHeight: "1.1" }}>
            Goals 2026
          </h1>
          <button
            onClick={() => setShowGoalForm(!showGoalForm)}
            className="font-ui text-[13px] font-medium text-tempo-muted hover:text-tempo-text transition-colors"
            style={{ letterSpacing: "0.04em" }}
          >
            {showGoalForm ? "Cancel" : "Add goal"}
          </button>
        </div>

        {/* Add Goal Form */}
        {showGoalForm && (
          <div className="mb-8 border border-tempo-border p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Goal title"
                value={goalForm.title}
                onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                className="font-body text-sm border-b border-tempo-border bg-transparent px-0 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent focus:outline-none transition-colors"
              />
              <select
                value={goalForm.area}
                onChange={(e) => setGoalForm({ ...goalForm, area: e.target.value })}
                className="font-ui text-sm border border-tempo-border bg-transparent px-2 py-2 text-tempo-text focus:border-tempo-accent focus:outline-none transition-colors"
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Unit (e.g. treinos, momentos)"
                value={goalForm.unit}
                onChange={(e) => setGoalForm({ ...goalForm, unit: e.target.value })}
                className="font-body text-sm border-b border-tempo-border bg-transparent px-0 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent focus:outline-none transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {([1, 2, 3, 4] as const).map((q) => (
                <div key={q}>
                  <label className="font-ui text-[11px] text-tempo-muted uppercase mb-1 block" style={{ letterSpacing: "0.08em" }}>
                    Q{q} Target
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={goalForm[`q${q}_target` as keyof typeof goalForm]}
                    onChange={(e) => setGoalForm({ ...goalForm, [`q${q}_target`]: Number(e.target.value) })}
                    className="w-full font-ui text-sm border border-tempo-border bg-transparent px-2 py-1.5 text-tempo-text focus:border-tempo-accent focus:outline-none transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowGoalForm(false)}
                className="font-ui text-[13px] text-tempo-muted hover:text-tempo-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createGoal}
                disabled={!goalForm.title.trim()}
                className="font-ui text-[13px] font-medium bg-tempo-text text-white px-4 py-2 hover:opacity-90 disabled:opacity-30 transition-opacity"
                style={{ letterSpacing: "0.04em" }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Goals Grid — dot-matrix cards */}
        {goals.length === 0 ? (
          <p className="font-body text-tempo-muted text-sm">No goals yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {goals.map((goal) => {
              const target = goal[`q${currentQuarter}_target` as keyof Goal] as number;
              const actual = goal[`q${currentQuarter}_actual` as keyof Goal] as number;
              const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
              const dotSize = target > 50 ? 6 : target > 25 ? 8 : target > 10 ? 10 : 12;
              const dotGap = target > 50 ? 2 : target > 25 ? 3 : target > 10 ? 4 : 5;
              const dotsToShow = Math.min(target, 100);

              return (
                <div key={goal.id} className="border border-tempo-border p-5 group relative">
                  {/* Delete */}
                  <button
                    onClick={() => deleteGoal(goal.id)}
                    className="absolute top-4 right-4 text-tempo-border hover:text-tempo-accent transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete goal"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>

                  {/* Area tag */}
                  <span
                    className="font-ui bg-tempo-surface text-tempo-muted px-2 py-0.5 inline-block"
                    style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}
                  >
                    {goal.area}
                  </span>

                  {/* Title */}
                  <h3 className="font-body text-tempo-text mt-2" style={{ fontSize: "16px", fontWeight: 600 }}>
                    {goal.title}
                  </h3>

                  {/* Percentage + Quarter label */}
                  <div className="flex items-end justify-between mt-4 mb-3">
                    <span className="font-display text-tempo-text" style={{ fontSize: "36px", lineHeight: "1" }}>
                      {pct}<span className="text-tempo-muted" style={{ fontSize: "16px" }}>%</span>
                    </span>
                    <span
                      className="font-ui text-tempo-muted"
                      style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em" }}
                    >
                      Q{currentQuarter}
                    </span>
                  </div>

                  {/* Dot grid */}
                  {target > 0 ? (
                    <div className="flex flex-wrap mb-4" style={{ gap: `${dotGap}px` }}>
                      {Array.from({ length: dotsToShow }, (_, i) => (
                        <div
                          key={i}
                          className="rounded-full transition-colors"
                          style={{
                            width: `${dotSize}px`,
                            height: `${dotSize}px`,
                            backgroundColor: i < actual ? "var(--olive)" : "var(--border)",
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="font-ui text-[11px] text-tempo-muted mb-4 italic">No target set</p>
                  )}

                  {/* Counter + Controls */}
                  <div className="flex items-center justify-between">
                    <span className="font-ui text-[12px] text-tempo-muted">
                      {actual} of {target}{goal.unit ? ` ${goal.unit}` : ""}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => adjustActual(goal, -1)}
                        className="font-ui text-[12px] text-tempo-muted hover:text-tempo-text w-6 h-6 flex items-center justify-center bg-tempo-surface transition-colors"
                      >
                        −
                      </button>
                      <button
                        onClick={() => adjustActual(goal, 1)}
                        className="font-ui text-[12px] text-tempo-muted hover:text-tempo-text w-6 h-6 flex items-center justify-center bg-tempo-surface transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Quarter mini-summary */}
                  <div className="flex gap-4 mt-3 pt-3 border-t border-tempo-border">
                    {[1, 2, 3, 4].map((q) => {
                      const qTarget = goal[`q${q}_target` as keyof Goal] as number;
                      const qActual = goal[`q${q}_actual` as keyof Goal] as number;
                      const qPct = qTarget > 0 ? Math.min(100, Math.round((qActual / qTarget) * 100)) : 0;
                      const isCurrentQ = q === currentQuarter;
                      return (
                        <span
                          key={q}
                          className={`font-ui ${isCurrentQ ? "font-medium text-tempo-text" : "text-tempo-muted"}`}
                          style={{ fontSize: "10px", letterSpacing: "0.04em" }}
                        >
                          Q{q} {qTarget > 0 ? `${qPct}%` : "—"}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ======== BEHAVIORS SECTION ======== */}
      <section>
        <div className="flex items-end justify-between mb-6 pb-4 border-b border-tempo-border">
          <h2 className="font-display text-tempo-text" style={{ fontSize: "24px" }}>
            Weekly Behaviors
          </h2>
          <button
            onClick={() => setShowBehaviorForm(!showBehaviorForm)}
            className="font-ui text-[13px] font-medium text-tempo-muted hover:text-tempo-text transition-colors"
            style={{ letterSpacing: "0.04em" }}
          >
            {showBehaviorForm ? "Cancel" : "Add behavior"}
          </button>
        </div>

        {/* Add Behavior Form */}
        {showBehaviorForm && (
          <div className="mb-6 border border-tempo-border p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <input
                type="text"
                placeholder="Behavior title"
                value={behaviorForm.title}
                onChange={(e) => setBehaviorForm({ ...behaviorForm, title: e.target.value })}
                className="font-body text-sm border-b border-tempo-border bg-transparent px-0 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent focus:outline-none transition-colors"
              />
              <select
                value={behaviorForm.goal_id}
                onChange={(e) => setBehaviorForm({ ...behaviorForm, goal_id: e.target.value })}
                className="font-ui text-sm border border-tempo-border bg-transparent px-2 py-2 text-tempo-text focus:border-tempo-accent focus:outline-none transition-colors"
              >
                <option value="">No linked goal</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
              <select
                value={behaviorForm.frequency}
                onChange={(e) => setBehaviorForm({ ...behaviorForm, frequency: e.target.value })}
                className="font-ui text-sm border border-tempo-border bg-transparent px-2 py-2 text-tempo-text focus:border-tempo-accent focus:outline-none transition-colors"
              >
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowBehaviorForm(false)} className="font-ui text-[13px] text-tempo-muted hover:text-tempo-text transition-colors">
                Cancel
              </button>
              <button
                onClick={createBehavior}
                disabled={!behaviorForm.title.trim()}
                className="font-ui text-[13px] font-medium bg-tempo-text text-white px-4 py-2 hover:opacity-90 disabled:opacity-30 transition-opacity"
                style={{ letterSpacing: "0.04em" }}
              >
                Save
              </button>
            </div>
          </div>
        )}

        {/* Behaviors List — dot matrix style */}
        {behaviors.length === 0 ? (
          <p className="font-body text-tempo-muted text-sm">No behaviors yet.</p>
        ) : (
          <div className="space-y-0">
            {behaviors.map((b) => {
              const streak = getStreak(b.logs);
              const todayStr = formatDate(new Date());

              return (
                <div key={b.id} className="py-5 border-b border-tempo-border group">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-body text-tempo-text" style={{ fontSize: "16px" }}>{b.title}</span>
                      {streak > 0 && (
                        <span className="font-ui text-[11px] text-tempo-muted ml-3">{streak} day streak</span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteBehavior(b.id)}
                      className="text-tempo-border hover:text-tempo-accent transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {/* 7-day dot matrix */}
                  <div className="flex items-center gap-3">
                    {b.logs.map((log, i) => {
                      const isToday = log.date === todayStr;
                      const isFuture = log.date > todayStr;

                      return (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <span className="font-ui text-[9px] text-tempo-muted" style={{ letterSpacing: "0.04em" }}>
                            {DAY_LABELS[i]}
                          </span>
                          <button
                            onClick={() => toggleLog(b.id, log.date)}
                            className="transition-colors"
                            style={{
                              width: "18px",
                              height: "18px",
                              borderRadius: "50%",
                              backgroundColor: log.done
                                ? "var(--olive)"
                                : isToday
                                ? "var(--accent)"
                                : "transparent",
                              border: isFuture
                                ? "none"
                                : log.done
                                ? "1.5px solid var(--olive)"
                                : isToday
                                ? "1.5px solid var(--accent)"
                                : "1.5px solid var(--border)",
                              opacity: isFuture ? 0.2 : 1,
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
