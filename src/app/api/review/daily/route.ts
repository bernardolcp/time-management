import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser, enforceAnthropicRateLimit } from '@/lib/api-auth';

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

  // Diagnostic
  if (score >= 80) {
    lines.push(`**Diagnóstico**: Score ${score}/100. Dia sólido — mas sólido não é excepcional.`);
  } else if (score >= 50) {
    lines.push(`**Diagnóstico**: Score ${score}/100. Mediano. Mediano não bate meta.`);
  } else {
    lines.push(`**Diagnóstico**: Score ${score}/100. Dia desperdiçado. Cada dia assim é um dia a mais de atraso.`);
  }
  lines.push('');

  // Numbers
  lines.push(`**Os números**: ${tasksCompleted}/${tasksTotal} tarefas (${Math.round(completionRate)}%). ${deepMinutes}min de deep work${deepMinutes < 60 ? ' — isso é quase nada' : ''}. Frog: ${frogCompleted ? 'feito' : 'NÃO FEITO'}.`);
  lines.push('');

  // What was avoided
  const avoided: string[] = [];
  if (!frogCompleted) {
    avoided.push('Fugiu do frog — a tarefa mais importante do dia ficou pra depois. Depois vira nunca.');
  }
  if (deepMinutes < 60) {
    avoided.push(`${deepMinutes}min de deep work é insuficiente. Sem blocos de foco, você está só reagindo.`);
  }
  if (completionRate < 50) {
    avoided.push(`Menos de metade executado. Ou planejou demais ou executou de menos — os dois são problemas.`);
  }
  if (avoided.length > 0) {
    lines.push(`**O que você evitou**: ${avoided[0]}`);
  }
  lines.push('');

  // Tomorrow
  if (score >= 80) {
    lines.push('**Amanhã**: Aumente a barra. Adicione 30min de deep work ao plano. Prove que hoje não foi exceção.');
  } else if (score >= 50) {
    lines.push('**Amanhã**: Primeira coisa do dia = frog. Sem email, sem mensagem, sem desculpa. 90min de foco.');
  } else {
    lines.push('**Amanhã**: Planeje MENOS. 3 tarefas, 1 frog. Execute 100% ao invés de planejar 10 e fazer 3.');
  }

  return lines.join('\n');
}

export async function GET(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  const date = request.nextUrl.searchParams.get('date');
  const generate = request.nextUrl.searchParams.get('generate') === 'true';

  if (!date) {
    return NextResponse.json({ error: 'date query param is required' }, { status: 400 });
  }

  if (generate && process.env.ANTHROPIC_API_KEY) {
    const limited = enforceAnthropicRateLimit(gate.userKey);
    if (limited) return limited;
  }

  try {
    const db = getDb();

    // Check if review already exists
    const existing = db.prepare('SELECT * FROM daily_reviews WHERE date = ?').get(date) as Record<string, unknown> | undefined;
    if (existing && !generate) {
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

    // If not generating, just return empty (no auto-creation)
    if (!generate) {
      return NextResponse.json({ empty: true });
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

      const systemPrompt = `Você é o coach de performance mais duro e honesto que existe. Você NÃO é cheerleader. Você é o amigo que fala a verdade na cara.

Gere uma revisão do dia BRUTAL e baseada em dados:

Formato:
1. **Diagnóstico** (1 frase cortante): O dia foi bom, medíocre ou um desperdício? Sem rodeios.
2. **Os números não mentem**: Taxa de conclusão, deep work real vs. planejado, frog feito ou não. Coloque o espelho na cara.
3. **O que você evitou**: Se o frog não foi feito, se tarefas importantes ficaram, nomeie a esquiva e calcule o custo. "Cada dia sem treinar é X treinos a mais por semana no resto do quarter."
4. **Alinhamento com metas**: As tarefas do dia moveram as metas que estão atrasadas? Ou você gastou o dia em shallow work enquanto as metas morrem?
5. **Amanhã**: UMA ação concreta, com hora e duração. Não "tente melhorar" — "Amanhã às 7h, 90min de deep work no projeto X."

Regras:
- Português brasileiro, direto, sem floreio
- Máximo 200 palavras
- Use números concretos (%, minutos, gaps)
- NÃO diga "parabéns", "ótimo trabalho", "continue assim" a menos que o score seja genuinamente > 85
- Se tudo está mediano, desafie: "Mediano não bate meta"`;


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
