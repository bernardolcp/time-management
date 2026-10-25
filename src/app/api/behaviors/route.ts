import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const weekStart = request.nextUrl.searchParams.get('week_start');

    if (!weekStart) {
      return NextResponse.json({ error: 'week_start query param is required' }, { status: 400 });
    }

    const behaviors = db.prepare('SELECT * FROM behaviors ORDER BY sort_order ASC').all() as any[];

    // Generate 7 dates starting from week_start
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart + 'T00:00:00');
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const logs = db.prepare(`
      SELECT * FROM behavior_logs
      WHERE date >= ? AND date <= ?
    `).all(dates[0], dates[6]) as any[];

    const logMap = new Map<string, any>();
    for (const log of logs) {
      logMap.set(`${log.behavior_id}-${log.date}`, log);
    }

    const result = behaviors.map((b) => ({
      ...b,
      logs: dates.map((date) => {
        const existing = logMap.get(`${b.id}-${date}`);
        return {
          date,
          done: existing ? existing.done : 0,
        };
      }),
    }));

    return NextResponse.json(result);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch behaviors' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const body = await request.json();
    const { title, goal_id, frequency } = body;

    const result = db.prepare(`
      INSERT INTO behaviors (title, goal_id, frequency)
      VALUES (?, ?, ?)
    `).run(title, goal_id ?? null, frequency ?? 'daily');

    const behavior = db.prepare('SELECT * FROM behaviors WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(behavior, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create behavior' }, { status: 500 });
  }
}
