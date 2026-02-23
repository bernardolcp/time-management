import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date parameter is required' }, { status: 400 });
  }

  const db = getDb();
  const entry = db.prepare('SELECT * FROM daily_entries WHERE date = ?').get(date) || null;

  return NextResponse.json(entry);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { date, energy_level, focus_word, training, spiritual, family_day, content_creation } = body;

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO daily_entries (date, energy_level, focus_word, training, spiritual, family_day, content_creation)
    VALUES (@date, @energy_level, @focus_word, @training, @spiritual, @family_day, @content_creation)
    ON CONFLICT(date) DO UPDATE SET
      energy_level = @energy_level,
      focus_word = @focus_word,
      training = @training,
      spiritual = @spiritual,
      family_day = @family_day,
      content_creation = @content_creation
  `);

  stmt.run({
    date,
    energy_level: energy_level ?? 3,
    focus_word: focus_word ?? '',
    training: training ?? 0,
    spiritual: spiritual ?? 0,
    family_day: family_day ?? 0,
    content_creation: content_creation ?? 0,
  });

  const entry = db.prepare('SELECT * FROM daily_entries WHERE date = ?').get(date);

  return NextResponse.json(entry);
}
