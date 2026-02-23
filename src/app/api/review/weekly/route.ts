import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface DailyReviewRow {
  id: number;
  date: string;
  score: number;
  review_text: string;
  tasks_completed: number;
  tasks_total: number;
  deep_work_minutes: number;
  completion_rate: number;
}

interface TaskRow {
  id: number;
  date: string;
  title: string;
  type: string;
  estimated_minutes: number;
  actual_minutes: number;
  is_frog: number;
  completed: number;
  goal_id: number | null;
}

interface GoalRow {
  id: number;
  title: string;
  area: string;
  q1_target: number;
  q1_actual: number;
  q2_target: number;
  q2_actual: number;
  q3_target: number;
  q3_actual: number;
  q4_target: number;
  q4_actual: number;
  unit: string;
}

function getCurrentQuarter(): string {
  const month = new Date().getMonth();
  if (month < 3) return 'q1';
  if (month < 6) return 'q2';
  if (month < 9) return 'q3';
  return 'q4';
}

function getQuarterProgress(goal: GoalRow): { actual: number; target: number } {
  const q = getCurrentQuarter();
  return {
    actual: goal[`${q}_actual` as keyof GoalRow] as number,
    target: goal[`${q}_target` as keyof GoalRow] as number,
  };
}

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function calculateGoalVelocity(goal: GoalRow): 'ahead' | 'on_track' | 'behind' {
  const q = getCurrentQuarter();
  const qIndex = ['q1', 'q2', 'q3', 'q4'].indexOf(q);
  const monthInQuarter = new Date().getMonth() - qIndex * 3;
  const dayInMonth = new Date().getDate();
  const daysElapsed = monthInQuarter * 30 + dayInMonth;
  const totalDays = 90;
  const expectedProgress = daysElapsed / totalDays;

  const { actual, target } = getQuarterProgress(goal);
  if (target === 0) return 'on_track';

  const actualProgress = actual / target;
  const ratio = actualProgress / expectedProgress;

  if (ratio >= 1.1) return 'ahead';
  if (ratio >= 0.85) return 'on_track';
  return 'behind';
}

