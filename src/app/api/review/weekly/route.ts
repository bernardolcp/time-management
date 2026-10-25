import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser, enforceAnthropicRateLimit } from '@/lib/api-auth';

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
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
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
  const weeklyCompletionRate = totalTasks > 0 ? Math.round((totalTasksCompleted / totalTasks) * 100) : 0;
  const behindGoals = goalVelocities.filter(g => g.velocity === 'behind');
  const deepHours = (totalDeepWork / 60).toFixed(1);

  // Verdict
  if (avgScore >= 80) {
    lines.push(`**Veredicto**: Score ${Math.round(avgScore)}/100. Semana forte — mas uma semana não faz um quarter.`);
  } else if (avgScore >= 50) {
    lines.push(`**Veredicto**: Score ${Math.round(avgScore)}/100. Mediana. Se você mantiver esse ritmo, vai fechar o quarter no meio do caminho.`);
  } else {
    lines.push(`**Veredicto**: Score ${Math.round(avgScore)}/100. Semana perdida. Cada semana assim é irrecuperável.`);
  }
  lines.push('');

  // Pattern
  lines.push(`**Padrão**: ${totalTasksCompleted}/${totalTasks} tarefas (${weeklyCompletionRate}%). ${deepHours}h de deep work.`);
  if (totalDeepWork < 300) {
    lines.push(`${deepHours}h de deep work em 5 dias úteis = menos de 1h/dia. Você está operando no modo reativo.`);
  }
  if (worstDay && bestDay && bestDay.score - worstDay.score > 40) {
    lines.push(`Oscilação brutal: melhor dia ${bestDay.score}, pior dia ${worstDay.score}. Consistência > picos.`);
  }
  lines.push('');

  // Goals
  lines.push('**Metas**:');
  for (const g of goalVelocities) {
    if (g.velocity === 'behind') {
      lines.push(`- ${g.area}: ATRASADO. Se não acelerar essa semana, a conta vai ficar impagável.`);
    } else if (g.velocity === 'on_track') {
      lines.push(`- ${g.area}: No ritmo. Mas "no ritmo" = baseline, não excelência.`);
    } else {
      lines.push(`- ${g.area}: Adiantado. Bom — não relaxe.`);
    }
  }
  lines.push('');

  // Actions
  lines.push('**Ações para essa semana**:');
  if (avgScore < 60) {
    lines.push('1. Reduza para 3 tarefas/dia. Execute 100% ao invés de planejar 8 e fazer 3.');
    lines.push('2. Frog primeiro — 7h, sem negociação.');
  } else {
    lines.push('1. Proteja 2h de deep work/dia. Bloqueie na agenda como reunião.');
    lines.push(`2. ${streak >= 3 ? `Streak de ${streak} dias — não quebre.` : 'Construa um streak: 3 dias seguidos com score > 60.'}`);
  }
  if (behindGoals.length > 0) {
    lines.push(`3. Metas em risco (${behindGoals.map(g => g.area).join(', ')}): reserve tempo ESPECÍFICO essa semana.`);
  }

  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  const weekStart = request.nextUrl.searchParams.get('week_start');
  if (!weekStart) {
    return NextResponse.json({ error: 'week_start query param is required' }, { status: 400 });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const limited = enforceAnthropicRateLimit(gate.userKey);
    if (limited) return limited;
  }

  try {
    const db = getDb();

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

      const systemPrompt = `Você é o coach de performance mais duro e honesto que existe. Você NÃO é cheerleader. Você analisa padrões semanais e confronta com a realidade.

Gere uma revisão semanal BRUTAL:

Formato:
1. **Veredicto** (1 frase): A semana foi produtiva, medíocre ou desperdiçada? Sem suavizar.
2. **Padrão identificado**: O que os DADOS revelam? Se a pessoa planeja muito e executa pouco, diga. Se evita deep work, diga. Se sempre pula o frog, é um padrão — nomeie.
3. **Gap analysis das metas**: Para CADA meta (Saúde, Família, Espiritual, Criativo), compare o progresso real vs. onde deveria estar. Use a fórmula: (actual/target) vs. (% do quarter já passado). Se está atrás, calcule quantos por semana precisa para recuperar. Sem "tenta melhorar" — dê o número.
4. **O custo da mediocridade**: Se a semana foi mediana, calcule: "Se mantiver esse ritmo, vai fechar o quarter em X% da meta Y. Isso é suficiente?"
5. **3 ações concretas**: Cada ação com dia, hora e duração. Não "priorize deep work" — "Segunda 7h-9h, deep work no projeto Z. Quarta e sexta: treino antes das 8h."

Regras:
- Português brasileiro, direto, sem floreio
- Máximo 400 palavras
- Use números (%, minutos, gaps, projeções)
- NÃO diga "parabéns", "ótimo trabalho" a menos que a semana seja genuinamente excepcional (score > 85)
- Confronte padrões de autoengano: "Você diz que quer X mas faz Y toda semana"
- Termine com uma pergunta incômoda que force reflexão real`;

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
