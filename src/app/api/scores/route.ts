import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// --- Types ---

interface TaskRow {
  id: number;
  date: string;
  title: string;
  type: 'deep' | 'shallow';
  estimated_minutes: number;
  completed: number;
  is_frog: number;
  goal_id: number | null;
}

interface GoalRow {
  id: number;
  title: string;
  area: string;
  unit: string;
  q1_target: number;
  q1_actual: number;
  q2_target: number;
  q2_actual: number;
  q3_target: number;
  q3_actual: number;
  q4_target: number;
  q4_actual: number;
}

interface DailyEntryRow {
  training: number;
  spiritual: number;
  content_creation: number;
}

interface CountRow {
  count: number;
}

interface SumRow {
  total: number;
}

// --- Helpers ---

function getQuarterInfo(dateStr: string): { qKey: 'q1' | 'q2' | 'q3' | 'q4'; startDate: string; endDate: string; totalDays: number; elapsedDays: number } {
  const d = new Date(dateStr + 'T00:00:00');
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed

  let qKey: 'q1' | 'q2' | 'q3' | 'q4';
  let startDate: string;
  let endDate: string;

  if (month < 3) {
    qKey = 'q1';
    startDate = `${year}-01-01`;
    endDate = `${year}-03-31`;
  } else if (month < 6) {
    qKey = 'q2';
    startDate = `${year}-04-01`;
    endDate = `${year}-06-30`;
  } else if (month < 9) {
    qKey = 'q3';
    startDate = `${year}-07-01`;
    endDate = `${year}-09-30`;
  } else {
    qKey = 'q4';
    startDate = `${year}-10-01`;
    endDate = `${year}-12-31`;
  }

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const elapsedDays = Math.max(1, Math.round((d.getTime() - start.getTime()) / 86400000) + 1);

  return { qKey, startDate, endDate, totalDays, elapsedDays };
}

function calculateDailyScore(
  tasks: TaskRow[],
  dailyEntry: DailyEntryRow | null
): number {
  if (tasks.length === 0) return 0;

  // Completion rate (40%)
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const completionRate = totalTasks > 0 ? completedTasks / totalTasks : 0;
  const completionScore = completionRate * 40;

  // Deep work (30%) - sum of completed deep task minutes / 120 min target
  const deepWorkMinutes = tasks
    .filter(t => t.type === 'deep' && t.completed)
    .reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);
  const deepWorkRatio = Math.min(deepWorkMinutes / 120, 1);
  const deepWorkScore = deepWorkRatio * 30;

  // Frog eaten (15%)
  const hasFrog = tasks.some(t => t.is_frog);
  const frogEaten = tasks.some(t => t.is_frog && t.completed);
  const frogScore = hasFrog ? (frogEaten ? 15 : 0) : 0;

  // Habits (15%) - check daily_entry habits vs completed habit tasks
  let habitsScore = 0;
  if (dailyEntry) {
    const habitFields = [dailyEntry.training, dailyEntry.spiritual, dailyEntry.content_creation];
    const totalHabits = habitFields.length;
    const completedHabits = habitFields.filter(h => h === 1).length;
    habitsScore = totalHabits > 0 ? (completedHabits / totalHabits) * 15 : 0;
  }

  return Math.round(completionScore + deepWorkScore + frogScore + habitsScore);
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekBounds(dateStr: string): { weekStart: string; weekEnd: string } {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    weekStart: formatLocalDate(monday),
    weekEnd: formatLocalDate(sunday),
  };
}

function getPrevWeekBounds(dateStr: string): { weekStart: string; weekEnd: string } {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 7);
  return getWeekBounds(formatLocalDate(d));
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