function generateAlgorithmicWeeklyReview(
  avgScore: number,
  totalDeepWork: number,
  bestDay: { date: string; score: number } | null,
  worstDay: { date: string; score: number } | null,
  streak: number,
  totalTasksCompleted: number,
  totalTasks: number,
  goalVelocities: { area: string; title: string; velocity: string }[]
): string {
  const lines: string[] = [];

  lines.push(`**Score da semana**: ${Math.round(avgScore)}/100`);
  lines.push('');

  const weeklyCompletionRate = totalTasks > 0 ? Math.round((totalTasksCompleted / totalTasks) * 100) : 0;
  lines.push(`**Padrao observado**: ${totalTasksCompleted}/${totalTasks} tarefas concluidas (${weeklyCompletionRate}%). ${totalDeepWork} minutos de deep work total na semana.`);
  lines.push('');

  const wins: string[] = [];
  if (bestDay) wins.push(`Melhor dia: ${bestDay.date} com score ${bestDay.score}`);
  if (streak >= 3) wins.push(`Streak de ${streak} dias consecutivos produtivos`);
  if (totalDeepWork >= 600) wins.push(`Mais de 10h de deep work na semana`);
  if (wins.length === 0) wins.push('Semana com oportunidade de melhoria');
  lines.push(`**Wins**: ${wins.join('. ')}`);
  lines.push('');

  const alerts: string[] = [];
  if (worstDay && worstDay.score < 40) alerts.push(`Dia critico: ${worstDay.date} (score ${worstDay.score})`);
  if (avgScore < 50) alerts.push('Media semanal abaixo de 50 — revise o planejamento');
  if (totalDeepWork < 300) alerts.push('Menos de 5h de deep work — proteja blocos de foco');
  const behindGoals = goalVelocities.filter(g => g.velocity === 'behind');
  if (behindGoals.length > 0) alerts.push(`Metas atrasadas: ${behindGoals.map(g => g.area).join(', ')}`);
  if (alerts.length === 0) alerts.push('Sem alertas criticos esta semana');
  lines.push(`**Alerta**: ${alerts.join('. ')}`);
  lines.push('');

  lines.push('**Meta check**:');
  for (const g of goalVelocities) {
    const status = g.velocity === 'ahead' ? 'Adiantado' : g.velocity === 'on_track' ? 'No ritmo' : 'Atrasado';
    lines.push(`- ${g.area}: ${status}`);
  }
  lines.push('');

  lines.push('**Plano sugerido**:');
  if (avgScore < 60) {
    lines.push('1. Reduza o numero de tarefas diarias para focar na execucao');
    lines.push('2. Comece cada dia pelo frog antes de qualquer coisa');
  } else {
    lines.push('1. Mantenha a consistencia e aumente gradualmente a carga de deep work');
    lines.push('2. Reserve tempo para revisar o progresso das metas no meio da semana');
  }
  if (behindGoals.length > 0) {
    lines.push(`3. Priorize acoes para as metas atrasadas: ${behindGoals.map(g => g.area).join(', ')}`);
  }

  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const weekStart = request.nextUrl.searchParams.get('week_start');

    if (!weekStart) {
      return NextResponse.json({ error: 'week_start query param is required' }, { status: 400 });
    }

    const dates = getWeekDates(weekStart);
    const weekEnd = dates[6];

    // Fetch daily reviews for the week
    const dailyReviews = db.prepare(
      'SELECT * FROM daily_reviews WHERE date >= ? AND date <= ? ORDER BY date ASC'
    ).all(dates[0], weekEnd) as DailyReviewRow[];

    // Fetch all tasks for the week
    const tasks = db.prepare(
      'SELECT * FROM tasks WHERE date >= ? AND date <= ?'
    ).all(dates[0], weekEnd) as TaskRow[];

    // Fetch goals
    const goals = db.prepare('SELECT * FROM goals ORDER BY sort_order ASC').all() as GoalRow[];

    // Calculate weekly stats
    const reviewScores = dailyReviews.map(r => ({ date: r.date, score: r.score }));
    const avgDailyScore = reviewScores.length > 0
      ? reviewScores.reduce((sum, r) => sum + r.score, 0) / reviewScores.length
      : 0;

    const totalDeepWork = dailyReviews.reduce((sum, r) => sum + r.deep_work_minutes, 0);

    const sorted = [...reviewScores].sort((a, b) => b.score - a.score);
    const bestDay = sorted.length > 0 ? sorted[0] : null;
    const worstDay = sorted.length > 0 ? sorted[sorted.length - 1] : null;

    // Calculate streak: consecutive days with score > 60
    let streak = 0;
    const reversedReviews = [...dailyReviews].reverse();
    for (const r of reversedReviews) {
      if (r.score > 60) {
        streak++;
      } else {
        break;
      }
    }

    // Goal velocity
    const goalVelocities = goals.map(g => ({
      area: g.area,
      title: g.title,
      velocity: calculateGoalVelocity(g),
    }));

    const totalTasksCompleted = tasks.filter(t => t.completed === 1).length;
    const totalTasks = tasks.length;

    let weeklyScore = Math.round(avgDailyScore);
    let reviewText: string;

    if (!process.env.ANTHROPIC_API_KEY) {
      reviewText = generateAlgorithmicWeeklyReview(
        avgDailyScore, totalDeepWork, bestDay, worstDay, streak,
        totalTasksCompleted, totalTasks, goalVelocities
      );
    } else {
      // Build context for AI
      const dailySummaries = dates.map(date => {
        const review = dailyReviews.find(r => r.date === date);
        const dayTasks = tasks.filter(t => t.date === date);
        const completed = dayTasks.filter(t => t.completed === 1).length;
        if (review) {
          return `${date}: Score ${review.score}, ${completed}/${dayTasks.length} tarefas, ${review.deep_work_minutes}min deep work`;
        }
        return `${date}: Sem review (${completed}/${dayTasks.length} tarefas)`;
      });

      const goalLines = goals.map(g => {
        const { actual, target } = getQuarterProgress(g);
        const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
        const velocity = calculateGoalVelocity(g);
        return `- ${g.area}: ${g.title} — ${actual}/${target} ${g.unit} (${pct}%) [${velocity}]`;
      });

      const userMessage = [
        `Semana: ${dates[0]} a ${dates[6]}`,
        `Media diaria: ${Math.round(avgDailyScore)}/100`,
        `Total deep work: ${totalDeepWork} minutos (${(totalDeepWork / 60).toFixed(1)}h)`,
        `Tarefas: ${totalTasksCompleted}/${totalTasks} concluidas`,
        `Streak atual: ${streak} dias`,
        bestDay ? `Melhor dia: ${bestDay.date} (${bestDay.score})` : 'Nenhum dia com review',
        worstDay ? `Pior dia: ${worstDay.date} (${worstDay.score})` : '',
        '',
        'Resumo diario:',
        ...dailySummaries,
        '',
        'Progresso das metas (trimestre atual):',
        ...goalLines,
      ].join('\n');

      const systemPrompt = `Voce e o Coach de Performance do Bernardo. Gere uma revisao semanal profunda e actionable.

Formato:
1. **Score da semana** (0-100)
2. **Padrao observado**: O que os dados revelam sobre o comportamento da semana
3. **Wins**: 2-3 conquistas concretas
4. **Alerta**: O que precisa mudar na proxima semana
5. **Meta check**: Progresso nas 4 areas (Saude, Familia, Espiritual, Criativo) — esta no ritmo?
6. **Plano sugerido**: 2-3 acoes especificas para proxima semana

Seja analitico, use os dados. Portugues brasileiro. Maximo 400 palavras.
Tom: mentor experiente, nao robo motivacional.`;

      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic();

        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        const textBlock = response.content[0];
        reviewText = textBlock.type === 'text' ? textBlock.text : '';

        // Try to extract score from AI response
        const scoreMatch = reviewText.match(/Score da semana\*?\*?[:\s]*(\d+)/);
        if (scoreMatch) {
          weeklyScore = parseInt(scoreMatch[1], 10);
        }
      } catch (_error) {
        reviewText = generateAlgorithmicWeeklyReview(
          avgDailyScore, totalDeepWork, bestDay, worstDay, streak,
          totalTasksCompleted, totalTasks, goalVelocities
        );
      }
    }

    return NextResponse.json({
      weekly_score: weeklyScore,
      review_text: reviewText,
      stats: {
        avg_daily_score: Math.round(avgDailyScore * 10) / 10,
        total_deep_work: totalDeepWork,
        best_day: bestDay,
        worst_day: worstDay,
        streak,
        goal_velocity: goalVelocities,
      },
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to generate weekly review' }, { status: 500 });
  }
}
