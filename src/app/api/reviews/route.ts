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

    const review = db.prepare(
      'SELECT * FROM weekly_reviews WHERE week_start = ?'
    ).get(weekStart) as Record<string, unknown> | undefined;

    if (review) {
      return NextResponse.json(review);
    }

    return NextResponse.json({
      week_start: weekStart,
      wins: '',
      didnt_work: '',
      deep_work_hours: 0,
      notes: '',
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch review' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const body = await request.json();
    const { week_start, wins, didnt_work, deep_work_hours, notes } = body;

    if (!week_start) {
      return NextResponse.json({ error: 'week_start is required' }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO weekly_reviews (week_start, wins, didnt_work, deep_work_hours, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(week_start) DO UPDATE SET
        wins = excluded.wins,
        didnt_work = excluded.didnt_work,
        deep_work_hours = excluded.deep_work_hours,
        notes = excluded.notes
    `).run(
      week_start,
      wins ?? '',
      didnt_work ?? '',
      deep_work_hours ?? 0,
      notes ?? ''
    );

    const review = db.prepare('SELECT * FROM weekly_reviews WHERE week_start = ?').get(week_start);
    return NextResponse.json(review);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to save review' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const body = await request.json();
    const { week_start, wins, didnt_work, deep_work_hours, notes } = body;

    if (!week_start) {
      return NextResponse.json({ error: 'week_start is required' }, { status: 400 });
    }

    db.prepare(`
      INSERT INTO weekly_reviews (week_start, wins, didnt_work, deep_work_hours, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(week_start) DO UPDATE SET
        wins = excluded.wins,
        didnt_work = excluded.didnt_work,
        deep_work_hours = excluded.deep_work_hours,
        notes = excluded.notes
    `).run(
      week_start,
      wins ?? '',
      didnt_work ?? '',
      deep_work_hours ?? 0,
      notes ?? ''
    );

    const review = db.prepare('SELECT * FROM weekly_reviews WHERE week_start = ?').get(week_start);
    return NextResponse.json(review);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to update review' }, { status: 500 });
  }
}
