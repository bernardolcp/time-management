"use client";

import { useEffect, useState, useCallback } from "react";

interface Task {
  id: number;
  date: string;
  title: string;
  type: "deep" | "shallow";
  estimated_minutes: number;
  goal_id: number | null;
  is_frog: number;
  urgent: number;
  important: number;
  completed: number;
  sort_order: number;
}

interface Overcommitment {
  status: "green" | "yellow" | "red";
  available_minutes: number;
  committed_minutes: number;
  remaining_minutes: number;
  deep_blocks: number;
}

interface Goal {
  id: number;
  title: string;
  area: string;
}

function formatMinutes(m: number): string {
  const h = Math.floor(Math.abs(m) / 60);
  const min = Math.abs(m) % 60;
  const sign = m < 0 ? "-" : "";
  if (h === 0) return `${sign}${min}m`;
  if (min === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${min}m`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PRESET_MINUTES = [15, 30, 45, 60, 90, 120];

export default function PlanPage() {
  const [date, setDate] = useState(todayStr);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [overcommitment, setOvercommitment] = useState<Overcommitment | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"deep" | "shallow">("deep");
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [customMinutes, setCustomMinutes] = useState("");
  const [goalId, setGoalId] = useState<number | null>(null);
  const [isFrog, setIsFrog] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [important, setImportant] = useState(false);

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?date=${date}`);
    if (res.ok) setTasks(await res.json());
  }, [date]);

  const fetchOvercommitment = useCallback(async () => {
    const res = await fetch(`/api/overcommitment?date=${date}`);
    if (res.ok) setOvercommitment(await res.json());
  }, [date]);

  const fetchGoals = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) setGoals(await res.json());
  }, []);

  const refetchAll = useCallback(async () => {
    await Promise.all([fetchTasks(), fetchOvercommitment()]);
  }, [fetchTasks, fetchOvercommitment]);

  useEffect(() => {
    fetchTasks();
    fetchOvercommitment();
  }, [fetchTasks, fetchOvercommitment]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  // Add task
  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const minutes = customMinutes ? parseInt(customMinutes, 10) : estimatedMinutes;

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        title: title.trim(),
        type,
        estimated_minutes: minutes,
        goal_id: goalId,
        is_frog: isFrog ? 1 : 0,
        urgent: urgent ? 1 : 0,
        important: important ? 1 : 0,
      }),
    });

    setTitle("");
    setCustomMinutes("");
    setEstimatedMinutes(30);
    setGoalId(null);
    setIsFrog(false);
    setUrgent(false);
    setImportant(false);
    await refetchAll();
  }

  // Toggle completed
  async function toggleCompleted(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: task.completed ? 0 : 1 }),
    });
    await refetchAll();
  }

  // Delete task
  async function deleteTask(id: number) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    await refetchAll();
  }

  // Group tasks
  const frogTasks = tasks.filter((t) => t.is_frog);
  const deepTasks = tasks.filter((t) => !t.is_frog && t.type === "deep");
  const shallowTasks = tasks.filter((t) => !t.is_frog && t.type === "shallow");

  // Summary
  const totalMinutes = tasks.reduce((s, t) => s + t.estimated_minutes, 0);
  const deepMinutesTotal = tasks.filter((t) => t.type === "deep").reduce((s, t) => s + t.estimated_minutes, 0);
  const shallowMinutesTotal = tasks.filter((t) => t.type === "shallow").reduce((s, t) => s + t.estimated_minutes, 0);
  const completedCount = tasks.filter((t) => t.completed).length;

  // Overcommitment bar
  const barPercent = overcommitment
    ? Math.min((overcommitment.committed_minutes / Math.max(overcommitment.available_minutes, 1)) * 100, 100)
    : 0;

  function goalTitle(gId: number | null): string | null {
    if (!gId) return null;
    return goals.find((g) => g.id === gId)?.title ?? null;
  }

  // Format date for header
  const dateObj = new Date(date + "T12:00:00");
  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
  const monthName = dateObj.toLocaleDateString("en-US", { month: "long" });
  const dayNum = dateObj.getDate();

  function TaskRow({ task }: { task: Task }) {
    const linked = goalTitle(task.goal_id);
    return (
      <div
        className={`flex items-center gap-3 py-3 border-b border-tempo-border group transition-opacity ${
          task.completed ? "opacity-40" : ""
        }`}
      >
        {/* Checkbox */}
        <button
          onClick={() => toggleCompleted(task)}
          className="flex-shrink-0 flex items-center justify-center border border-tempo-border hover:border-tempo-text transition-colors"
          style={{ width: "18px", height: "18px" }}
        >
          {!!task.completed && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        {/* Frog indicator */}
        {!!task.is_frog && (
          <span
            className="flex-shrink-0 bg-tempo-accent"
            style={{ width: "3px", height: "24px", borderRadius: "1px" }}
          />
        )}

        {/* Title */}
        <span className={`flex-1 font-body text-[15px] ${task.completed ? "line-through text-tempo-muted" : "text-tempo-text"}`}>
          {task.title}
        </span>

        {/* Tags */}
        <span className="font-ui text-tempo-muted" style={{ fontSize: "12px" }}>
          {formatMinutes(task.estimated_minutes)}
        </span>
        {linked && (
          <span
            className="font-ui bg-tempo-surface text-tempo-text px-2 py-0.5"
            style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {linked}
          </span>
        )}
        {!!task.urgent && (
          <span
            className="font-ui bg-tempo-accent text-white px-1.5 py-0.5"
            style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            U
          </span>
        )}
        {!!task.important && (
          <span
            className="font-ui bg-tempo-surface text-tempo-text px-1.5 py-0.5 border border-tempo-border"
            style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            I
          </span>
        )}

        {/* Delete */}
        <button
          onClick={() => deleteTask(task.id)}
          className="text-tempo-border hover:text-tempo-accent transition-colors opacity-0 group-hover:opacity-100"
          title="Delete task"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  function TaskGroup({ label, tasks: groupTasks }: { label: string; tasks: Task[] }) {
    if (groupTasks.length === 0) return null;
    return (
      <div className="mb-8">
        <h3
          className="font-ui font-medium text-tempo-muted mb-3"
          style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.12em" }}
        >
          {label}
        </h3>
        <div>
          {groupTasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "640px" }}>
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="font-accent text-tempo-muted" style={{ fontSize: "18px" }}>
            {dayName}, {monthName} {dayNum}
          </p>
          <h1 className="font-display text-tempo-text" style={{ fontSize: "36px", lineHeight: "1.1" }}>
            Daily Plan
          </h1>
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="font-ui text-sm text-tempo-muted bg-transparent border border-tempo-border px-3 py-1.5 focus:border-tempo-accent focus:outline-none transition-colors"
        />
      </div>

      {/* Overcommitment Bar */}
      {overcommitment && (
        <div className="border border-tempo-border p-5 mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="font-ui text-tempo-text" style={{ fontSize: "13px", fontWeight: 500 }}>
              {formatMinutes(overcommitment.committed_minutes)} / {formatMinutes(overcommitment.available_minutes)}
            </span>
            <span className="font-ui text-tempo-muted" style={{ fontSize: "13px" }}>
              {overcommitment.remaining_minutes >= 0
                ? formatMinutes(overcommitment.remaining_minutes) + " remaining"
                : formatMinutes(overcommitment.remaining_minutes) + " over"}
            </span>
          </div>
          {/* Bar */}
          <div className="relative w-full bg-tempo-surface" style={{ height: "6px" }}>
            <div
              className="absolute top-0 left-0 h-full bg-tempo-text transition-all duration-300"
              style={{ width: `${barPercent}%` }}
            />
            {/* Threshold marker at 100% */}
            <div
              className="absolute top-[-6px] bg-tempo-muted"
              style={{ width: "1.5px", height: "18px", left: "100%" }}
            />
          </div>
          <div className="flex justify-between mt-2">
            <span className="font-ui text-[11px] text-tempo-muted">
              {formatMinutes(overcommitment.committed_minutes)} committed
            </span>
            <span className="font-ui text-[11px] text-tempo-muted">
              {formatMinutes(overcommitment.available_minutes)} available
            </span>
          </div>
          <p className="font-ui text-[11px] text-tempo-muted mt-2">
            {overcommitment.deep_blocks} deep work block{overcommitment.deep_blocks !== 1 ? "s" : ""} available (2h+)
          </p>
        </div>
      )}

      {/* Add Task Form */}
      <form onSubmit={handleAddTask} className="border border-tempo-border p-5 mb-8 space-y-5">
        {/* Title */}
        <input
          type="text"
          placeholder="Task title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full font-body text-base border-b border-tempo-border bg-transparent px-0 py-2 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent focus:outline-none transition-colors"
        />

        {/* Type toggle */}
        <div className="flex items-center gap-3">
          <span className="font-ui text-[11px] font-medium uppercase text-tempo-muted w-12" style={{ letterSpacing: "0.08em" }}>Type</span>
          <button
            type="button"
            onClick={() => setType("deep")}
            className={`font-ui px-3 py-1.5 text-[12px] font-medium transition-colors ${
              type === "deep"
                ? "bg-tempo-text text-white"
                : "bg-tempo-surface text-tempo-muted hover:text-tempo-text"
            }`}
            style={{ letterSpacing: "0.04em" }}
          >
            Deep
          </button>
          <button
            type="button"
            onClick={() => setType("shallow")}
            className={`font-ui px-3 py-1.5 text-[12px] font-medium transition-colors ${
              type === "shallow"
                ? "bg-tempo-text text-white"
                : "bg-tempo-surface text-tempo-muted hover:text-tempo-text"
            }`}
            style={{ letterSpacing: "0.04em" }}
          >
            Shallow
          </button>
        </div>

        {/* Estimated minutes */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-ui text-[11px] font-medium uppercase text-tempo-muted w-12" style={{ letterSpacing: "0.08em" }}>Time</span>
          {PRESET_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setEstimatedMinutes(m);
                setCustomMinutes("");
              }}
              className={`font-ui px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                !customMinutes && estimatedMinutes === m
                  ? "bg-tempo-text text-white"
                  : "bg-tempo-surface text-tempo-muted hover:text-tempo-text"
              }`}
              style={{ letterSpacing: "0.04em" }}
            >
              {formatMinutes(m)}
            </button>
          ))}
          <input
            type="number"
            placeholder="Custom"
            value={customMinutes}
            onChange={(e) => setCustomMinutes(e.target.value)}
            min={1}
            className="w-20 font-ui text-[12px] border border-tempo-border bg-transparent px-2 py-1.5 text-tempo-text placeholder:text-tempo-muted focus:border-tempo-accent focus:outline-none transition-colors"
          />
        </div>

        {/* Goal link */}
        <div className="flex items-center gap-3">
          <span className="font-ui text-[11px] font-medium uppercase text-tempo-muted w-12" style={{ letterSpacing: "0.08em" }}>Goal</span>
          <select
            value={goalId ?? ""}
            onChange={(e) => setGoalId(e.target.value ? Number(e.target.value) : null)}
            className="font-ui text-[12px] border border-tempo-border bg-transparent px-2 py-1.5 text-tempo-text focus:border-tempo-accent focus:outline-none transition-colors"
          >
            <option value="">None</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>

        {/* Toggles row */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsFrog(!isFrog)}
            className={`font-ui px-3 py-1.5 text-[12px] font-medium transition-colors ${
              isFrog
                ? "bg-tempo-accent text-white"
                : "bg-tempo-surface text-tempo-muted hover:text-tempo-text"
            }`}
            style={{ letterSpacing: "0.04em" }}
          >
            Eat the Frog
          </button>
          <button
            type="button"
            onClick={() => setUrgent(!urgent)}
            className={`font-ui px-3 py-1.5 text-[12px] font-medium transition-colors ${
              urgent
                ? "bg-tempo-accent text-white"
                : "bg-tempo-surface text-tempo-muted hover:text-tempo-text"
            }`}
            style={{ letterSpacing: "0.04em" }}
          >
            Urgent
          </button>
          <button
            type="button"
            onClick={() => setImportant(!important)}
            className={`font-ui px-3 py-1.5 text-[12px] font-medium transition-colors ${
              important
                ? "bg-tempo-text text-white"
                : "bg-tempo-surface text-tempo-muted hover:text-tempo-text"
            }`}
            style={{ letterSpacing: "0.04em" }}
          >
            Important
          </button>
        </div>

        <button
          type="submit"
          className="w-full font-ui text-[13px] font-medium bg-tempo-text text-white py-2.5 hover:opacity-90 transition-opacity"
          style={{ letterSpacing: "0.04em" }}
        >
          Add Task
        </button>
      </form>

      {/* Task List */}
      {tasks.length === 0 ? (
        <div className="text-center py-12 font-body text-tempo-muted text-sm">No tasks planned for this day.</div>
      ) : (
        <div className="mb-8">
          <TaskGroup label="Eat the Frog" tasks={frogTasks} />
          <TaskGroup label="Deep Work" tasks={deepTasks} />
          <TaskGroup label="Shallow Work" tasks={shallowTasks} />
        </div>
      )}

      {/* Summary Footer */}
      {tasks.length > 0 && (
        <div className="border-t border-tempo-border pt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="font-display text-tempo-text" style={{ fontSize: "28px" }}>{formatMinutes(totalMinutes)}</div>
            <div className="font-ui text-[11px] text-tempo-muted uppercase" style={{ letterSpacing: "0.08em" }}>Total</div>
          </div>
          <div>
            <div className="font-display text-tempo-text" style={{ fontSize: "28px" }}>{formatMinutes(deepMinutesTotal)}</div>
            <div className="font-ui text-[11px] text-tempo-muted uppercase" style={{ letterSpacing: "0.08em" }}>Deep</div>
          </div>
          <div>
            <div className="font-display text-tempo-text" style={{ fontSize: "28px" }}>{formatMinutes(shallowMinutesTotal)}</div>
            <div className="font-ui text-[11px] text-tempo-muted uppercase" style={{ letterSpacing: "0.08em" }}>Shallow</div>
          </div>
          <div>
            <div className="font-display text-tempo-text" style={{ fontSize: "28px" }}>{completedCount}/{tasks.length}</div>
            <div className="font-ui text-[11px] text-tempo-muted uppercase" style={{ letterSpacing: "0.08em" }}>Done</div>
          </div>
        </div>
      )}
    </div>
  );
}