// --- Main handler ---

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const date = request.nextUrl.searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'date query param is required' }, { status: 400 });
    }

    // --- Daily Score ---
    const dayTasks = db.prepare(
      'SELECT * FROM tasks WHERE date = ?'
    ).all(date) as TaskRow[];

    const dailyEntry = db.prepare(
      'SELECT training, spiritual, content_creation FROM daily_entries WHERE date = ?'
    ).get(date) as DailyEntryRow | undefined;

    const dailyScore = calculateDailyScore(dayTasks, dailyEntry ?? null);

    // --- Streak ---
    let streak = 0;
    let checkDate = date;
    for (let i = 0; i < 365; i++) {
      const dayTasksForStreak = db.prepare(
        'SELECT * FROM tasks WHERE date = ?'
      ).all(checkDate) as TaskRow[];

      if (dayTasksForStreak.length === 0) break;

      const dayEntry = db.prepare(
        'SELECT training, spiritual, content_creation FROM daily_entries WHERE date = ?'
      ).get(checkDate) as DailyEntryRow | undefined;

      const score = calculateDailyScore(dayTasksForStreak, dayEntry ?? null);
      if (score >= 50) {
        streak++;
      } else {
        break;
      }

      checkDate = addDays(checkDate, -1);
    }

    // --- Weekly Performance ---
    const { weekStart, weekEnd } = getWeekBounds(date);
    const weekTasks = db.prepare(
      'SELECT * FROM tasks WHERE date >= ? AND date <= ?'
    ).all(weekStart, weekEnd) as TaskRow[];

    // Group by date and calculate scores
    const weekDayScores: number[] = [];
    const weekDates = Array.from(new Set(weekTasks.map(t => t.date)));
    for (const wd of weekDates) {
      const wdTasks = weekTasks.filter(t => t.date === wd);
      const wdEntry = db.prepare(
        'SELECT training, spiritual, content_creation FROM daily_entries WHERE date = ?'
      ).get(wd) as DailyEntryRow | undefined;
      weekDayScores.push(calculateDailyScore(wdTasks, wdEntry ?? null));
    }

    const weeklyAvg = weekDayScores.length > 0
      ? Math.round(weekDayScores.reduce((a, b) => a + b, 0) / weekDayScores.length)
      : 0;

    // Previous week
    const prev = getPrevWeekBounds(date);
    const prevWeekTasks = db.prepare(
      'SELECT * FROM tasks WHERE date >= ? AND date <= ?'
    ).all(prev.weekStart, prev.weekEnd) as TaskRow[];

    const prevWeekDayScores: number[] = [];
    const prevWeekDates = Array.from(new Set(prevWeekTasks.map(t => t.date)));
    for (const pwd of prevWeekDates) {
      const pwdTasks = prevWeekTasks.filter(t => t.date === pwd);
      const pwdEntry = db.prepare(
        'SELECT training, spiritual, content_creation FROM daily_entries WHERE date = ?'
      ).get(pwd) as DailyEntryRow | undefined;
      prevWeekDayScores.push(calculateDailyScore(pwdTasks, pwdEntry ?? null));
    }

    const prevWeeklyAvg = prevWeekDayScores.length > 0
      ? Math.round(prevWeekDayScores.reduce((a, b) => a + b, 0) / prevWeekDayScores.length)
      : 0;

    let weeklyTrend: 'up' | 'down' | 'flat' = 'flat';
    if (weeklyAvg > prevWeeklyAvg + 3) weeklyTrend = 'up';
    else if (weeklyAvg < prevWeeklyAvg - 3) weeklyTrend = 'down';

    // --- Goal Velocity ---
    const goals = db.prepare('SELECT * FROM goals ORDER BY sort_order ASC').all() as GoalRow[];
    const quarter = getQuarterInfo(date);
    const timePct = quarter.elapsedDays / quarter.totalDays;

    const goalVelocity = goals.map(goal => {
      const target = goal[`${quarter.qKey}_target` as keyof GoalRow] as number;
      const actual = goal[`${quarter.qKey}_actual` as keyof GoalRow] as number;
      const progressPct = target > 0 ? actual / target : 0;
      const velocity = timePct > 0 ? Math.round((progressPct / timePct) * 100) / 100 : 0;

      let status: 'ahead' | 'on_track' | 'behind' | 'critical';
      if (velocity > 1.1) status = 'ahead';
      else if (velocity >= 0.9) status = 'on_track';
      else if (velocity >= 0.5) status = 'behind';
      else status = 'critical';

      return {
        goal_id: goal.id,
        area: goal.area,
        title: goal.title,
        velocity,
        status,
        target,
        actual,
      };
    });

    // --- Achievements ---
    // first_frog: completed at least 1 frog task ever
    const frogCount = db.prepare(
      'SELECT COUNT(*) as count FROM tasks WHERE is_frog = 1 AND completed = 1'
    ).get() as CountRow;

    // deep_focus: 3+ hours deep work in a single day
    const deepFocusDay = db.prepare(`
      SELECT date, SUM(estimated_minutes) as total
      FROM tasks
      WHERE type = 'deep' AND completed = 1
      GROUP BY date
      HAVING total >= 180
      LIMIT 1
    `).get() as SumRow | undefined;

    // perfect_day: daily score = 100 (check all days with tasks)
    // We check the current day for simplicity + a broader check
    const perfectDay = dailyScore === 100;

    // consistent_week: all 5 weekdays score >= 60
    const weekdayScoresForConsistent: number[] = [];
    for (let i = 0; i < 5; i++) {
      const wd = addDays(weekStart, i);
      const wdTasks = db.prepare('SELECT * FROM tasks WHERE date = ?').all(wd) as TaskRow[];
      if (wdTasks.length > 0) {
        const wdEntry = db.prepare(
          'SELECT training, spiritual, content_creation FROM daily_entries WHERE date = ?'
        ).get(wd) as DailyEntryRow | undefined;
        weekdayScoresForConsistent.push(calculateDailyScore(wdTasks, wdEntry ?? null));
      }
    }
    const consistentWeek = weekdayScoresForConsistent.length === 5 &&
      weekdayScoresForConsistent.every(s => s >= 60);

    // goal_crusher: any goal velocity > 1.2
    const goalCrusher = goalVelocity.some(g => g.velocity > 1.2);

    // centurion: 100 total tasks completed all time
    const totalCompleted = db.prepare(
      'SELECT COUNT(*) as count FROM tasks WHERE completed = 1'
    ).get() as CountRow;

    const achievements = [
      { id: 'first_frog', name: 'Primeiro sapo', unlocked: frogCount.count > 0 },
      { id: 'streak_3', name: '3 dias seguidos', unlocked: streak >= 3 },
      { id: 'streak_7', name: 'Semana perfeita', unlocked: streak >= 7 },
      { id: 'streak_14', name: '2 semanas firme', unlocked: streak >= 14 },
      { id: 'streak_30', name: 'Maquina de 30 dias', unlocked: streak >= 30 },
      { id: 'deep_focus', name: 'Foco profundo', unlocked: !!deepFocusDay },
      { id: 'perfect_day', name: 'Dia perfeito', unlocked: perfectDay },
      { id: 'consistent_week', name: 'Semana consistente', unlocked: consistentWeek },
      { id: 'goal_crusher', name: 'Meta esmagada', unlocked: goalCrusher },
      { id: 'centurion', name: 'Centuriao', unlocked: totalCompleted.count >= 100 },
    ];

    // --- Totals ---
    const totalDeepMinutes = db.prepare(
      "SELECT COALESCE(SUM(estimated_minutes), 0) as total FROM tasks WHERE type = 'deep' AND completed = 1"
    ).get() as SumRow;

    // --- Deep work hours today ---
    const todayDeepMinutes = dayTasks
      .filter(t => t.type === 'deep' && t.completed)
      .reduce((sum, t) => sum + (t.estimated_minutes || 0), 0);

    return NextResponse.json({
      daily_score: dailyScore,
      streak,
      weekly_avg: weeklyAvg,
      weekly_trend: weeklyTrend,
      prev_weekly_avg: prevWeeklyAvg,
      goal_velocity: goalVelocity,
      achievements,
      total_tasks_completed: totalCompleted.count,
      total_deep_work_hours: Math.round((totalDeepMinutes.total / 60) * 10) / 10,
      today_deep_work_hours: Math.round((todayDeepMinutes / 60) * 10) / 10,
      tasks_completed_today: dayTasks.filter(t => t.completed).length,
      tasks_total_today: dayTasks.length,
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to calculate scores' }, { status: 500 });
  }
}
