import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface TaskRow {
  id: number;
  date: string;
  title: string;
  type: string;
  estimated_minutes: number;
  actual_minutes: number;
  goal_id: number | null;
  is_frog: number;
  completed: number;
}

interface DailyEntryRow {
  energy_level: number;
  focus_word: string;
  training: number;
  spiritual: number;
  family_day: number;
  content_creation: number;
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

interface BehaviorLogRow {
  behavior_id: number;
  date: string;
  done: number;
}

interface BehaviorRow {
  id: number;
  title: string;
  frequency: string;
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

function calculateScore(
  tasksCompleted: number,
  tasksTotal: number,
  deepMinutes: number,
  frogCompleted: boolean,
  habitsDone: number,
  habitsPlanned: number
): number {
  const completionRate = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0;
  const deepWorkScore = Math.min((deepMinutes / 120) * 100, 100);
  const frogScore = frogCompleted ? 100 : 0;
  const habitScore = habitsPlanned > 0 ? (habitsDone / habitsPlanned) * 100 : 0;

  const score = Math.round(
    completionRate * 0.4 +
    deepWorkScore * 0.3 +
    frogScore * 0.15 +
    habitScore * 0.15
  );

  return Math.min(Math.max(score, 0), 100);
}

function generateAlgorithmicReview(
  score: number,
  tasksCompleted: number,
  tasksTotal: number,
  deepMinutes: number,
  frogCompleted: boolean,
  completionRate: number
): string {
  const lines: string[] = [];

  lines.push(`**Score do dia**: ${score}/100`);
  lines.push('');

  if (completionRate >= 80) {
    lines.push(`**O que funcionou**: Alta taxa de conclusao (${Math.round(completionRate)}%). Boa execucao do planejado.`);
  } else if (completionRate >= 50) {
    lines.push(`**O que funcionou**: Progresso razoavel com ${tasksCompleted}/${tasksTotal} tarefas concluidas.`);
  } else {
    lines.push(`**O que funcionou**: Dia com menos entregas que o planejado (${tasksCompleted}/${tasksTotal}).`);
  }
  lines.push('');

  const improvements: string[] = [];
  if (!frogCompleted) {
    improvements.push('O frog do dia nao foi concluido — priorize a tarefa mais importante primeiro amanha.');
  }
  if (deepMinutes < 60) {
    improvements.push(`Apenas ${deepMinutes}min de deep work. Tente bloquear pelo menos 2h de foco profundo.`);
  }
  if (completionRate < 50) {
    improvements.push('Menos da metade das tarefas foram concluidas. Revise se esta planejando de forma realista.');
  }
  if (improvements.length === 0) {
    improvements.push('Continue mantendo a consistencia.');
  }
  lines.push(`**O que melhorar**: ${improvements.slice(0, 2).join(' ')}`);
  lines.push('');

  if (score >= 80) {
    lines.push('**Desafio para amanha**: Mantenha o ritmo e aumente a barra — adicione uma tarefa de deep work extra.');
  } else if (score >= 50) {
    lines.push('**Desafio para amanha**: Comece pelo frog e proteja suas horas de deep work.');
  } else {
    lines.push('**Desafio para amanha**: Planeje menos, execute mais. Foque em 3 tarefas essenciais.');
  }

  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const date = request.nextUrl.searchParams.get('date');

    if (!date) {
      return NextResponse.json({ error: 'date query param is required' }, { status: 400 });
    }

    // Check if review already exists
    const existing = db.prepare('SELECT * FROM daily_reviews WHERE date = ?').get(date) as Record<string, unknown> | undefined;
    if (existing) {
      return NextResponse.json({
        score: existing.score,
        review_text: existing.review_text,
        stats: {
          tasks_completed: existing.tasks_completed,
          tasks_total: existing.tasks_total,
          deep_work_minutes: existing.deep_work_minutes,
          completion_rate: existing.completion_rate,
        },
      });
    }

    // Fetch data
    const tasks = db.prepare('SELECT * FROM tasks WHERE date = ?').all(date) as TaskRow[];
    const dailyEntry = db.prepare('SELECT * FROM daily_entries WHERE date = ?').get(date) as DailyEntryRow | undefined;
    const goals = db.prepare('SELECT * FROM goals ORDER BY sort_order ASC').all() as GoalRow[];
    const behaviors = db.prepare('SELECT * FROM behaviors ORDER BY sort_order ASC').all() as BehaviorRow[];
    const behaviorLogs = db.prepare('SELECT * FROM behavior_logs WHERE date = ?').all(date) as BehaviorLogRow[];

    // Calculate stats
    const tasksCompleted = tasks.filter(t => t.completed === 1).length;
    const tasksTotal = tasks.length;
    const deepWorkMinutes = tasks
      .filter(t => t.type === 'deep' && t.completed === 1)
      .reduce((sum, t) => sum + (t.actual_minutes || t.estimated_minutes), 0);
    const completionRate = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0;

    const frogTask = tasks.find(t => t.is_frog === 1);
    const frogCompleted = frogTask ? frogTask.completed === 1 : false;

    const habitsPlanned = behaviors.length;
    const habitsDone = behaviorLogs.filter(l => l.done === 1).length;

    const score = calculateScore(tasksCompleted, tasksTotal, deepWorkMinutes, frogCompleted, habitsDone, habitsPlanned);

    let reviewText: string;

    if (!process.env.ANTHROPIC_API_KEY) {
      // Algorithmic fallback
      reviewText = generateAlgorithmicReview(score, tasksCompleted, tasksTotal, deepWorkMinutes, frogCompleted, completionRate);
    } else {
      // AI review
      const completedTasks = tasks.filter(t => t.completed === 1).map(t => `- [${t.type}] ${t.title}${t.is_frog ? ' [FROG]' : ''}`);
      const incompleteTasks = tasks.filter(t => t.completed === 0).map(t => `- [${t.type}] ${t.title}${t.is_frog ? ' [FROG]' : ''}`);

      const goalProgress = goals.map(g => {
        const { actual, target } = getQuarterProgress(g);
        const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
        return `- ${g.area}: ${g.title} — ${actual}/${target} ${g.unit} (${pct}%)`;
      });

      const userMessage = [
        `Data: ${date}`,
        `Score calculado: ${score}/100`,
        `Energia: ${dailyEntry?.energy_level ?? 'N/A'}/5`,
        `Palavra-foco: ${dailyEntry?.focus_word || 'Nenhuma'}`,
        '',
        `Tarefas: ${tasksCompleted}/${tasksTotal} concluidas (${Math.round(completionRate)}%)`,
        `Deep work: ${deepWorkMinutes} minutos`,
        `Frog concluido: ${frogCompleted ? 'Sim' : 'Nao'}`,
        '',
        'Tarefas concluidas:',
        ...(completedTasks.length > 0 ? completedTasks : ['- Nenhuma']),
        '',
        'Tarefas nao concluidas:',
        ...(incompleteTasks.length > 0 ? incompleteTasks : ['- Nenhuma']),
        '',
        'Progresso das metas:',
        ...goalProgress,
        '',
        `Habitos: ${habitsDone}/${habitsPlanned} feitos`,
        `Treino: ${dailyEntry?.training ? 'Sim' : 'Nao'}`,
        `Espiritual: ${dailyEntry?.spiritual ? 'Sim' : 'Nao'}`,
        `Familia: ${dailyEntry?.family_day ? 'Sim' : 'Nao'}`,
        `Conteudo: ${dailyEntry?.content_creation ? 'Sim' : 'Nao'}`,
      ].join('\n');

      const systemPrompt = `Voce e o Coach de Performance do Bernardo. Gere uma revisao do dia concisa e direta.

Formato:
1. **Score do dia** (0-100): baseado em taxa de conclusao, horas de deep work, e alinhamento com metas
2. **O que funcionou**: 1-2 pontos especificos
3. **O que melhorar**: 1-2 pontos especificos
4. **Conexao com metas**: como o dia impactou as metas de longo prazo
5. **Desafio para amanha**: um desafio especifico baseado no que nao foi feito hoje

Seja direto, honesto, motivador. Portugues brasileiro. Maximo 200 palavras.
Nao use emojis em excesso — maximo 3 por review.`;

      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const client = new Anthropic();

        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        const textBlock = response.content[0];
        reviewText = textBlock.type === 'text' ? textBlock.text : '';
      } catch (_error) {
        // Fallback if API fails
        reviewText = generateAlgorithmicReview(score, tasksCompleted, tasksTotal, deepWorkMinutes, frogCompleted, completionRate);
      }
    }

    // Save to DB
    db.prepare(`
      INSERT INTO daily_reviews (date, score, review_text, tasks_completed, tasks_total, deep_work_minutes, completion_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        score = excluded.score,
        review_text = excluded.review_text,
        tasks_completed = excluded.tasks_completed,
        tasks_total = excluded.tasks_total,
        deep_work_minutes = excluded.deep_work_minutes,
        completion_rate = excluded.completion_rate
    `).run(date, score, reviewText, tasksCompleted, tasksTotal, deepWorkMinutes, completionRate);

    return NextResponse.json({
      score,
      review_text: reviewText,
      stats: {
        tasks_completed: tasksCompleted,
        tasks_total: tasksTotal,
        deep_work_minutes: deepWorkMinutes,
        completion_rate: completionRate,
      },
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to generate daily review' }, { status: 500 });
  }
}
