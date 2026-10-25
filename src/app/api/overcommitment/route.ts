import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';

// Smart buffer defaults (minutes)
const LUNCH_BREAK = 60;          // 1h almoço (12:00-13:00)
const COMMUTE_BUFFER = 30;       // 15min ida + 15min volta universidade
const REACTIVE_BUFFER = 45;      // Buffer para responder msgs, imprevistos
const TRANSITION_PER_EVENT = 5;  // 5min de transição entre cada evento

export async function GET(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

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

    const parseNum = (val: string, fallback: number) => {
      const n = parseFloat(val);
      return isNaN(n) || val.trim() === '' ? fallback : n;
    };

    // Derive default available hours from work window
    const workStartStr = getSetting('work_start', '08:00');
    const workEndStr = getSetting('work_end', '18:00');
    const [wsH, wsM] = workStartStr.split(':').map(Number);
    const [weH, weM] = workEndStr.split(':').map(Number);
    const workWindowHours = (weH * 60 + weM - wsH * 60 - wsM) / 60;
    const defaultAvailableHours = workWindowHours > 0 ? workWindowHours : 8;

    const availableHoursMinutes = parseNum(getSetting('available_hours', ''), defaultAvailableHours) * 60;
    const lunchBreak = parseNum(getSetting('lunch_break', String(LUNCH_BREAK)), LUNCH_BREAK);
    const commuteBuffer = parseNum(getSetting('commute_buffer', String(COMMUTE_BUFFER)), COMMUTE_BUFFER);
    const reactiveBuffer = parseNum(getSetting('reactive_buffer', String(REACTIVE_BUFFER)), REACTIVE_BUFFER);

    // 2. Get calendar events for the date
    const events = db.prepare(
      'SELECT start_time, end_time, title FROM calendar_events WHERE date = ? AND all_day = 0'
    ).all(date) as { start_time: string; end_time: string; title: string }[];

    // Clamp events to work-day boundaries so multi-day events don't blow up the count
    const dayStart = new Date(`${date}T${workStartStr}:00`).getTime();
    const dayEnd = new Date(`${date}T${workEndStr}:00`).getTime();

    // For today: only count time from NOW forward (past hours are gone)
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const isToday = date === today;
    const effectiveStart = isToday ? Math.max(now, dayStart) : dayStart;

    // If we're past work_end, no time left
    const effectiveAvailable = isToday
      ? Math.max(0, (dayEnd - effectiveStart) / 60000)
      : availableHoursMinutes;

    let calendarMinutes = 0;
    for (const event of events) {
      const start = Math.max(new Date(event.start_time).getTime(), effectiveStart);
      const end = Math.min(new Date(event.end_time).getTime(), dayEnd);
      if (end > start) {
        calendarMinutes += (end - start) / 60000;
      }
    }

    // 3. Smart buffer: check if lunch is already in calendar
    const lunchAlreadyInCalendar = events.some(e => {
      const title = (e.title || '').toLowerCase();
      const startHour = new Date(e.start_time).getHours();
      return (title.includes('almoço') || title.includes('almoco') || title.includes('lunch'))
        || (startHour >= 11 && startHour <= 13 && !title.includes('meeting'));
    });

    // 4. Calculate total overhead — skip past buffers if today
    const futureEvents = events.filter(e => new Date(e.end_time).getTime() > effectiveStart);
    const transitionMinutes = futureEvents.length * TRANSITION_PER_EVENT;

    // Skip lunch buffer if it's already past lunch time
    const lunchPast = isToday && now > new Date(`${date}T13:00:00`).getTime();
    const lunchOverhead = (lunchAlreadyInCalendar || lunchPast) ? 0 : lunchBreak;

    // Scale reactive buffer proportionally to remaining work time
    const fullDayMinutes = (dayEnd - dayStart) / 60000;
    const scaledReactive = isToday
      ? Math.round(reactiveBuffer * (effectiveAvailable / fullDayMinutes))
      : reactiveBuffer;

    const totalOverhead = lunchOverhead + commuteBuffer + scaledReactive + transitionMinutes;

    // 5. Net available minutes
    const grossAvailable = effectiveAvailable - calendarMinutes;
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

    const workStart = effectiveStart;
    const workEnd = dayEnd;
    const lunchStart = new Date(`${date}T12:00:00`).getTime();
    const lunchEnd = new Date(`${date}T13:00:00`).getTime();

    // Inject lunch as a virtual event if not in calendar — clamp to work boundaries
    const allBlockers = [...sortedEvents.map(e => ({
      start: Math.max(new Date(e.start_time).getTime(), workStart),
      end: Math.min(new Date(e.end_time).getTime(), workEnd),
    }))].filter(b => b.end > b.start);

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
      is_today: isToday,
      breakdown: {
        gross_hours: effectiveAvailable,
        calendar_events: calendarMinutes,
        lunch: lunchOverhead,
        commute: commuteBuffer,
        reactive_buffer: scaledReactive,
        transitions: transitionMinutes,
        net_available: netAvailable,
      },
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to calculate overcommitment' }, { status: 500 });
  }
}
