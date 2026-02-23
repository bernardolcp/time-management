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
  id: string; // local ID for key purposes
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

interface WizardState {
  // Step 1
  energy: number; // 1-5
  focusWord: string;
  // Step 2
  training: boolean;
  spiritual: boolean;
  family: boolean;
  content: boolean;
  contentDescription: string;
  // Step 3
  frogTitle: string;
  frogProjectId: number | null;
  frogMinutes: number;
  deepTasks: { title: string; minutes: number; projectId: number | null }[];
  // Step 4
  shallowTasks: { title: string; minutes: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDatePretty(): string {
  return new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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

const AREA_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Saude": { bg: "bg-emerald-50", border: "border-emerald-400", text: "text-emerald-700" },
  "Saúde": { bg: "bg-emerald-50", border: "border-emerald-400", text: "text-emerald-700" },
  "Health": { bg: "bg-emerald-50", border: "border-emerald-400", text: "text-emerald-700" },
  "Família": { bg: "bg-rose-50", border: "border-rose-400", text: "text-rose-700" },
  "Family": { bg: "bg-rose-50", border: "border-rose-400", text: "text-rose-700" },
  "Relationships": { bg: "bg-rose-50", border: "border-rose-400", text: "text-rose-700" },
  "Espiritual": { bg: "bg-violet-50", border: "border-violet-400", text: "text-violet-700" },
  "Spiritual": { bg: "bg-violet-50", border: "border-violet-400", text: "text-violet-700" },
  "Criativo": { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-700" },
  "Creative": { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-700" },
};

function getAreaColor(area: string) {
  return AREA_COLORS[area] || { bg: "bg-zinc-50", border: "border-zinc-300", text: "text-zinc-700" };
}

let localIdCounter = 0;
function nextLocalId(): string {
  return `local-${++localIdCounter}`;
}

// ---------------------------------------------------------------------------
// Energy config
// ---------------------------------------------------------------------------

const ENERGY_OPTIONS = [
  { value: 1, emoji: "\u{1F634}", label: "Exausto" },
  { value: 2, emoji: "\u{1F610}", label: "Baixa" },
  { value: 3, emoji: "\u{1F642}", label: "Normal" },
  { value: 4, emoji: "\u{1F60A}", label: "Boa" },
  { value: 5, emoji: "\u{26A1}", label: "Energia total" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DailyEntryPage() {
  const router = useRouter();
  const today = getTodayISO();

  const [step, setStep] = useState(1);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [overcommitment, setOvercommitment] = useState<OvercommitmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachResponse, setCoachResponse] = useState<string | null>(null);

  const [wizard, setWizard] = useState<WizardState>({
    energy: 0,
    focusWord: "",
    training: false,
    spiritual: false,
    family: false,
    content: false,
    contentDescription: "",
    frogTitle: "",
    frogProjectId: null,
    frogMinutes: 90,
    deepTasks: [],
    shallowTasks: [],
  });

  // Quick-add inputs (not part of wizard state)
  const [deepInput, setDeepInput] = useState("");
  const [deepMinutes, setDeepMinutes] = useState(60);
  const [deepProjectId, setDeepProjectId] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [shallowInput, setShallowInput] = useState("");
  const [shallowMinutes, setShallowMinutes] = useState(30);

  // Direction of step transition
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

  const fetchOvercommitment = useCallback(async () => {
    const res = await fetch(`/api/overcommitment?date=${today}`);
    if (res.ok) setOvercommitment(await res.json());
  }, [today]);

  useEffect(() => {
    Promise.all([fetchGoals(), fetchProjects(), fetchOvercommitment()]).finally(() =>
      setLoading(false)
    );
  }, [fetchGoals, fetchProjects, fetchOvercommitment]);

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

    // Habit-based tasks (no deep/shallow classification — these are habits)
    if (wizard.training) {
      const goalId = findGoalByArea(["Saude", "Saúde", "Health"]);
      tasks.push({
        id: nextLocalId(),
        title: "Treino",
        type: "shallow",
        estimated_minutes: 45,
        goal_id: goalId,
        project_id: null,
        is_frog: 0,
        urgent: 0,
        important: 1,
        source: "habit",
      });
    }

    if (wizard.spiritual) {
      const goalId = findGoalByArea(["Espiritual", "Spiritual"]);
      tasks.push({
        id: nextLocalId(),
        title: "Momento espiritual",
        type: "shallow",
        estimated_minutes: 10,
        goal_id: goalId,
        project_id: null,
        is_frog: 0,
        urgent: 0,
        important: 1,
        source: "habit",
      });
    }

    if (wizard.content && wizard.contentDescription.trim()) {
      const goalId = findGoalByArea(["Criativo", "Creative"]);
      tasks.push({
        id: nextLocalId(),
        title: wizard.contentDescription.trim(),
        type: "shallow",
        estimated_minutes: 30,
        goal_id: goalId,
        project_id: null,
        is_frog: 0,
        urgent: 0,
        important: 1,
        source: "habit",
      });
    }

    // Frog task
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

    // Deep tasks
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

    // Shallow tasks
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

  function findGoalByArea(areas: string[]): number | null {
    const lowerAreas = areas.map((a) => a.toLowerCase());
    const goal = goals.find((g) => lowerAreas.includes(g.area.toLowerCase()));
    return goal?.id ?? null;
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

  // Simulated overcommitment for preview (existing committed + new tasks)
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

  // ---- Goals progress nudge (Step 1) ----

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
            [`q${q}_target`]: g[`q${q}_target` as keyof Goal],
            [`q${q}_actual`]: g[`q${q}_actual` as keyof Goal],
          })),
          habits_today: {
            training: wizard.training,
            spiritual: wizard.spiritual,
            family: wizard.family,
            content: wizard.content,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCoachResponse(data.message || data.response || JSON.stringify(data));
      } else {
        setCoachResponse("Desculpe, o coach nao esta disponivel agora. Comece seu dia com confianca!");
      }
    } catch {
      setCoachResponse("Desculpe, o coach nao esta disponivel agora. Comece seu dia com confianca!");
    }
    setCoachLoading(false);
  }

  // ---- Save everything ----

  async function handleStart() {
    setSaving(true);
    try {
      // Batch create all tasks
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

      // Save daily entry
      try {
        await fetch("/api/daily-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: today,
            energy_level: wizard.energy,
            focus_word: wizard.focusWord,
            training: wizard.training,
            spiritual: wizard.spiritual,
            family: wizard.family,
            content: wizard.content,
            content_description: wizard.contentDescription,
          }),
        });
      } catch {
        // daily-entry API may not exist yet, that's fine
      }

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

