import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// Smart buffer defaults (minutes)
const LUNCH_BREAK = 60;          // 1h almoço (12:00-13:00)
const COMMUTE_BUFFER = 30;       // 15min ida + 15min volta universidade
const REACTIVE_BUFFER = 45;      // Buffer para responder msgs, imprevistos
const TRANSITION_PER_EVENT = 5;  // 5min de transição entre cada evento

// Convert "HH:MM" to minutes since midnight
function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Get current time as minutes since midnight (local time)
function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

// Check if a date string matches today (local time)
function isToday(dateStr: string): boolean {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return dateStr === today;
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const date = request.nextUrl.searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'date query param is required' }, { status: 400 });
    }

    // 1. Get settings
    const getSetting = (key: string, fallback: string) => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? fallback;
    };

    const workStartStr = getSetting('work_start', '08:00');
    const workEndStr = getSetting('work_end', '18:00');
    const workStartMin = parseHHMM(workStartStr);
    const workEndMin = parseHHMM(workEndStr);

    const availableRaw = parseFloat(getSetting('available_hours', ''));
    const fullDayMinutes = isNaN(availableRaw) || availableRaw <= 0
      ? (workEndMin - workStartMin)
      : availableRaw * 60;

    const lunchBreak = parseInt(getSetting('lunch_break', String(LUNCH_BREAK)));
    const commuteBuffer = parseInt(getSetting('commute_buffer', String(COMMUTE_BUFFER)));
    const reactiveBuffer = parseInt(getSetting('reactive_buffer', String(REACTIVE_BUFFER)));

    // 2. Time-aware gross available
    const today = isToday(date);
    const now = nowMinutes();
    const dayOver = today && now >= workEndMin;

    // If work day is over, return end-of-day summary
    if (dayOver) {
      const tasks = db.prepare(
        'SELECT estimated_minutes, completed FROM tasks WHERE date = ?'
      ).all(date) as { estimated_minutes: number; completed: number }[];
      let taskMinutes = 0;
      let completedMinutes = 0;
      for (const t of tasks) {
        taskMinutes += t.estimated_minutes || 0;
        if (t.completed) completedMinutes += t.estimated_minutes || 0;
      }

      return NextResponse.json({
        status: 'done' as const,
        available_minutes: 0,
        committed_minutes: taskMinutes,
        completed_minutes: completedMinutes,
        remaining_minutes: 0,
        deep_blocks: 0,
        breakdown: {
          gross_hours: 0, calendar_events: 0, lunch: 0,
          commute: 0, reactive_buffer: 0, transitions: 0, net_available: 0,
        },
      });
    }

    const dayInProgress = today && now >= workStartMin && now < workEndMin;
    const effectiveStart = dayInProgress ? now : workStartMin;
    const grossAvailableMinutes = dayInProgress
      ? (workEndMin - now)
      : (workEndMin - workStartMin);

    // Scale buffers proportionally to remaining day fraction
    const dayFraction = (dayOver || fullDayMinutes <= 0) ? 0 : grossAvailableMinutes / fullDayMinutes;

    // 3. Get calendar events for the date
    const events = db.prepare(
      'SELECT start_time, end_time, title FROM calendar_events WHERE date = ? AND all_day = 0'
    ).all(date) as { start_time: string; end_time: string; title: string }[];

    // Merge overlapping events before summing time
    const intervals = events
      .map(e => ({ start: new Date(e.start_time).getTime(), end: new Date(e.end_time).getTime() }))
      .sort((a, b) => a.start - b.start);

    const merged: { start: number; end: number }[] = [];
    for (const iv of intervals) {
      const last = merged[merged.length - 1];
      if (last && iv.start < last.end) {
        last.end = Math.max(last.end, iv.end);
      } else {
        merged.push({ ...iv });
      }
    }

    // Only count FUTURE event time (if today, ignore already-passed portions)
    const effectiveStartMs = new Date(`${date}T${String(Math.floor(effectiveStart / 60)).padStart(2, '0')}:${String(effectiveStart % 60).padStart(2, '0')}:00`).getTime();
    const workEndMs = new Date(`${date}T${workEndStr}:00`).getTime();

    let calendarMinutes = 0;
    let futureEvents = 0;
    for (const m of merged) {
      // Clamp event to [effectiveStart, workEnd] window
      const clampedStart = Math.max(m.start, effectiveStartMs);
      const clampedEnd = Math.min(m.end, workEndMs);
      if (clampedStart < clampedEnd) {
        calendarMinutes += (clampedEnd - clampedStart) / 60000;
        futureEvents++;
      }
    }

    // 4. Smart buffer: check if lunch is already in calendar
    const lunchAlreadyInCalendar = events.some(e => {
      const title = (e.title || '').toLowerCase();
      const startHour = new Date(e.start_time).getHours();
      return (title.includes('almoço') || title.includes('almoco') || title.includes('lunch'))
        || (startHour >= 11 && startHour <= 13 && !title.includes('meeting'));
    });

    // 5. Calculate overhead — scale buffers if day is partially gone
    const lunchMin = dayInProgress && now >= parseHHMM('13:00') ? 0 : (lunchAlreadyInCalendar ? 0 : lunchBreak);
    const transitionMinutes = futureEvents * TRANSITION_PER_EVENT;
    const scaledReactive = Math.round(reactiveBuffer * dayFraction);
    const scaledCommute = dayInProgress && now > workStartMin + 30 ? 0 : commuteBuffer; // skip commute if already at work

    const totalOverhead = lunchMin + scaledCommute + scaledReactive + transitionMinutes;

    // 6. Net available minutes
    const netAvailable = Math.max(0, grossAvailableMinutes - calendarMinutes - totalOverhead);

    // 7. Get tasks for the day — only PENDING tasks count as committed
    const tasks = db.prepare(
      'SELECT estimated_minutes, completed FROM tasks WHERE date = ?'
    ).all(date) as { estimated_minutes: number; completed: number }[];

    let taskMinutes = 0;
    let completedMinutes = 0;
    for (const task of tasks) {
      const mins = task.estimated_minutes || 0;
      if (task.completed) {
        completedMinutes += mins;
      } else {
        taskMinutes += mins;
      }
    }

    // 8. Remaining minutes (only pending tasks consume remaining time)
    const remainingMinutes = netAvailable - taskMinutes;

    // 9. Status
    let status: 'green' | 'yellow' | 'red';
    if (remainingMinutes >= 60) {
      status = 'green';
    } else if (remainingMinutes >= 0) {
      status = 'yellow';
    } else {
      status = 'red';
    }

    // 10. Deep blocks: count free blocks of 2h+ between FUTURE events
    const workStartMs2 = new Date(`${date}T${workStartStr}:00`).getTime();
    const cursorStart = dayInProgress ? Math.max(effectiveStartMs, workStartMs2) : workStartMs2;
    const lunchStartMs = new Date(`${date}T12:00:00`).getTime();
    const lunchEndMs = new Date(`${date}T13:00:00`).getTime();

    const allBlockers = merged
      .filter(m => m.end > cursorStart && m.start < workEndMs)
      .map(m => ({ start: Math.max(m.start, cursorStart), end: Math.min(m.end, workEndMs) }));

    if (!lunchAlreadyInCalendar && lunchMin > 0 && lunchEndMs > cursorStart) {
      allBlockers.push({ start: Math.max(lunchStartMs, cursorStart), end: lunchEndMs });
      allBlockers.sort((a, b) => a.start - b.start);
    }

    let deepBlocks = 0;
    let cursor = cursorStart;

    for (const block of allBlockers) {
      if (block.start > cursor) {
        const gap = (block.start - cursor) / 60000;
        if (gap >= 120) deepBlocks++;
      }
      cursor = Math.max(cursor, block.end);
    }

    if (cursor < workEndMs) {
      const gap = (workEndMs - cursor) / 60000;
      if (gap >= 120) deepBlocks++;
    }

    return NextResponse.json({
      status,
      available_minutes: netAvailable,
      committed_minutes: taskMinutes,
      completed_minutes: completedMinutes,
      remaining_minutes: remainingMinutes,
      deep_blocks: deepBlocks,
      breakdown: {
        gross_hours: grossAvailableMinutes,
        calendar_events: Math.round(calendarMinutes),
        lunch: lunchMin,
        commute: scaledCommute,
        reactive_buffer: scaledReactive,
        transitions: transitionMinutes,
        net_available: netAvailable,
      },
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to calculate overcommitment' }, { status: 500 });
  }
}
