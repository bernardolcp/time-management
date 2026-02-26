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

    // If available_hours is blank/invalid, derive from work_start/work_end
    const workStartStr = getSetting('work_start', '08:00');
    const workEndStr = getSetting('work_end', '18:00');
    const availableRaw = parseFloat(getSetting('available_hours', ''));
    const availableHoursMinutes = isNaN(availableRaw) || availableRaw <= 0
      ? (parseHHMM(workEndStr) - parseHHMM(workStartStr))
      : availableRaw * 60;
    const lunchBreak = parseInt(getSetting('lunch_break', String(LUNCH_BREAK)));
    const commuteBuffer = parseInt(getSetting('commute_buffer', String(COMMUTE_BUFFER)));
    const reactiveBuffer = parseInt(getSetting('reactive_buffer', String(REACTIVE_BUFFER)));

    // 2. Get calendar events for the date
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

    let calendarMinutes = 0;
    for (const m of merged) {
      calendarMinutes += (m.end - m.start) / 60000;
    }

    // 3. Smart buffer: check if lunch is already in calendar
    const lunchAlreadyInCalendar = events.some(e => {
      const title = (e.title || '').toLowerCase();
      const startHour = new Date(e.start_time).getHours();
      return (title.includes('almoço') || title.includes('almoco') || title.includes('lunch'))
        || (startHour >= 11 && startHour <= 13 && !title.includes('meeting'));
    });

    // 4. Calculate total overhead
    const transitionMinutes = events.length * TRANSITION_PER_EVENT;
    const totalOverhead = (lunchAlreadyInCalendar ? 0 : lunchBreak)
      + commuteBuffer
      + reactiveBuffer
      + transitionMinutes;

    // 5. Net available minutes
    const grossAvailable = availableHoursMinutes - calendarMinutes;
    const netAvailable = grossAvailable - totalOverhead;

    // 6. Get incomplete tasks, sum estimated_minutes
    const tasks = db.prepare(
      'SELECT estimated_minutes FROM tasks WHERE date = ? AND completed = 0'
    ).all(date) as { estimated_minutes: number }[];

    let taskMinutes = 0;
    for (const task of tasks) {
      taskMinutes += task.estimated_minutes || 0;
    }

    // 7. Remaining minutes
    const remainingMinutes = netAvailable - taskMinutes;

    // 8. Status
    let status: 'green' | 'yellow' | 'red';
    if (remainingMinutes >= 60) {
      status = 'green';
    } else if (remainingMinutes >= 0) {
      status = 'yellow';
    } else {
      status = 'red';
    }

    // 9. Deep blocks: count free blocks of 2h+ between events
    const sortedEvents = [...events].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    const workStart = new Date(`${date}T${getSetting('work_start', '08:00')}:00`).getTime();
    const workEnd = new Date(`${date}T${getSetting('work_end', '18:00')}:00`).getTime();
    const lunchStart = new Date(`${date}T12:00:00`).getTime();
    const lunchEnd = new Date(`${date}T13:00:00`).getTime();

    // Inject lunch as a virtual event if not in calendar
    const allBlockers = [...sortedEvents.map(e => ({
      start: new Date(e.start_time).getTime(),
      end: new Date(e.end_time).getTime(),
    }))];

    if (!lunchAlreadyInCalendar) {
      allBlockers.push({ start: lunchStart, end: lunchEnd });
      allBlockers.sort((a, b) => a.start - b.start);
    }

    let deepBlocks = 0;
    let cursor = workStart;

    for (const block of allBlockers) {
      if (block.start > cursor) {
        const gap = (Math.min(block.start, workEnd) - cursor) / 60000;
        if (gap >= 120) deepBlocks++;
      }
      cursor = Math.max(cursor, block.end);
    }

    if (cursor < workEnd) {
      const gap = (workEnd - cursor) / 60000;
      if (gap >= 120) deepBlocks++;
    }

    return NextResponse.json({
      status,
      available_minutes: netAvailable,
      committed_minutes: taskMinutes,
      remaining_minutes: remainingMinutes,
      deep_blocks: deepBlocks,
      breakdown: {
        gross_hours: availableHoursMinutes,
        calendar_events: calendarMinutes,
        lunch: lunchAlreadyInCalendar ? 0 : lunchBreak,
        commute: commuteBuffer,
        reactive_buffer: reactiveBuffer,
        transitions: transitionMinutes,
        net_available: netAvailable,
      },
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to calculate overcommitment' }, { status: 500 });
  }
}