  const canNext =
    step === 1
      ? wizard.energy > 0
      : step === 2
        ? true
        : step === 3
          ? true
          : step === 4
            ? true
            : true;

  // ---- Loading state ----

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-zinc-400 text-sm">Carregando...</div>
      </div>
    );
  }

  // ---- Render ----

  return (
    <div className="max-w-2xl mx-auto min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-4 pb-8">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onClick={() => {
              if (s < step) goToStep(s);
            }}
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              s === step
                ? "bg-emerald-500 scale-125"
                : s < step
                  ? "bg-emerald-300 cursor-pointer hover:bg-emerald-400"
                  : "bg-zinc-200"
            }`}
            aria-label={`Passo ${s}`}
          />
        ))}
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
        {/* ===== STEP 1: Bom dia! ===== */}
        {step === 1 && (
          <div className="space-y-8">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-zinc-900 mb-2">
                Bom dia! {"\u{2600}\u{FE0F}"}
              </h1>
              <p className="text-zinc-500 capitalize">{formatDatePretty()}</p>
            </div>

            {/* Energy selector */}
            <div className="space-y-3">
              <p className="text-center text-lg font-medium text-zinc-700">
                Como esta sua energia hoje?
              </p>
              <div className="flex justify-center gap-3">
                {ENERGY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setWizard((prev) => ({ ...prev, energy: opt.value }))}
                    className={`flex flex-col items-center gap-1 w-16 h-20 rounded-xl border-2 transition-all duration-200 ${
                      wizard.energy === opt.value
                        ? "border-emerald-500 bg-emerald-50 scale-110 shadow-md"
                        : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                    }`}
                  >
                    <span className="text-2xl mt-2">{opt.emoji}</span>
                    <span className="text-[10px] text-zinc-500 font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Focus word */}
            <div className="space-y-3">
              <p className="text-center text-lg font-medium text-zinc-700">
                Uma palavra para definir o foco de hoje:
              </p>
              <input
                type="text"
                value={wizard.focusWord}
                onChange={(e) => setWizard((prev) => ({ ...prev, focusWord: e.target.value }))}
                placeholder="Ex: disciplina, entrega, calma..."
                className="w-full text-center text-lg border-2 border-zinc-200 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 transition-colors"
                maxLength={30}
              />
            </div>

            {/* Goals nudge */}
            {goalsNeedingAttention.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-sm font-medium text-amber-800 mb-3">
                  {"\u{1F4CA}"} Areas que precisam de atencao neste trimestre:
                </p>
                <div className="space-y-2">
                  {goalsNeedingAttention.map((g) => {
                    const target = g[`q${q}_target` as keyof Goal] as number;
                    const actual = g[`q${q}_actual` as keyof Goal] as number;
                    const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
                    const colors = getAreaColor(g.area);
                    return (
                      <div key={g.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
                          >
                            {g.area}
                          </span>
                          <span className="text-sm text-zinc-700">{g.title}</span>
                        </div>
                        <span className="text-sm font-medium text-amber-700">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== STEP 2: Corpo & Espírito ===== */}
        {step === 2 && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-zinc-900 mb-2">
                Corpo & Espirito
              </h2>
              <p className="text-zinc-500">Selecione os habitos de hoje</p>
            </div>

            <div className="space-y-4">
              {/* Training */}
              <button
                onClick={() => setWizard((prev) => ({ ...prev, training: !prev.training }))}
                className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                  wizard.training
                    ? "border-emerald-500 bg-emerald-50 shadow-sm"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <span className="text-3xl">{"\u{1F4AA}"}</span>
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900">Vai treinar hoje?</p>
                  <p className="text-xs text-zinc-500 mt-0.5">45 min</p>
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    wizard.training
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-zinc-300"
                  }`}
                >
                  {wizard.training && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Spiritual */}
              <button
                onClick={() => setWizard((prev) => ({ ...prev, spiritual: !prev.spiritual }))}
                className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                  wizard.spiritual
                    ? "border-violet-500 bg-violet-50 shadow-sm"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <span className="text-3xl">{"\u{1F64F}"}</span>
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900">Momento espiritual hoje?</p>
                  <p className="text-xs text-zinc-500 mt-0.5">10 min</p>
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    wizard.spiritual
                      ? "border-violet-500 bg-violet-500"
                      : "border-zinc-300"
                  }`}
                >
                  {wizard.spiritual && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Family */}
              <button
                onClick={() => setWizard((prev) => ({ ...prev, family: !prev.family }))}
                className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                  wizard.family
                    ? "border-rose-500 bg-rose-50 shadow-sm"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
              >
                <span className="text-3xl">{"\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}"}</span>
                <div className="flex-1">
                  <p className="font-semibold text-zinc-900">Hoje e dia de familia?</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Marca o dia como tempo em familia</p>
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    wizard.family
                      ? "border-rose-500 bg-rose-500"
                      : "border-zinc-300"
                  }`}
                >
                  {wizard.family && (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </button>

              {/* Content creation */}
              <div>
                <button
                  onClick={() => setWizard((prev) => ({ ...prev, content: !prev.content }))}
                  className={`w-full flex items-center gap-4 p-5 rounded-xl border-2 transition-all duration-200 text-left ${
                    wizard.content
                      ? "border-amber-500 bg-amber-50 shadow-sm"
                      : "border-zinc-200 bg-white hover:border-zinc-300"
                  }`}
                >
                  <span className="text-3xl">{"\u{1F3A8}"}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-zinc-900">Vai produzir conteudo?</p>
                    <p className="text-xs text-zinc-500 mt-0.5">30 min</p>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      wizard.content
                        ? "border-amber-500 bg-amber-500"
                        : "border-zinc-300"
                    }`}
                  >
                    {wizard.content && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                </button>

                {/* Content description input */}
                {wizard.content && (
                  <div className="mt-3 ml-16 mr-4">
                    <input
                      type="text"
                      value={wizard.contentDescription}
                      onChange={(e) =>
                        setWizard((prev) => ({ ...prev, contentDescription: e.target.value }))
                      }
                      placeholder="Qual conteudo vai produzir?"
                      className="w-full border-2 border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                      autoFocus
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== STEP 3: Deep Work ===== */}
        {step === 3 && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-zinc-900 mb-2">
                Deep Work
              </h2>
              <p className="text-zinc-500">
                {overcommitment
                  ? `${overcommitment.deep_blocks} bloco${overcommitment.deep_blocks !== 1 ? "s" : ""} de deep work disponivel${overcommitment.deep_blocks !== 1 ? "is" : ""}`
                  : "Defina suas prioridades do dia"}
              </p>
            </div>

            {/* Frog */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{"\u{1F438}"}</span>
                <p className="text-lg font-semibold text-zinc-900">
                  Qual e o frog do dia?
                </p>
              </div>
              <p className="text-xs text-zinc-500 -mt-1 ml-8">
                A tarefa mais importante e dificil. Faca primeiro.
              </p>
              <input
                type="text"
                value={wizard.frogTitle}
                onChange={(e) => setWizard((prev) => ({ ...prev, frogTitle: e.target.value }))}
                placeholder="Ex: Escrever proposta comercial..."
                className="w-full border-2 border-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-zinc-500">Tempo:</span>
                {[30, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    onClick={() => setWizard((prev) => ({ ...prev, frogMinutes: m }))}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      wizard.frogMinutes === m
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
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
                  className="ml-auto border border-zinc-200 rounded-lg px-2 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Sem projeto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* More deep tasks */}
            <div className="space-y-3">
              <p className="text-lg font-semibold text-zinc-900">
                Outras tasks de deep work
              </p>

              {/* Existing deep tasks */}
              {wizard.deepTasks.length > 0 && (
                <div className="space-y-2">
                  {wizard.deepTasks.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-white border border-zinc-200 rounded-lg px-4 py-2.5"
                    >
                      <span className="flex-1 text-sm text-zinc-900">{t.title}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                        {formatMinutes(t.minutes)}
                      </span>
                      {t.projectId && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                          {projects.find((p) => p.id === t.projectId)?.name}
                        </span>
                      )}
                      <button
                        onClick={() => removeDeepTask(i)}
                        className="text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick add */}
              <div className="flex items-center gap-2">
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
                  placeholder="Adicionar tarefa..."
                  className="flex-1 border-2 border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  onClick={addDeepTask}
                  disabled={!deepInput.trim()}
                  className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  +
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[30, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    onClick={() => setDeepMinutes(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      deepMinutes === m
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {formatMinutes(m)}
                  </button>
                ))}
                <select
                  value={deepProjectId ?? ""}
                  onChange={(e) => setDeepProjectId(e.target.value ? Number(e.target.value) : null)}
                  className="ml-auto border border-zinc-200 rounded-lg px-2 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Sem projeto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {/* Add new project inline */}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="+ Projeto"
                    className="w-24 border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          </div>
        )}

        {/* ===== STEP 4: Shallow Work ===== */}
        {step === 4 && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-zinc-900 mb-2">
                Shallow Work
              </h2>
              <p className="text-zinc-500">Tasks de apoio e administrativas</p>
            </div>

            <div className="space-y-3">
              {/* Existing shallow tasks */}
              {wizard.shallowTasks.length > 0 && (
                <div className="space-y-2">
                  {wizard.shallowTasks.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-white border border-zinc-200 rounded-lg px-4 py-2.5"
                    >
                      <span className="flex-1 text-sm text-zinc-900">{t.title}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                        {formatMinutes(t.minutes)}
                      </span>
                      <button
                        onClick={() => removeShallowTask(i)}
                        className="text-zinc-300 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick add */}
              <div className="flex items-center gap-2">
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
                  placeholder="Adicionar tarefa..."
                  className="flex-1 border-2 border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
                <button
                  onClick={addShallowTask}
                  disabled={!shallowInput.trim()}
                  className="px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  +
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    onClick={() => setShallowMinutes(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      shallowMinutes === m
                        ? "bg-zinc-700 text-white"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                    }`}
                  >
                    {formatMinutes(m)}
                  </button>
                ))}
              </div>

              {wizard.shallowTasks.length === 0 && (
                <p className="text-center text-sm text-zinc-400 py-6">
                  Nenhuma tarefa shallow adicionada ainda.
                  <br />
                  Voce pode pular se nao tiver nenhuma agora.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ===== STEP 5: Review do Plano ===== */}
        {step === 5 && (
          <div className="space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold text-zinc-900 mb-2">
                Review do Plano
              </h2>
              <p className="text-zinc-500">
                {wizard.focusWord
                  ? `Foco: "${wizard.focusWord}" | Energia: ${ENERGY_OPTIONS.find((e) => e.value === wizard.energy)?.emoji ?? ""}`
                  : "Confira seu plano antes de comecar"}
              </p>
            </div>

            {/* Overcommitment bar */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-zinc-700">
                  {formatMinutes(previewCommitted)} / {formatMinutes(previewAvailable)}
                </span>
                <span
                  className={`font-medium ${
                    previewStatus === "green"
                      ? "text-emerald-600"
                      : previewStatus === "yellow"
                        ? "text-amber-600"
                        : "text-red-600"
                  }`}
                >
                  {previewRemaining >= 0
                    ? `${formatMinutes(previewRemaining)} restante`
                    : `${formatMinutes(Math.abs(previewRemaining))} excedido`}
                </span>
              </div>
              <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    previewStatus === "green"
                      ? "bg-emerald-500"
                      : previewStatus === "yellow"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(barPercent, 100)}%` }}
                />
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-4 pt-2 text-center">
                <div>
                  <div className="text-lg font-bold text-indigo-600">{formatMinutes(totalDeep)}</div>
                  <div className="text-xs text-zinc-400">Deep work</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-zinc-600">{formatMinutes(totalShallow)}</div>
                  <div className="text-xs text-zinc-400">Shallow</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-zinc-900">{allTasks.length}</div>
                  <div className="text-xs text-zinc-400">Tasks</div>
                </div>
              </div>
            </div>

            {/* Overcommitment warning */}
            {previewStatus === "red" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-medium text-red-800">
                  {"\u{26A0}\u{FE0F}"} Voce esta sobrecarregado! Considere cortar ou mover algumas tasks para outro dia.
                </p>
              </div>
            )}

            {/* Task list grouped */}
            <div className="space-y-4">
              {/* Frog */}
              {allTasks.filter((t) => t.is_frog).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    {"\u{1F438}"} Eat the Frog
                  </h3>
                  {allTasks
                    .filter((t) => t.is_frog)
                    .map((t) => (
                      <TaskPreviewRow key={t.id} task={t} projects={projects} />
                    ))}
                </div>
              )}

              {/* Deep work */}
              {allTasks.filter((t) => !t.is_frog && t.type === "deep").length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                    Deep Work
                  </h3>
                  {allTasks
                    .filter((t) => !t.is_frog && t.type === "deep")
                    .map((t) => (
                      <TaskPreviewRow key={t.id} task={t} projects={projects} />
                    ))}
                </div>
              )}

              {/* Shallow work */}
              {allTasks.filter((t) => t.type === "shallow").length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
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
                <p className="text-center text-sm text-zinc-400 py-4">
                  Nenhuma tarefa adicionada. Volte e adicione pelo menos uma!
                </p>
              )}
            </div>

            {/* Coach section */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-lg">
                  {"\u{1F916}"}
                </div>
                <div>
                  <p className="font-semibold text-zinc-900">Coach IA</p>
                  <p className="text-xs text-zinc-500">Peca uma analise do seu plano</p>
                </div>
              </div>

              {coachResponse && (
                <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-700 whitespace-pre-wrap">
                  {coachResponse}
                </div>
              )}

              <button
                onClick={askCoach}
                disabled={coachLoading || allTasks.length === 0}
                className="w-full py-2.5 text-sm font-medium rounded-lg border-2 border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {coachLoading ? "Pensando..." : coachResponse ? "Pedir novamente" : "Pedir conselho do Coach"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="sticky bottom-0 bg-[#fafafa] pt-4 pb-6 mt-8 flex items-center justify-between gap-4">
        {step > 1 ? (
          <button
            onClick={prev}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-700 transition-colors"
          >
            {"\u{2190}"} Voltar
          </button>
        ) : (
          <div />
        )}

        {step < 5 ? (
          <button
            onClick={next}
            disabled={!canNext}
            className="px-8 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            Proximo {"\u{2192}"}
          </button>
        ) : (
          <button
            onClick={handleStart}
            disabled={saving || allTasks.length === 0}
            className="px-8 py-3 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {saving ? "Salvando..." : "Comecar o dia! \u{1F680}"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: Task preview row for Step 5
// ---------------------------------------------------------------------------

function TaskPreviewRow({ task, projects }: { task: PendingTask; projects: Project[] }) {
  const projectName = task.project_id
    ? projects.find((p) => p.id === task.project_id)?.name ?? null
    : null;

  return (
    <div className="flex items-center gap-3 bg-white border border-zinc-100 rounded-lg px-4 py-2.5 mb-1.5">
      {task.is_frog ? <span className="text-base">{"\u{1F438}"}</span> : null}
      {task.source === "habit" ? (
        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
          habito
        </span>
      ) : null}
      <span className="flex-1 text-sm text-zinc-900">{task.title}</span>
      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
        {formatMinutes(task.estimated_minutes)}
      </span>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          task.type === "deep"
            ? "bg-indigo-100 text-indigo-700"
            : "bg-slate-100 text-slate-600"
        }`}
      >
        {task.type}
      </span>
      {projectName && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
          {projectName}
        </span>
      )}
    </div>
  );
}
