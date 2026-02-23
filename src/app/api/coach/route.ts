import { NextRequest, NextResponse } from 'next/server';

interface Task {
  title: string;
  type: string;
  estimated_minutes: number;
  is_frog: number;
  completed: number;
}

interface Goal {
  title: string;
  area: string;
  q1_actual: number;
  q1_target: number;
  unit: string;
}

interface CoachRequest {
  type: 'daily_plan_review' | 'accountability_check' | 'weekly_reflection';
  energy_level?: number;
  focus_word?: string;
  tasks?: Task[];
  goals?: Goal[];
  habits_today?: { training: boolean; spiritual: boolean; family: boolean; content: boolean };
  context?: string;
}

const systemPrompt = `Você é o Coach de Performance do Bernardo. Seu papel:
- Ser direto, motivador e honesto (sem ser rude)
- Focar em accountability e formação de hábitos
- Conectar as decisões do dia com as metas de longo prazo
- Dar feedback específico, não genérico
- Falar em português brasileiro
- Respostas curtas (máximo 3 parágrafos)
- Quando as metas estão atrasadas, ser firme mas construtivo
- Celebrar vitórias e consistência

Contexto das metas anuais do Bernardo:
- Saúde: treinos (meta anual de 200)
- Família: momentos de qualidade (meta anual de 52, 1x por semana)
- Espiritual: momentos com Deus fora da missa (meta anual de 230)
- Criativo: conteúdos publicados (meta anual de 235)`;

function buildDailyPlanReviewMessage(body: CoachRequest): string {
  const lines: string[] = ['## Check-in do dia'];

  if (body.energy_level !== undefined) {
    lines.push(`Nível de energia: ${body.energy_level}/5`);
  }
  if (body.focus_word) {
    lines.push(`Palavra-foco do dia: ${body.focus_word}`);
  }

  if (body.tasks && body.tasks.length > 0) {
    lines.push('\n### Tarefas planejadas:');
    for (const t of body.tasks) {
      const frogLabel = t.is_frog ? ' [FROG]' : '';
      lines.push(`- [${t.type}] ${t.title} (${t.estimated_minutes}min)${frogLabel}`);
    }
    const deepTasks = body.tasks.filter(t => t.type === 'deep');
    const shallowTasks = body.tasks.filter(t => t.type === 'shallow');
    const totalMinutes = body.tasks.reduce((sum, t) => sum + t.estimated_minutes, 0);
    lines.push(`\nResumo: ${deepTasks.length} deep work, ${shallowTasks.length} shallow work, ${totalMinutes} min total`);
  }

  if (body.goals && body.goals.length > 0) {
    lines.push('\n### Progresso das metas:');
    for (const g of body.goals) {
      const pct = g.q1_target > 0 ? Math.round((g.q1_actual / g.q1_target) * 100) : 0;
      lines.push(`- ${g.area}: ${g.title} — ${g.q1_actual}/${g.q1_target} ${g.unit} (${pct}%)`);
    }
  }

  if (body.habits_today) {
    lines.push('\n### Hábitos hoje:');
    lines.push(`- Treino: ${body.habits_today.training ? 'Sim' : 'Não'}`);
    lines.push(`- Espiritual: ${body.habits_today.spiritual ? 'Sim' : 'Não'}`);
    lines.push(`- Família: ${body.habits_today.family ? 'Sim' : 'Não'}`);
    lines.push(`- Conteúdo: ${body.habits_today.content ? 'Sim' : 'Não'}`);
  }

  if (body.context) {
    lines.push(`\nContexto adicional: ${body.context}`);
  }

  lines.push('\nRevise meu plano do dia: está equilibrado ou ambicioso demais/leve demais? Conecte com minhas metas anuais e me dê uma dica específica e acionável.');

  return lines.join('\n');
}

function buildAccountabilityCheckMessage(body: CoachRequest): string {
  const lines: string[] = ['## Check de Accountability'];

  if (body.tasks && body.tasks.length > 0) {
    const completed = body.tasks.filter(t => t.completed);
    const notCompleted = body.tasks.filter(t => !t.completed);

    lines.push(`\n### Planejado vs Feito: ${completed.length}/${body.tasks.length} tarefas concluídas`);

    if (completed.length > 0) {
      lines.push('\nConcluídas:');
      for (const t of completed) {
        lines.push(`- ✓ [${t.type}] ${t.title}`);
      }
    }

    if (notCompleted.length > 0) {
      lines.push('\nNão concluídas:');
      for (const t of notCompleted) {
        const frogLabel = t.is_frog ? ' [FROG]' : '';
        lines.push(`- ✗ [${t.type}] ${t.title}${frogLabel}`);
      }
    }
  }

  if (body.habits_today) {
    lines.push('\n### Hábitos do dia:');
    lines.push(`- Treino: ${body.habits_today.training ? 'Feito' : 'Não feito'}`);
    lines.push(`- Espiritual: ${body.habits_today.spiritual ? 'Feito' : 'Não feito'}`);
    lines.push(`- Família: ${body.habits_today.family ? 'Feito' : 'Não feito'}`);
    lines.push(`- Conteúdo: ${body.habits_today.content ? 'Feito' : 'Não feito'}`);
  }

  if (body.context) {
    lines.push(`\nContexto: ${body.context}`);
  }

  lines.push('\nMe dê feedback honesto sobre minha execução hoje.');

  return lines.join('\n');
}

function buildWeeklyReflectionMessage(body: CoachRequest): string {
  const lines: string[] = ['## Reflexão Semanal'];

  if (body.goals && body.goals.length > 0) {
    lines.push('\n### Progresso das metas:');
    for (const g of body.goals) {
      const pct = g.q1_target > 0 ? Math.round((g.q1_actual / g.q1_target) * 100) : 0;
      lines.push(`- ${g.area}: ${g.title} — ${g.q1_actual}/${g.q1_target} ${g.unit} (${pct}%)`);
    }
  }

  if (body.tasks && body.tasks.length > 0) {
    const completed = body.tasks.filter(t => t.completed);
    lines.push(`\n### Tarefas da semana: ${completed.length}/${body.tasks.length} concluídas`);
    const deepCompleted = completed.filter(t => t.type === 'deep').length;
    const deepTotal = body.tasks.filter(t => t.type === 'deep').length;
    lines.push(`Deep work: ${deepCompleted}/${deepTotal} concluídas`);
  }

  if (body.context) {
    lines.push(`\nContexto: ${body.context}`);
  }

  lines.push('\nReflita sobre os padrões da minha semana e sugira ajustes para a próxima.');

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Configure ANTHROPIC_API_KEY no .env.local para ativar o coach' },
      { status: 200 }
    );
  }

  try {
    const body: CoachRequest = await request.json();

    let userMessage: string;

    switch (body.type) {
      case 'daily_plan_review':
        userMessage = buildDailyPlanReviewMessage(body);
        break;
      case 'accountability_check':
        userMessage = buildAccountabilityCheckMessage(body);
        break;
      case 'weekly_reflection':
        userMessage = buildWeeklyReflectionMessage(body);
        break;
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content[0];
    const message = textBlock.type === 'text' ? textBlock.text : '';

    return NextResponse.json({ message });
  } catch (error) {
    console.error('Coach API error:', error);
    return NextResponse.json({ error: 'Erro ao consultar o coach' }, { status: 500 });
  }
}
