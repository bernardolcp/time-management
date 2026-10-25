import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  const date = request.nextUrl.searchParams.get('date');

  if (!date) {
    return NextResponse.json({ error: 'date parameter is required' }, { status: 400 });
  }

  const db = getDb();
  const entry = db.prepare('SELECT * FROM daily_entries WHERE date = ?').get(date) || null;

  return NextResponse.json(entry);
}

// Mapping: daily_entry habit field → goal area
const HABIT_GOAL_MAP: Record<string, string> = {
  training: 'Saúde',
  spiritual: 'Espiritual',
  family_day: 'Família',
  content_creation: 'Criativo',
};

function getCurrentQuarterKey(): string {
  const month = new Date().getMonth();
  if (month < 3) return 'q1';
  if (month < 6) return 'q2';
  if (month < 9) return 'q3';
  return 'q4';
}

export async function POST(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const { date, energy_level, focus_word, training, spiritual, family_day, content_creation } = body;

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 });
  }

  const db = getDb();

  const newValues = {
    training: training ? 1 : 0,
    spiritual: spiritual ? 1 : 0,
    family_day: family_day ? 1 : 0,
    content_creation: content_creation ? 1 : 0,
  };

  // Get previous entry to detect habit changes
  const prev = db.prepare('SELECT training, spiritual, family_day, content_creation FROM daily_entries WHERE date = ?')
    .get(date) as { training: number; spiritual: number; family_day: number; content_creation: number } | undefined;

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
    ...newValues,
  });

  // Auto-update goal actuals when habits change
  const qKey = getCurrentQuarterKey();
  const actualCol = `${qKey}_actual`;

  for (const [field, area] of Object.entries(HABIT_GOAL_MAP)) {
    const oldVal = prev ? (prev[field as keyof typeof prev] || 0) : 0;
    const newVal = newValues[field as keyof typeof newValues];

    if (newVal === 1 && oldVal === 0) {
      // Habit checked → increment goal
      db.prepare(`UPDATE goals SET ${actualCol} = ${actualCol} + 1 WHERE area = ?`).run(area);
    } else if (newVal === 0 && oldVal === 1) {
      // Habit unchecked → decrement goal
      db.prepare(`UPDATE goals SET ${actualCol} = MAX(0, ${actualCol} - 1) WHERE area = ?`).run(area);
    }
  }

  const entry = db.prepare('SELECT * FROM daily_entries WHERE date = ?').get(date);

  return NextResponse.json(entry);
}
