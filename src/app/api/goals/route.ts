import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';

export async function GET() {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const goals = db.prepare('SELECT * FROM goals ORDER BY sort_order ASC').all();
    return NextResponse.json(goals);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const body = await request.json();
    const { title, area, unit, q1_target, q2_target, q3_target, q4_target, sort_order } = body;

    const result = db.prepare(`
      INSERT INTO goals (title, area, unit, q1_target, q2_target, q3_target, q4_target, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, area, unit ?? '', q1_target ?? 0, q2_target ?? 0, q3_target ?? 0, q4_target ?? 0, sort_order ?? 0);

    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(goal, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}
