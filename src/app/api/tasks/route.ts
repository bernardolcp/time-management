import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const date = request.nextUrl.searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'date query param is required' }, { status: 400 });
    }

    const tasks = db.prepare(
      'SELECT * FROM tasks WHERE date = ? ORDER BY is_frog DESC, sort_order ASC'
    ).all(date);

    return NextResponse.json(tasks);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const body = await request.json();
    const { date, title, type, estimated_minutes, goal_id, project_id, is_frog, urgent, important } = body;

    const result = db.prepare(`
      INSERT INTO tasks (date, title, type, estimated_minutes, goal_id, project_id, is_frog, urgent, important)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      date,
      title,
      type ?? 'shallow',
      estimated_minutes ?? 30,
      goal_id ?? null,
      project_id ?? null,
      is_frog ?? 0,
      urgent ?? 0,
      important ?? 0
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(task, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }
}
