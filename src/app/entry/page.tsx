"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

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
}

interface OvercommitmentData {
  status: "green" | "yellow" | "red";
  available_minutes: number;
  committed_minutes: number;
  remaining_minutes: number;
  deep_blocks: number;
}

interface Project {
  id: number;
  name: string;
  active: number;
  sort_order: number;
}

interface PendingTask {
  id: string;
  title: string;
  type: "deep" | "shallow";
  estimated_minutes: number;
  goal_id: number | null;
  project_id: number | null;
  is_frog: number;
  urgent: number;
  important: number;
  source: "habit" | "manual";
}

interface BehaviorToday {
  id: number;
  title: string;
  goal_id: number | null;
  frequency: string;
  today_done: boolean;
  streak: number;
}

interface WizardState {
  energy: number;
  focusWord: string;
  habitToggles: Record<number, boolean>;
  frogTitle: string;
  frogProjectId: number | null;
  frogMinutes: number;
  deepTasks: { title: string; minutes: number; projectId: number | null }[];
  shallowTasks: { title: string; minutes: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatMinutes(n: number): string {
  const abs = Math.abs(n);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = n < 0 ? "-" : "";
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

function getCurrentQuarter(): number {
  const month = new Date().getMonth();
  if (month <= 2) return 1;
  if (month <= 5) return 2;
  if (month <= 8) return 3;
  return 4;
}

let localIdCounter = 0;
function nextLocalId(): string {
  return `local-${++localIdCounter}`;
}

// ---------------------------------------------------------------------------
// Energy config
// ---------------------------------------------------------------------------

const ENERGY_OPTIONS = [
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

// ---------------------------------------------------------------------------
// Step labels
// ---------------------------------------------------------------------------

const STEP_LABELS = ["Energy", "Habits", "Deep Work", "Shallow", "Review"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DailyEntryPage() {
  const router = useRouter();
  const today = getTodayISO();

  const [step, setStep] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`daily-entry-step-${today}`);
      if (saved) return parseInt(saved, 10) || 1;
    }
    return 1;
  });
  const [goals, setGoals] = useState<Goal[]>([]);
  const [behaviors, setBehaviors] = useState<BehaviorToday[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [overcommitment, setOvercommitment] = useState<OvercommitmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachResponse, setCoachResponse] = useState<string | null>(null);

  const STORAGE_KEY = `daily-entry-${today}`;

  const [wizard, setWizard] = useState<WizardState>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Ensure habitToggles exists (migration from old format)
          if (!parsed.habitToggles) parsed.habitToggles = {};
          return parsed;
        } catch {
          // ignore
        }
      }
    }
    return {
      energy: 0,
      focusWord: "",
      habitToggles: {},
      frogTitle: "",
      frogProjectId: null,
      frogMinutes: 90,
      deepTasks: [],
      shallowTasks: [],
    };
  });

  // Persist wizard state and step to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(wizard));
  }, [wizard, STORAGE_KEY]);

  useEffect(() => {
    localStorage.setItem(`daily-entry-step-${today}`, String(step));
  }, [step, today]);

  // Quick-add inputs
  const [deepInput, setDeepInput] = useState("");
  const [deepMinutes, setDeepMinutes] = useState(60);
  const [deepProjectId, setDeepProjectId] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [shallowInput, setShallowInput] = useState("");
  const [shallowMinutes, setShallowMinutes] = useState(30);

  // Transition
  const [transitionDir, setTransitionDir] = useState<"next" | "prev">("next");
  const [visible, setVisible] = useState(true);

  // ---- Data fetching ----

  const fetchGoals = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) setGoals(await res.json());
  }, []);

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) setProjects(await res.json());
  }, []);

  const fetchBehaviors = useCallback(async () => {
    const res = await fetch("/api/behaviors/today");
    if (res.ok) {
      const data: BehaviorToday[] = await res.json();
      setBehaviors(data);
      // Initialize toggles from today_done status (only if not already set from localStorage)
      setWizard((prev) => {
        const hasToggles = prev.habitToggles && Object.keys(prev.habitToggles).length > 0;
        if (hasToggles) return prev;
        const toggles: Record<number, boolean> = {};
        for (const b of data) {
          toggles[b.id] = b.today_done;
        }
        return { ...prev, habitToggles: toggles };
      });
    }
  }, []);

  const fetchOvercommitment = useCallback(async () => {
    const res = await fetch(`/api/overcommitment?date=${today}`);
    if (res.ok) setOvercommitment(await res.json());
  }, [today]);

  useEffect(() => {
    Promise.all([fetchGoals(), fetchBehaviors(), fetchProjects(), fetchOvercommitment()]).finally(() =>
      setLoading(false)
    );
  }, [fetchGoals, fetchBehaviors, fetchProjects, fetchOvercommitment]);

  // ---- Navigation ----

  function goToStep(target: number) {
    if (target === step) return;
    setTransitionDir(target > step ? "next" : "prev");
    setVisible(false);
    setTimeout(() => {
      setStep(target);
      setVisible(true);
    }, 200);
  }

  function next() {
    if (step < 5) goToStep(step + 1);
  }

  function prev() {
    if (step > 1) goToStep(step - 1);
  }

  // ---- Build all pending tasks ----

  function buildAllTasks(): PendingTask[] {
    const tasks: PendingTask[] = [];

    // Add toggled behaviors as habit tasks
    for (const b of behaviors) {
      if (wizard.habitToggles[b.id]) {
        tasks.push({
          id: nextLocalId(),
          title: b.title,
          type: "shallow",
          estimated_minutes: 30,
          goal_id: b.goal_id,
          project_id: null,
          is_frog: 0,
          urgent: 0,
          important: 1,
          source: "habit",
        });
      }
    }

    if (wizard.frogTitle.trim()) {
      tasks.push({
        id: nextLocalId(),
        title: wizard.frogTitle.trim(),
        type: "deep",
        estimated_minutes: wizard.frogMinutes,
        goal_id: null,
        project_id: wizard.frogProjectId,
        is_frog: 1,
        urgent: 0,
        important: 1,
        source: "manual",
      });
    }

    for (const t of wizard.deepTasks) {
      if (t.title.trim()) {
        tasks.push({
          id: nextLocalId(),
          title: t.title.trim(),
          type: "deep",
          estimated_minutes: t.minutes,
          goal_id: null,
          project_id: t.projectId,
          is_frog: 0,
          urgent: 0,
          important: 0,
          source: "manual",
        });
      }
    }

    for (const t of wizard.shallowTasks) {
      if (t.title.trim()) {
        tasks.push({
          id: nextLocalId(),
          title: t.title.trim(),
          type: "shallow",
          estimated_minutes: t.minutes,
          goal_id: null,
          project_id: null,
          is_frog: 0,
          urgent: 0,
          important: 0,
          source: "manual",
        });
      }
    }

    return tasks;
  }

  // ---- Computed values for Step 5 ----

  const allTasks = buildAllTasks();
  const totalDeep = allTasks
    .filter((t) => t.type === "deep")
    .reduce((s, t) => s + t.estimated_minutes, 0);
  const totalShallow = allTasks
    .filter((t) => t.type === "shallow")
    .reduce((s, t) => s + t.estimated_minutes, 0);
  const totalCommitted = totalDeep + totalShallow;

  const existingCommitted = overcommitment?.committed_minutes ?? 0;
  const previewCommitted = existingCommitted + totalCommitted;
  const previewAvailable = overcommitment?.available_minutes ?? 480;
  const previewRemaining = previewAvailable - previewCommitted;
  const previewStatus: "green" | "yellow" | "red" =
    previewRemaining >= 60 ? "green" : previewRemaining >= 0 ? "yellow" : "red";
  const barPercent = Math.min(
    (previewCommitted / Math.max(previewAvailable, 1)) * 100,
    120
  );

  // ---- Goals progress nudge ----

  const q = getCurrentQuarter();
  const goalsNeedingAttention = goals
    .filter((g) => {
      const target = g[`q${q}_target` as keyof Goal] as number;
      const actual = g[`q${q}_actual` as keyof Goal] as number;
      if (target === 0) return false;
      const pct = (actual / target) * 100;
      return pct < 50;
    })
    .slice(0, 3);

  // ---- Coach call ----

  async function askCoach() {
    setCoachLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "daily_plan_review",
          energy_level: wizard.energy,
          focus_word: wizard.focusWord,
          tasks: allTasks.map((t) => ({
            title: t.title,
            type: t.type,
            estimated_minutes: t.estimated_minutes,
            is_frog: t.is_frog,
            goal_id: t.goal_id,
          })),
          goals: goals.map((g) => ({
            id: g.id,
            title: g.title,
            area: g.area,
            unit: g.unit,
            q1_target: g.q1_target,
            q1_actual: g.q1_actual,
            q2_target: g.q2_target,
            q2_actual: g.q2_actual,
            q3_target: g.q3_target,
            q3_actual: g.q3_actual,
            q4_target: g.q4_target,
            q4_actual: g.q4_actual,
          })),
          habits_today: Object.fromEntries(
            behaviors
              .filter((b) => wizard.habitToggles[b.id])
              .map((b) => [b.title, true])
          ),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCoachResponse(data.message || data.response || JSON.stringify(data));
      } else {
        setCoachResponse("Coach unavailable right now. Start your day with confidence!");
      }
    } catch {
      setCoachResponse("Coach unavailable right now. Start your day with confidence!");
    }
    setCoachLoading(false);
  }

  // ---- Save everything ----

  async function handleStart() {
    setSaving(true);
    try {
      for (const task of allTasks) {
        await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: today,
            title: task.title,
            type: task.type,
            estimated_minutes: task.estimated_minutes,
            goal_id: task.goal_id,
            project_id: task.project_id,
            is_frog: task.is_frog,
            urgent: task.urgent,
            important: task.important,
          }),
        });
      }

      // Log behavior toggles
      for (const b of behaviors) {
        const toggled = wizard.habitToggles[b.id] ?? false;
        if (toggled !== b.today_done) {
          try {
            await fetch("/api/behaviors/log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                behavior_id: b.id,
                date: today,
              }),
            });
          } catch {
            // best effort
          }
        }
      }

      try {
        await fetch("/api/daily-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: today,
            energy_level: wizard.energy,
            focus_word: wizard.focusWord,
          }),
        });
      } catch {
        // daily-entry API may not exist yet
      }

      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(`daily-entry-step-${today}`);
      router.push("/");
    } catch {
      setSaving(false);
    }
  }

  // ---- Deep task add ----

  function addDeepTask() {
    if (!deepInput.trim()) return;
    setWizard((prev) => ({
      ...prev,
      deepTasks: [
        ...prev.deepTasks,
        { title: deepInput.trim(), minutes: deepMinutes, projectId: deepProjectId },
      ],
    }));
    setDeepInput("");
    setDeepMinutes(60);
    setDeepProjectId(null);
  }

  function removeDeepTask(index: number) {
    setWizard((prev) => ({
      ...prev,
      deepTasks: prev.deepTasks.filter((_, i) => i !== index),
    }));
  }

  // ---- Shallow task add ----

  function addShallowTask() {
    if (!shallowInput.trim()) return;
    setWizard((prev) => ({
      ...prev,
      shallowTasks: [
        ...prev.shallowTasks,
        { title: shallowInput.trim(), minutes: shallowMinutes },
      ],
    }));
    setShallowInput("");
    setShallowMinutes(30);
  }

  function removeShallowTask(index: number) {
    setWizard((prev) => ({
      ...prev,
      shallowTasks: prev.shallowTasks.filter((_, i) => i !== index),
    }));
  }

  // ---- Can advance? ----

  const canNext = step === 1 ? wizard.energy > 0 : true;

  // ---- Loading state ----

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <p className="font-ui text-sm text-tempo-muted animate-pulse">Loading...</p>
      </div>
    );
  }

  const prettyDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  // ---- Render ----

  return (
    <div className="max-w-[640px] px-14 py-12 min-h-screen flex flex-col">
      {/* Page header */}
      <div className="mb-12">
        <p className="font-accent text-xl text-tempo-muted mb-2">{prettyDate}</p>
        <h1 className="font-display text-tempo-text" style={{ fontSize: "36px", letterSpacing: "-0.01em" }}>
          Start Your Day
        </h1>
      </div>

      {/* Step indicator — numbered circles with connecting lines */}
      <div className="flex items-center mb-12">
        {STEP_LABELS.map((label, i) => {
          const s = i + 1;
          const isActive = s === step;
          const isDone = s < step;
          return (
            <div key={s} className="contents">
              {i > 0 && (
                <div
                  className={`flex-1 h-px min-w-[24px] mx-3 transition-colors ${
                    isDone ? "bg-tempo-text" : "bg-tempo-border"
                  }`}
                />
              )}
              <button
                onClick={() => { if (isDone) goToStep(s); }}
                className="flex items-center gap-2"
              >
                <div
                  className={`flex items-center justify-center font-ui text-xs font-medium flex-shrink-0 rounded-full transition-all ${
                    isActive
                      ? "bg-tempo-text text-tempo-bg"
                      : isDone
                        ? "bg-tempo-text text-tempo-bg cursor-pointer"
                        : "text-tempo-muted"
                  }`}
                  style={{
                    width: "28px", height: "28px",
                    border: !isActive && !isDone ? "1.5px solid var(--border)" : "none",
                  }}
                >
                  {isDone ? (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    s
                  )}
                </div>
                <span
                  className={`font-ui text-xs uppercase ${
                    isActive ? "text-tempo-text font-medium" : "text-tempo-muted"
                  }`}
                  style={{ letterSpacing: "0.08em" }}
                >
                  {label}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Step content with transition */}
      <div
        className={`flex-1 transition-all duration-200 ease-in-out ${
          visible
            ? "opacity-100 translate-y-0"
            : transitionDir === "next"
              ? "opacity-0 translate-y-4"
              : "opacity-0 -translate-y-4"
        }`}
      >
        {/* ===== STEP 1: Energy & Focus ===== */}
        {step === 1 && (
          <div className="space-y-12">
            {/* Energy selector */}
            <div>
              <h2 className="font-display text-tempo-text mb-2" style={{ fontSize: "24px" }}>Energy</h2>
              <p className="font-body text-[15px] mb-7" style={{ color: "var(--journal)" }}>How are you feeling this morning?</p>

              <p className="font-ui text-[11px] font-medium uppercase text-tempo-muted mb-3" style={{ letterSpacing: "0.12em" }}>
                How are you feeling?
              </p>
              <div className="flex gap-3 mb-8">
                {ENERGY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setWizard((prev) => ({ ...prev, energy: opt.value }))}
                    className="relative"
                  >
                    <div
                      className={`rounded-full transition-all ${
                        wizard.energy >= opt.value
                          ? "bg-tempo-accent border-tempo-accent"
                          : "border-tempo-border bg-transparent"
                      }`}
                      style={{
                        width: "36px", height: "36px",
                        border: wizard.energy >= opt.value ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                      }}
                    />
                    {opt.value === 1 && (
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-ui text-[11px] text-tempo-muted whitespace-nowrap">Low</span>
                    )}
                    {opt.value === 5 && (
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-ui text-[11px] text-tempo-muted whitespace-nowrap">High</span>
                    )}
                  </button>
                ))}
              </div>
              {wizard.energy > 0 && (
                <p className="font-ui text-xs text-tempo-muted mt-6">
                  {wizard.energy} / 5 — {wizard.energy >= 4 ? "Good energy today" : wizard.energy >= 2 ? "Moderate energy" : "Low energy — protect your focus blocks"}
                </p>
              )}
            </div>

            {/* Focus word */}
            <div>
              <p className="font-ui text-[11px] font-medium uppercase text-tempo-muted mb-2" style={{ letterSpacing: "0.12em" }}>
                Daily Intention
              </p>
              <input
                type="text"
                value={wizard.focusWord}
                onChange={(e) => setWizard((prev) => ({ ...prev, focusWord: e.target.value }))}
                placeholder="Ship the landing page and protect deep work time"
                className="w-full font-accent bg-transparent text-tempo-text px-0 py-2 border-b-2 border-tempo-border focus:border-tempo-accent transition-colors"
                style={{ fontSize: "28px", lineHeight: "1.3" }}
                maxLength={120}
              />
              <p className="font-body text-sm italic text-tempo-muted mt-2">
                What&apos;s your main intention for today?
              </p>
            </div>

            {/* Goals nudge */}
            {goalsNeedingAttention.length > 0 && (
              <div className="pl-6 border-l-2 border-tempo-accent space-y-2">
                <p className="font-ui text-[11px] font-medium uppercase text-tempo-muted" style={{ letterSpacing: "0.12em" }}>
                  Goals needing attention this quarter
                </p>
                {goalsNeedingAttention.map((g) => {
                  const target = g[`q${q}_target` as keyof Goal] as number;
                  const actual = g[`q${q}_actual` as keyof Goal] as number;
                  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
                  return (
                    <div key={g.id} className="flex items-center justify-between">
                      <span className="font-body text-sm text-tempo-text">{g.title}</span>
                      <span className="font-ui text-xs text-tempo-accent">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===== STEP 2: Habits ===== */}
        {step === 2 && (
          <div>
            <h2 className="font-display text-tempo-text mb-2" style={{ fontSize: "24px" }}>Habits</h2>
            <p className="font-body text-[15px] mb-7" style={{ color: "var(--journal)" }}>
              Check off what you&apos;ve done or plan to do today.
            </p>

            <div>
              {behaviors.length === 0 && (
                <p className="font-body text-sm text-tempo-muted italic py-4">
                  No habits defined yet. Add behaviors on the Goals page.
                </p>
              )}
              {behaviors.map((b) => (
                <HabitToggle
                  key={b.id}
                  label={b.title}
                  sublabel={b.streak > 0 ? `${b.streak} day streak` : "Start today"}
                  active={wizard.habitToggles[b.id] ?? false}
                  onToggle={() =>
                    setWizard((prev) => ({
                      ...prev,
                      habitToggles: {
                        ...prev.habitToggles,
                        [b.id]: !(prev.habitToggles[b.id] ?? false),
                      },
                    }))
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* ===== STEP 3: Deep Work ===== */}
        {step === 3 && (
          <div>
            <h2 className="font-display text-tempo-text mb-2" style={{ fontSize: "24px" }}>Deep Work</h2>
            <p className="font-body text-[15px] mb-7" style={{ color: "var(--journal)" }}>
              {overcommitment
                ? `${overcommitment.deep_blocks} deep work block${overcommitment.deep_blocks !== 1 ? "s" : ""} available today.`
                : "Define your priorities for today."}
            </p>

            {/* Frog */}
            <div className="mb-10">
              <div className="flex items-baseline gap-3 mb-4">
                <p className="font-ui text-[11px] font-medium uppercase text-tempo-muted" style={{ letterSpacing: "0.12em" }}>
                  Today&apos;s Frog
                </p>
                <span
                  className="font-ui font-semibold uppercase bg-tempo-accent-light text-tempo-accent"
                  style={{ fontSize: "9px", letterSpacing: "0.14em", padding: "2px 7px" }}
                >
                  Hardest first
                </span>
              </div>
              <input
                type="text"
                value={wizard.frogTitle}
                onChange={(e) => setWizard((prev) => ({ ...prev, frogTitle: e.target.value }))}
                placeholder="e.g. Write commercial proposal..."
                className="w-full font-body text-base border-b border-tempo-border bg-transparent px-0 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent transition-colors"
              />
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <span className="font-ui text-[11px] uppercase text-tempo-muted" style={{ letterSpacing: "0.1em" }}>Time:</span>
                {[30, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    onClick={() => setWizard((prev) => ({ ...prev, frogMinutes: m }))}
                    className={`font-ui text-[13px] font-medium px-4 py-2 transition-colors ${
                      wizard.frogMinutes === m
                        ? "bg-tempo-text text-tempo-bg"
                        : "border border-tempo-border text-tempo-muted hover:border-tempo-text hover:text-tempo-text"
                    }`}
                    style={{ letterSpacing: "0.04em" }}
                  >
                    {formatMinutes(m)}
                  </button>
                ))}
                <select
                  value={wizard.frogProjectId ?? ""}
                  onChange={(e) =>
                    setWizard((prev) => ({
                      ...prev,
                      frogProjectId: e.target.value ? Number(e.target.value) : null,
                    }))
                  }
                  className="ml-auto font-ui text-xs border border-tempo-border bg-transparent px-3 py-2 text-tempo-text focus:border-tempo-accent"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* More deep tasks */}
            <div>
              <p className="font-ui text-[11px] font-medium uppercase text-tempo-muted mb-4" style={{ letterSpacing: "0.12em" }}>
                Other deep work
              </p>

              {wizard.deepTasks.length > 0 && (
                <div>
                  {wizard.deepTasks.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 border-b border-tempo-border py-3"
                    >
                      <span className="flex-1 font-body text-base text-tempo-text">{t.title}</span>
                      <span className="font-ui text-[13px] text-tempo-muted tabular-nums">
                        {formatMinutes(t.minutes)}
                      </span>
                      {t.projectId && (
                        <span className="font-ui text-xs text-tempo-muted">
                          {projects.find((p) => p.id === t.projectId)?.name}
                        </span>
                      )}
                      <button
                        onClick={() => removeDeepTask(i)}
                        className="text-tempo-muted hover:text-tempo-accent transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 mt-3">
                <input
                  type="text"
                  value={deepInput}
                  onChange={(e) => setDeepInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addDeepTask();
                    }
                  }}
                  placeholder="Add task..."
                  className="flex-1 font-body text-base border-b border-tempo-border bg-transparent px-0 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent transition-colors"
                />
                <button
                  onClick={addDeepTask}
                  disabled={!deepInput.trim()}
                  className="font-ui text-[13px] font-medium bg-tempo-text text-tempo-bg px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  style={{ letterSpacing: "0.04em" }}
                >
                  Add
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                {[30, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDeepMinutes(m)}
                    className={`font-ui text-[13px] font-medium px-4 py-2 transition-colors ${
                      deepMinutes === m
                        ? "bg-tempo-text text-tempo-bg"
                        : "border border-tempo-border text-tempo-muted hover:border-tempo-text hover:text-tempo-text"
                    }`}
                    style={{ letterSpacing: "0.04em" }}
                  >
                    {formatMinutes(m)}
                  </button>
                ))}
                <select
                  value={deepProjectId ?? ""}
                  onChange={(e) => setDeepProjectId(e.target.value ? Number(e.target.value) : null)}
                  className="ml-auto font-ui text-xs border border-tempo-border bg-transparent px-3 py-2 text-tempo-text focus:border-tempo-accent"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="+ Project"
                  className="w-24 font-ui text-xs border border-tempo-border bg-transparent px-3 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newProjectName.trim()) {
                      e.preventDefault();
                      const res = await fetch("/api/projects", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: newProjectName.trim() }),
                      });
                      if (res.ok) {
                        await fetchProjects();
                        setNewProjectName("");
                      }
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 4: Shallow Work ===== */}
        {step === 4 && (
          <div>
            <h2 className="font-display text-tempo-text mb-2" style={{ fontSize: "24px" }}>Shallow Work</h2>
            <p className="font-body text-[15px] mb-7" style={{ color: "var(--journal)" }}>
              Support &amp; admin tasks.
            </p>

            {wizard.shallowTasks.length > 0 && (
              <div>
                {wizard.shallowTasks.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-tempo-border py-3"
                  >
                    <span className="flex-1 font-body text-base text-tempo-text">{t.title}</span>
                    <span className="font-ui text-[13px] text-tempo-muted tabular-nums">
                      {formatMinutes(t.minutes)}
                    </span>
                    <button
                      onClick={() => removeShallowTask(i)}
                      className="text-tempo-muted hover:text-tempo-accent transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 mt-3">
              <input
                type="text"
                value={shallowInput}
                onChange={(e) => setShallowInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addShallowTask();
                  }
                }}
                placeholder="Add task..."
                className="flex-1 font-body text-base border-b border-tempo-border bg-transparent px-0 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent transition-colors"
              />
              <button
                onClick={addShallowTask}
                disabled={!shallowInput.trim()}
                className="font-ui text-[13px] font-medium bg-tempo-text text-tempo-bg px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                style={{ letterSpacing: "0.04em" }}
              >
                Add
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              {[15, 30, 45, 60].map((m) => (
                <button
                  key={m}
                  onClick={() => setShallowMinutes(m)}
                  className={`font-ui text-[13px] font-medium px-4 py-2 transition-colors ${
                    shallowMinutes === m
                      ? "bg-tempo-text text-tempo-bg"
                      : "border border-tempo-border text-tempo-muted hover:border-tempo-text hover:text-tempo-text"
                  }`}
                  style={{ letterSpacing: "0.04em" }}
                >
                  {formatMinutes(m)}
                </button>
              ))}
            </div>

            {wizard.shallowTasks.length === 0 && (
              <p className="font-body text-base text-tempo-muted py-8 text-center">
                No shallow tasks yet. You can skip if you don&apos;t have any.
              </p>
            )}
          </div>
        )}

        {/* ===== STEP 5: Review ===== */}
        {step === 5 && (
          <div>
            <h2 className="font-display text-tempo-text mb-2" style={{ fontSize: "24px" }}>Review</h2>
            <p className="font-body text-[15px] mb-7" style={{ color: "var(--journal)" }}>
              {wizard.focusWord
                ? `Focus: "${wizard.focusWord}" · Energy: ${wizard.energy}/5`
                : "Review your plan before starting"}
            </p>

            {/* Capacity bar — matches dashboard 6px style */}
            <div className="mb-10">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-ui text-[11px] font-medium uppercase text-tempo-muted" style={{ letterSpacing: "0.12em" }}>
                  Time Allocation
                </span>
                <span className="font-ui text-xs text-tempo-muted">
                  {formatMinutes(previewCommitted)} / {formatMinutes(previewAvailable)}
                </span>
              </div>
              <div className="relative w-full" style={{ height: "6px", background: "var(--border)" }}>
                <div
                  className="absolute left-0 top-0 h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(barPercent, 100)}%`,
                    background: previewStatus === "red" ? "var(--accent)" : "var(--text)",
                    opacity: previewStatus === "red" ? 1 : 0.25,
                  }}
                />
                <div
                  className="absolute bg-tempo-text"
                  style={{ left: "100%", top: "-6px", width: "1.5px", height: "18px" }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className={`font-ui text-xs ${
                  previewStatus === "red" ? "text-tempo-accent" : "text-tempo-muted"
                }`}>
                  {previewRemaining >= 0
                    ? `${formatMinutes(previewRemaining)} remaining`
                    : `${formatMinutes(Math.abs(previewRemaining))} over`}
                </span>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-8 mt-6 pt-6 border-t border-tempo-border">
                <div>
                  <p className="font-display text-tempo-text" style={{ fontSize: "28px", lineHeight: "1.1" }}>
                    {formatMinutes(totalDeep)}
                  </p>
                  <p className="font-ui text-[11px] text-tempo-muted uppercase mt-0.5" style={{ letterSpacing: "0.1em" }}>
                    Deep work
                  </p>
                </div>
                <div>
                  <p className="font-display text-tempo-text" style={{ fontSize: "28px", lineHeight: "1.1" }}>
                    {formatMinutes(totalShallow)}
                  </p>
                  <p className="font-ui text-[11px] text-tempo-muted uppercase mt-0.5" style={{ letterSpacing: "0.1em" }}>
                    Shallow
                  </p>
                </div>
                <div>
                  <p className="font-display text-tempo-text" style={{ fontSize: "28px", lineHeight: "1.1" }}>
                    {allTasks.length}
                  </p>
                  <p className="font-ui text-[11px] text-tempo-muted uppercase mt-0.5" style={{ letterSpacing: "0.1em" }}>
                    Tasks
                  </p>
                </div>
              </div>
            </div>

            {/* Overcommitment warning */}
            {previewStatus === "red" && (
              <p className="font-body text-base text-tempo-accent border-l-2 border-tempo-accent pl-4 mb-8">
                You&apos;re overcommitted. Consider cutting or moving tasks.
              </p>
            )}

            {/* Task list grouped */}
            <div className="space-y-8 mb-10">
              {allTasks.filter((t) => t.is_frog).length > 0 && (
                <div>
                  <h3
                    className="font-ui font-semibold uppercase text-tempo-accent mb-3"
                    style={{ fontSize: "9px", letterSpacing: "0.14em" }}
                  >
                    Frog
                  </h3>
                  {allTasks
                    .filter((t) => t.is_frog)
                    .map((t) => (
                      <TaskPreviewRow key={t.id} task={t} projects={projects} />
                    ))}
                </div>
              )}

              {allTasks.filter((t) => !t.is_frog && t.type === "deep").length > 0 && (
                <div>
                  <h3
                    className="font-ui font-semibold uppercase text-tempo-muted mb-3"
                    style={{ fontSize: "9px", letterSpacing: "0.14em" }}
                  >
                    Deep Work
                  </h3>
                  {allTasks
                    .filter((t) => !t.is_frog && t.type === "deep")
                    .map((t) => (
                      <TaskPreviewRow key={t.id} task={t} projects={projects} />
                    ))}
                </div>
              )}

              {allTasks.filter((t) => t.type === "shallow").length > 0 && (
                <div>
                  <h3
                    className="font-ui font-semibold uppercase text-tempo-muted mb-3"
                    style={{ fontSize: "9px", letterSpacing: "0.14em" }}
                  >
                    Shallow Work
                  </h3>
                  {allTasks
                    .filter((t) => t.type === "shallow")
                    .map((t) => (
                      <TaskPreviewRow key={t.id} task={t} projects={projects} />
                    ))}
                </div>
              )}

              {allTasks.length === 0 && (
                <p className="font-body text-base text-tempo-muted text-center py-6">
                  No tasks added. Go back and add at least one.
                </p>
              )}
            </div>

            {/* Coach */}
            <div className="pt-8 border-t border-tempo-border">
              <h3 className="font-display text-tempo-text mb-4" style={{ fontSize: "24px" }}>Coach</h3>

              {coachResponse && (
                <div className="pl-6 border-l-2 border-tempo-border mb-4">
                  <p className="font-accent text-[17px] text-tempo-muted mb-1">
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </p>
                  <p className="font-body text-base italic leading-relaxed whitespace-pre-wrap" style={{ color: "var(--journal)" }}>
                    {coachResponse}
                  </p>
                </div>
              )}

              <button
                onClick={askCoach}
                disabled={coachLoading || allTasks.length === 0}
                className="font-ui text-[13px] font-medium border border-tempo-text text-tempo-text px-6 py-2.5 hover:bg-tempo-text hover:text-tempo-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ letterSpacing: "0.04em" }}
              >
                {coachLoading ? "Thinking..." : coachResponse ? "Ask again" : "Ask Coach for advice"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="sticky bottom-0 bg-tempo-bg pt-6 pb-8 mt-10 flex items-center justify-between gap-4">
        {step > 1 ? (
          <button
            onClick={prev}
            className="font-ui text-[13px] font-medium text-tempo-muted hover:text-tempo-text transition-colors px-4 py-2.5"
            style={{ letterSpacing: "0.04em" }}
          >
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 5 ? (
          <button
            onClick={next}
            disabled={!canNext}
            className="font-ui text-[13px] font-medium bg-tempo-text text-tempo-bg px-8 py-3 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ letterSpacing: "0.04em" }}
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={saving || allTasks.length === 0}
            className="font-ui text-[13px] font-medium bg-tempo-text text-tempo-bg px-8 py-3 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            style={{ letterSpacing: "0.04em" }}
          >
            {saving ? "Saving..." : "Start the day"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HabitToggle({
  label,
  sublabel,
  active,
  onToggle,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-4 border-b border-tempo-border text-left transition-colors"
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-body text-[17px] text-tempo-text">{label}</span>
        <span className="font-ui text-xs text-tempo-muted">{sublabel}</span>
      </div>
      {/* Toggle switch — 44x24 pill */}
      <div
        className={`relative flex-shrink-0 rounded-full transition-colors ${
          active ? "bg-tempo-olive" : "bg-tempo-muted"
        }`}
        style={{ width: "44px", height: "24px" }}
      >
        <div
          className="absolute top-[2px] bg-white rounded-full transition-transform"
          style={{
            width: "20px", height: "20px",
            left: "2px",
            transform: active ? "translateX(20px)" : "translateX(0)",
          }}
        />
      </div>
    </button>
  );
}

function TaskPreviewRow({ task, projects }: { task: PendingTask; projects: Project[] }) {
  const projectName = task.project_id
    ? projects.find((p) => p.id === task.project_id)?.name ?? null
    : null;

  return (
    <div className={`flex items-start gap-3.5 py-3 border-b border-tempo-border ${
      task.is_frog ? "border-l-[3px] border-l-tempo-accent pl-3.5 -ml-[3px]" : ""
    }`}>
      <div className="flex-1 min-w-0">
        <p className="font-body text-base text-tempo-text">{task.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {task.source === "habit" && (
            <span
              className="font-ui font-semibold uppercase bg-tempo-surface text-tempo-muted"
              style={{ fontSize: "9px", letterSpacing: "0.14em", padding: "2px 7px" }}
            >
              Habit
            </span>
          )}
          <span
            className={`font-ui font-semibold uppercase ${
              task.is_frog
                ? "bg-tempo-accent-light text-tempo-accent"
                : task.type === "deep"
                  ? "bg-tempo-surface text-tempo-text border border-tempo-border"
                  : "bg-tempo-surface text-tempo-muted"
            }`}
            style={{ fontSize: "9px", letterSpacing: "0.14em", padding: "2px 7px" }}
          >
            {task.is_frog ? "Frog" : task.type}
          </span>
          {projectName && (
            <span className="font-ui text-xs text-tempo-muted">{projectName}</span>
          )}
        </div>
      </div>
      <span className="font-ui text-[13px] text-tempo-muted flex-shrink-0 mt-[3px] tabular-nums">
        {task.estimated_minutes} min
      </span>
    </div>
  );
}
