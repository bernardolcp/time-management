import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET() {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const today = formatDate(new Date());

    const behaviors = db
      .prepare("SELECT * FROM behaviors ORDER BY sort_order ASC")
      .all() as { id: number; title: string; goal_id: number | null; frequency: string }[];

    // Today's logs
    const todayLogs = db
      .prepare("SELECT behavior_id, done FROM behavior_logs WHERE date = ?")
      .all(today) as { behavior_id: number; done: number }[];
    const todayMap = new Map(todayLogs.map((l) => [l.behavior_id, l.done === 1]));

    // All logs for streak calculation (last 90 days)
    const start = new Date();
    start.setDate(start.getDate() - 90);

    const allLogs = db
      .prepare(
        "SELECT behavior_id, date, done FROM behavior_logs WHERE date >= ? AND date <= ? ORDER BY date DESC"
      )
      .all(formatDate(start), today) as { behavior_id: number; date: string; done: number }[];

    // Group by behavior
    const logsByBehavior = new Map<number, Map<string, boolean>>();
    for (const log of allLogs) {
      if (!logsByBehavior.has(log.behavior_id)) {
        logsByBehavior.set(log.behavior_id, new Map());
      }
      logsByBehavior.get(log.behavior_id)!.set(log.date, log.done === 1);
    }

    const calcStreak = (behaviorId: number): number => {
      const logs = logsByBehavior.get(behaviorId);
      if (!logs) return 0;

      let streak = 0;
      const d = new Date(today + "T12:00:00");

      // If today is done, count it
      if (logs.get(today)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        // Today not done yet, start from yesterday
        d.setDate(d.getDate() - 1);
      }

      for (let i = 0; i < 90; i++) {
        const dateStr = formatDate(d);
        if (logs.get(dateStr)) {
          streak++;
        } else {
          break;
        }
        d.setDate(d.getDate() - 1);
      }

      return streak;
    }

    const result = behaviors.map((b) => ({
      id: b.id,
      title: b.title,
      goal_id: b.goal_id,
      frequency: b.frequency,
      today_done: todayMap.get(b.id) ?? false,
      streak: calcStreak(b.id),
    }));

    return NextResponse.json(result);
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to fetch behaviors" },
      { status: 500 }
    );
  }
}
