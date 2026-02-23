"use client";

import { useState, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

interface Settings {
  chronotype: string;
  work_start: string;
  work_end: string;
  deep_work_start: string;
  deep_work_end: string;
  available_hours: string;
  lunch_break: string;
  commute_buffer: string;
  reactive_buffer: string;
}

const defaultSettings: Settings = {
  chronotype: "morning",
  work_start: "08:00",
  work_end: "18:00",
  deep_work_start: "09:00",
  deep_work_end: "12:00",
  available_hours: "8",
  lunch_break: "60",
  commute_buffer: "30",
  reactive_buffer: "45",
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings({
          chronotype: data.chronotype ?? defaultSettings.chronotype,
          work_start: data.work_start ?? defaultSettings.work_start,
          work_end: data.work_end ?? defaultSettings.work_end,
          deep_work_start: data.deep_work_start ?? defaultSettings.deep_work_start,
          deep_work_end: data.deep_work_end ?? defaultSettings.deep_work_end,
          available_hours: data.available_hours ?? defaultSettings.available_hours,
          lunch_break: data.lunch_break ?? defaultSettings.lunch_break,
          commute_buffer: data.commute_buffer ?? defaultSettings.commute_buffer,
          reactive_buffer: data.reactive_buffer ?? defaultSettings.reactive_buffer,
        });
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncResult(`Error: ${data.error}`);
      } else {
        setSyncResult(`Synced ${data.synced} events`);
      }
    } catch (_error) {
      setSyncResult("Failed to sync");
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 3000);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-zinc-900 mb-8">Settings</h1>
        <p className="text-sm text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">Saved!</span>
        )}
      </div>

      <div className="space-y-6">
        {/* Chronotype */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Chronotype
          </label>
          <select
            value={settings.chronotype}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, chronotype: e.target.value }))
            }
            className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 bg-white focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          >
            <option value="morning">Morning</option>
            <option value="evening">Evening</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>

        {/* Work Hours */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Work hours
          </label>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={settings.work_start}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, work_start: e.target.value }))
              }
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
            <span className="text-sm text-zinc-500">to</span>
            <input
              type="time"
              value={settings.work_end}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, work_end: e.target.value }))
              }
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
          </div>
        </div>

        {/* Deep Work Window */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Deep work window
          </label>
          <div className="flex items-center gap-3">
            <input
              type="time"
              value={settings.deep_work_start}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  deep_work_start: e.target.value,
                }))
              }
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
            <span className="text-sm text-zinc-500">to</span>
            <input
              type="time"
              value={settings.deep_work_end}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  deep_work_end: e.target.value,
                }))
              }
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
            />
          </div>
        </div>

        {/* Available Hours Per Day */}
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-2">
            Available hours per day
          </label>
          <input
            type="number"
            value={settings.available_hours}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                available_hours: e.target.value,
              }))
            }
            min={0}
            max={24}
            step={0.5}
            className="w-32 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          />
        </div>

        {/* Smart Buffers */}
        <div className="mt-10 rounded-lg border border-zinc-200 bg-zinc-50 p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-4">
            Smart Buffers (minutos)
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-600">Almoço</label>
              <input
                type="number"
                value={settings.lunch_break}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    lunch_break: e.target.value,
                  }))
                }
                min={0}
                max={120}
                step={5}
                className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 text-right focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-600">Deslocamento universidade</label>
              <input
                type="number"
                value={settings.commute_buffer}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    commute_buffer: e.target.value,
                  }))
                }
                min={0}
                max={120}
                step={5}
                className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 text-right focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-600">Buffer reativo (msgs, imprevistos)</label>
              <input
                type="number"
                value={settings.reactive_buffer}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    reactive_buffer: e.target.value,
                  }))
                }
                min={0}
                max={120}
                step={5}
                className="w-24 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 text-right focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-zinc-400 mt-2">
              O sistema deduz automaticamente esses tempos do cálculo de overcommitment. Se o almoço já estiver na agenda, não deduz duas vezes.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div>
          <button
            onClick={handleSave}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
          >
            Save
          </button>
        </div>

        {/* Google Calendar Integration */}
        <div className="mt-10 rounded-lg border border-zinc-200 bg-zinc-50 p-6">
          <h2 className="text-sm font-semibold text-zinc-700 mb-3">
            Google Calendar
          </h2>
          {session ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                  Connected
                </span>
                <span className="text-sm text-zinc-500">
                  {session.user?.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-xs text-red-500 hover:text-red-700 underline"
                >
                  Disconnect
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {syncing ? "Syncing..." : "Sync Now"}
                </button>
                {syncResult && (
                  <span className="text-sm text-zinc-600">{syncResult}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-zinc-500">
                Connect your Google Calendar to auto-detect your available hours.
              </p>
              <button
                onClick={() => signIn("google")}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
              >
                Connect Google Calendar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
