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
  const deepMinutes = tasks.filter((t) => t.type === "deep").reduce((s, t) => s + t.estimated_minutes, 0);
  const shallowMinutes = tasks.filter((t) => t.type === "shallow").reduce((s, t) => s + t.estimated_minutes, 0);
  const completedCount = tasks.filter((t) => t.completed).length;

  // Overcommitment bar
  const barPercent = overcommitment
    ? Math.min((overcommitment.committed_minutes / Math.max(overcommitment.available_minutes, 1)) * 100, 100)
    : 0;

  const statusColors: Record<string, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    red: "bg-red-500",
  };

  function goalTitle(goalId: number | null): string | null {
    if (!goalId) return null;
    return goals.find((g) => g.id === goalId)?.title ?? null;
  }

  function TaskRow({ task }: { task: Task }) {
    const linked = goalTitle(task.goal_id);
    return (
      <div
        className={`flex items-center gap-3 py-2 px-3 rounded-md group hover:bg-zinc-50 transition-colors ${
          task.completed ? "opacity-50" : ""
        }`}
      >
        <input
          type="checkbox"
          checked={!!task.completed}
          onChange={() => toggleCompleted(task)}
          className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
        />
        <span className={`flex-1 text-sm ${task.completed ? "line-through text-zinc-400" : "text-zinc-900"}`}>
          {task.title}
        </span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
          {formatMinutes(task.estimated_minutes)}
        </span>
        {linked && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
            {linked}
          </span>
        )}
        {!!task.urgent && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">U</span>
        )}
        {!!task.important && (
          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">I</span>
        )}
        <button
          onClick={() => deleteTask(task.id)}
          className="text-zinc-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          title="Delete task"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  function TaskGroup({ label, tasks }: { label: string; tasks: Task[] }) {
    if (tasks.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2 px-3">{label}</h3>
        <div className="space-y-1">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Daily Plan</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Overcommitment Bar */}
      {overcommitment && (
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border border-zinc-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium text-zinc-700">
              {formatMinutes(overcommitment.committed_minutes)} / {formatMinutes(overcommitment.available_minutes)}
            </span>
            <span className="text-zinc-500">
              {overcommitment.remaining_minutes >= 0 ? formatMinutes(overcommitment.remaining_minutes) + " remaining" : formatMinutes(overcommitment.remaining_minutes) + " over"}
            </span>
          </div>
          <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${statusColors[overcommitment.status]}`}
              style={{ width: `${barPercent}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-zinc-400">
            {overcommitment.deep_blocks} deep work block{overcommitment.deep_blocks !== 1 ? "s" : ""} available (2h+)
          </div>
        </div>
      )}

      {/* Add Task Form */}
      <form onSubmit={handleAddTask} className="border border-zinc-200 rounded-lg p-4 mb-6 space-y-4">
        {/* Title */}
        <input
          type="text"
          placeholder="Task title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {/* Type toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 w-12">Type</span>
          <button
            type="button"
            onClick={() => setType("deep")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              type === "deep" ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Deep
          </button>
          <button
            type="button"
            onClick={() => setType("shallow")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              type === "shallow" ? "bg-zinc-700 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Shallow
          </button>
        </div>

        {/* Estimated minutes */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-zinc-500 w-12">Time</span>
          {PRESET_MINUTES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setEstimatedMinutes(m);
                setCustomMinutes("");
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                !customMinutes && estimatedMinutes === m
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
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
            className="w-20 border border-zinc-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Goal link */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 w-12">Goal</span>
          <select
            value={goalId ?? ""}
            onChange={(e) => setGoalId(e.target.value ? Number(e.target.value) : null)}
            className="border border-zinc-200 rounded-md px-2 py-1 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setIsFrog(!isFrog)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              isFrog ? "bg-green-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Eat the Frog
          </button>
          <button
            type="button"
            onClick={() => setUrgent(!urgent)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              urgent ? "bg-red-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Urgent
          </button>
          <button
            type="button"
            onClick={() => setImportant(!important)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              important ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            Important
          </button>
        </div>

        <button
          type="submit"
          className="w-full bg-indigo-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Add Task
        </button>
      </form>

      {/* Task List */}
      {tasks.length === 0 ? (
        <div className="text-center py-12 text-zinc-400 text-sm">No tasks planned for this day.</div>
      ) : (
        <div className="mb-6">
          <TaskGroup label="Eat the Frog" tasks={frogTasks} />
          <TaskGroup label="Deep Work" tasks={deepTasks} />
          <TaskGroup label="Shallow Work" tasks={shallowTasks} />
        </div>
      )}

      {/* Summary Footer */}
      {tasks.length > 0 && (
        <div className="border-t border-zinc-200 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-zinc-900">{formatMinutes(totalMinutes)}</div>
            <div className="text-xs text-zinc-400">Total estimated</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-indigo-600">{formatMinutes(deepMinutes)}</div>
            <div className="text-xs text-zinc-400">Deep work</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-zinc-600">{formatMinutes(shallowMinutes)}</div>
            <div className="text-xs text-zinc-400">Shallow work</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-zinc-900">
              {completedCount}/{tasks.length}
            </div>
            <div className="text-xs text-zinc-400">Completed</div>
          </div>
        </div>
      )}
    </div>
  );
}
