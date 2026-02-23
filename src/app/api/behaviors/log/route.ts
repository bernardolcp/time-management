import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const { behavior_id, date } = await request.json();

    if (!behavior_id || !date) {
      return NextResponse.json({ error: 'behavior_id and date are required' }, { status: 400 });
    }

    const existing = db.prepare(
      'SELECT * FROM behavior_logs WHERE behavior_id = ? AND date = ?'
    ).get(behavior_id, date) as any;

    if (existing && existing.done === 1) {
      db.prepare('UPDATE behavior_logs SET done = 0 WHERE id = ?').run(existing.id);
      return NextResponse.json({ behavior_id, date, done: 0 });
    } else {
      db.prepare(`
        INSERT INTO behavior_logs (behavior_id, date, done)
        VALUES (?, ?, 1)
        ON CONFLICT(behavior_id, date) DO UPDATE SET done = 1
      `).run(behavior_id, date);
      return NextResponse.json({ behavior_id, date, done: 1 });
    }
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to toggle behavior log' }, { status: 500 });
  }
}
