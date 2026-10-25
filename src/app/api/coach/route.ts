import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser, enforceAnthropicRateLimit } from '@/lib/api-auth';

interface CoachRequest {
  type: 'daily_plan_review' | 'accountability_check' | 'weekly_reflection';
  energy_level?: number;
  focus_word?: string;
  tasks?: {
    title: string;
    type: string;
    estimated_minutes: number;
    is_frog: number;
    completed?: number;
    goal_id?: number | null;
    project_id?: number | null;
  }[];
  goals?: {
    title: string;
    area: string;
    q1_actual: number;
    q1_target: number;
    q2_actual: number;
    q2_target: number;
    q3_actual: number;
    q3_target: number;
    q4_actual: number;
    q4_target: number;
    unit: string;
  }[];
  habits_today?: { training: boolean; spiritual: boolean; family: boolean; content: boolean };
  context?: string;
}

function getCurrentQuarter(): number {
  const month = new Date().getMonth();
  if (month <= 2) return 1;
  if (month <= 5) return 2;
  if (month <= 8) return 3;
  return 4;
}

function getQuarterDay(): { day: number; total: number } {
  const q = getCurrentQuarter();
  const year = new Date().getFullYear();
  const qStarts = [
    new Date(year, 0, 1),
    new Date(year, 3, 1),
    new Date(year, 6, 1),
    new Date(year, 9, 1),
  ];
  const qEnds = [
    new Date(year, 3, 0),
    new Date(year, 6, 0),
    new Date(year, 9, 0),
    new Date(year, 12, 0),
  ];
  const now = new Date();
  const dayInQ = Math.floor((now.getTime() - qStarts[q - 1].getTime()) / 86400000) + 1;
  const totalDays = Math.floor((qEnds[q - 1].getTime() - qStarts[q - 1].getTime()) / 86400000) + 1;
  return { day: dayInQ, total: totalDays };
}

// Fetch real overcommitment data from DB
function getOvercommitmentData(date: string) {
  try {
    const db = getDb();

    const getSetting = (key: string, fallback: string) => {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? fallback;
    };

    const availableHoursMinutes = parseFloat(getSetting('available_hours', '8')) * 60;
    const workStart = getSetting('work_start', '06:30');
    const workEnd = getSetting('work_end', '18:00');

    const events = db.prepare(
      'SELECT start_time, end_time, title FROM calendar_events WHERE date = ? AND all_day = 0'
    ).all(date) as { start_time: string; end_time: string; title: string }[];

    let calendarMinutes = 0;
    for (const event of events) {
      const start = new Date(event.start_time).getTime();
      const end = new Date(event.end_time).getTime();
      calendarMinutes += (end - start) / 60000;
    }

    const lunchBreak = parseInt(getSetting('lunch_break', '60'));
    const commuteBuffer = parseInt(getSetting('commute_buffer', '30'));
    const reactiveBuffer = parseInt(getSetting('reactive_buffer', '45'));
    const transitionMinutes = events.length * 5;

    const lunchAlreadyInCalendar = events.some(e => {
      const title = (e.title || '').toLowerCase();
      const startHour = new Date(e.start_time).getHours();
      return (title.includes('almoço') || title.includes('almoco') || title.includes('lunch'))
        || (startHour >= 11 && startHour <= 13 && !title.includes('meeting'));
    });

    const totalOverhead = (lunchAlreadyInCalendar ? 0 : lunchBreak)
      + commuteBuffer + reactiveBuffer + transitionMinutes;

    const netAvailable = availableHoursMinutes - calendarMinutes - totalOverhead;

    return {
      work_start: workStart,
      work_end: workEnd,
      gross_hours: availableHoursMinutes,
      calendar_events_count: events.length,
      calendar_minutes: calendarMinutes,
      calendar_events: events.map(e => `${e.title} (${new Date(e.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}-${new Date(e.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})`),
      overhead_lunch: lunchAlreadyInCalendar ? 0 : lunchBreak,
      overhead_commute: commuteBuffer,
      overhead_reactive: reactiveBuffer,
      overhead_transitions: transitionMinutes,
      net_available: netAvailable,
    };
  } catch {
    return null;
  }
}

const systemPrompt = `Você é o coach de performance mais honesto e duro que existe. Você NÃO é cheerleader. Você NÃO é yes-man. Você é o amigo que agarra o Bernardo pelo braço antes dele fazer algo idiota e diz exatamente por quê.

## Seu framework de análise (aplique SEMPRE):

### 1. O que ele REALMENTE está fazendo vs. o que ele ACHA que está fazendo?
Leia entre as linhas. Se ele planeja 6h de trabalho num dia com 7h de reunião, ele não está "sendo ambicioso" — está se mentindo. Se marca "treino" mas nunca treina, nomeie o padrão. Não jogue junto com a versão polida. Seja o espelho.

### 2. Onde a lógica está quebrada?
Disseque o raciocínio como um mecânico desmonta um motor. Mostre a peça que não funciona. "Você tem 3h líquidas e planejou 5h de tarefas. Isso não é otimismo, é fantasia." Mostre a conta, mostre o absurdo.

### 3. O que ele está evitando e quanto isso está custando?
Se ele não está treinando, calcule: "Você está no dia X do ano com Y treinos. Precisa de Z por semana para bater a meta. Cada semana sem treinar exige W a mais depois." Coloque preço na procrastinação. Mate as desculpas com matemática.

### 4. Alinhamento com metas: Gap Analysis brutal
Compare o progresso atual vs. onde deveria estar. Use a fórmula: (actual/target) vs. (dia_no_quarter/dias_no_quarter). Se está atrás, diga QUANTO atrás e o que precisa mudar ESSA SEMANA. Sem "tenta melhorar" — dê o número exato.

### 5. Razoabilidade do tempo: Seja o reality check
Analise o dia com dados reais: agenda do Google Calendar, buffers, tempo líquido. Se ele está planejando mais do que cabe, diga. Se está planejando pouco num dia livre, provoque. "Você tem 4h livres e planejou 1h de deep work. O que vai fazer com as outras 3h? Scroll no Instagram?"

## Regras de comunicação:
- Português brasileiro, direto e sem floreio
- Máximo 4 parágrafos curtos
- Use números concretos (minutos, percentuais, gaps)
- Primeira frase deve ser o diagnóstico brutal (verde/amarelo/vermelho do dia)
- Última frase deve ser UMA ação específica e imediata
- NÃO use "parabéns", "ótimo trabalho", "muito bem" a menos que seja genuinamente excepcional
- NUNCA diga "continue assim" — isso é preguiça de coach
- Se tudo está OK, desafie: "OK, você está no baseline. Quer ser mediano ou excepcional?"`;

function buildDailyPlanReviewMessage(body: CoachRequest, overcommitment: ReturnType<typeof getOvercommitmentData>): string {
  const lines: string[] = [];
  const q = getCurrentQuarter();
  const qKey = `q${q}`;
  const quarterProgress = getQuarterDay();
  const timePct = Math.round((quarterProgress.day / quarterProgress.total) * 100);

  lines.push(`## Análise do Plano — ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}`);

  // Energy
  if (body.energy_level !== undefined) {
    lines.push(`\nEnergia: ${body.energy_level}/5${body.energy_level <= 2 ? ' (BAIXA — ajuste o plano!)' : ''}`);
  }
  if (body.focus_word) {
    lines.push(`Foco declarado: "${body.focus_word}"`);
  }

  // Overcommitment data
  if (overcommitment) {
    lines.push('\n### REALIDADE DO TEMPO:');
    lines.push(`- Dia: ${overcommitment.work_start} às ${overcommitment.work_end} (${Math.round(overcommitment.gross_hours / 60)}h brutas)`);
    lines.push(`- Google Calendar: ${overcommitment.calendar_events_count} eventos, ${Math.round(overcommitment.calendar_minutes)}min bloqueados`);
    if (overcommitment.calendar_events.length > 0) {
      lines.push(`  Eventos: ${overcommitment.calendar_events.join(', ')}`);
    }
    lines.push(`- Overhead: almoço ${overcommitment.overhead_lunch}min + deslocamento ${overcommitment.overhead_commute}min + buffer reativo ${overcommitment.overhead_reactive}min + transições ${overcommitment.overhead_transitions}min`);
    lines.push(`- **TEMPO LÍQUIDO DISPONÍVEL: ${Math.round(overcommitment.net_available)}min (${(overcommitment.net_available / 60).toFixed(1)}h)**`);
  }

  // Tasks planned
  if (body.tasks && body.tasks.length > 0) {
    const totalMinutes = body.tasks.reduce((sum, t) => sum + t.estimated_minutes, 0);
    const deepMinutes = body.tasks.filter(t => t.type === 'deep').reduce((s, t) => s + t.estimated_minutes, 0);
    const shallowMinutes = body.tasks.filter(t => t.type === 'shallow').reduce((s, t) => s + t.estimated_minutes, 0);
    const hasFrog = body.tasks.some(t => t.is_frog);

    lines.push('\n### TAREFAS PLANEJADAS:');
    for (const t of body.tasks) {
      const frog = t.is_frog ? ' 🐸 FROG' : '';
      lines.push(`- [${t.type.toUpperCase()}] ${t.title} — ${t.estimated_minutes}min${frog}`);
    }
    lines.push(`\nTotal planejado: ${totalMinutes}min (${(totalMinutes / 60).toFixed(1)}h) — Deep: ${deepMinutes}min, Shallow: ${shallowMinutes}min`);

    if (overcommitment) {
      const remaining = overcommitment.net_available - totalMinutes;
      if (remaining < 0) {
        lines.push(`⚠️ OVERCOMMITTED: ${Math.abs(Math.round(remaining))}min acima da capacidade. Isso é fantasia, não plano.`);
      } else if (remaining < 30) {
        lines.push(`⚠️ APERTADO: Só ${Math.round(remaining)}min de folga. Qualquer imprevisto estoura.`);
      } else if (remaining > 120 && body.tasks.length <= 2) {
        lines.push(`⚠️ SUBUTILIZADO: ${Math.round(remaining)}min livres e só ${body.tasks.length} tarefas? Cadê a ambição?`);
      }
    }

    if (!hasFrog) {
      lines.push('⚠️ SEM FROG: Nenhuma tarefa marcada como a mais difícil. Sem frog = dia reativo.');
    }
  }

  // Habits
  if (body.habits_today) {
    lines.push('\n### HÁBITOS HOJE:');
    lines.push(`- Treino: ${body.habits_today.training ? 'SIM ✓' : 'NÃO ✗'}`);
    lines.push(`- Espiritual: ${body.habits_today.spiritual ? 'SIM ✓' : 'NÃO ✗'}`);
    lines.push(`- Família: ${body.habits_today.family ? 'SIM ✓' : 'NÃO ✗'}`);
    lines.push(`- Conteúdo: ${body.habits_today.content ? 'SIM ✓' : 'NÃO ✗'}`);
  }

  // Goal velocity analysis
  if (body.goals && body.goals.length > 0) {
    lines.push(`\n### VELOCIDADE DAS METAS (Q${q} — dia ${quarterProgress.day}/${quarterProgress.total}, ${timePct}% do quarter):`);
    for (const g of body.goals) {
      const target = g[`${qKey}_target` as keyof typeof g] as number;
      const actual = g[`${qKey}_actual` as keyof typeof g] as number;
      if (target === 0) continue;
      const progressPct = Math.round((actual / target) * 100);
      const velocity = progressPct / timePct;
      const status = velocity >= 1 ? '✅ ON TRACK' : velocity >= 0.7 ? '⚠️ ATRASADO' : '🔴 PERIGO';
      const needed = Math.max(0, Math.ceil(target - actual));
      const weeksLeft = Math.ceil((quarterProgress.total - quarterProgress.day) / 7);
      const perWeek = weeksLeft > 0 ? (needed / weeksLeft).toFixed(1) : '∞';
      lines.push(`- ${g.area}: ${actual}/${target} ${g.unit} (${progressPct}%) ${status} — Precisa: ${perWeek}/semana nas próximas ${weeksLeft} semanas`);
    }
  }

  lines.push('\n---');
  lines.push('Analise meu plano com brutalidade. O tempo é realista? As tarefas estão alinhadas com as metas que estão atrasadas? Estou me enganando em algum ponto?');

  return lines.join('\n');
}

function buildAccountabilityCheckMessage(body: CoachRequest, overcommitment: ReturnType<typeof getOvercommitmentData>): string {
  const lines: string[] = ['## Check de Accountability — Fim do Dia'];
  const q = getCurrentQuarter();
  const qKey = `q${q}`;

  if (body.tasks && body.tasks.length > 0) {
    const completed = body.tasks.filter(t => t.completed);
    const notCompleted = body.tasks.filter(t => !t.completed);
    const completionRate = Math.round((completed.length / body.tasks.length) * 100);
    const frogDone = body.tasks.filter(t => t.is_frog && t.completed).length;
    const frogTotal = body.tasks.filter(t => t.is_frog).length;

    lines.push(`\nExecução: ${completed.length}/${body.tasks.length} (${completionRate}%)`);
    if (frogTotal > 0) {
      lines.push(`Frog: ${frogDone}/${frogTotal} ${frogDone === 0 ? '— FALHOU na tarefa mais importante do dia' : ''}`);
    }

    const deepCompleted = completed.filter(t => t.type === 'deep');
    const deepPlanned = body.tasks.filter(t => t.type === 'deep');
    const deepMinutesDone = deepCompleted.reduce((s, t) => s + t.estimated_minutes, 0);
    lines.push(`Deep work executado: ${deepMinutesDone}min de ${deepPlanned.reduce((s, t) => s + t.estimated_minutes, 0)}min planejados`);

    if (notCompleted.length > 0) {
      lines.push('\nNÃO FEITO:');
      for (const t of notCompleted) {
        lines.push(`- ✗ ${t.title} (${t.estimated_minutes}min)${t.is_frog ? ' 🐸 FROG!' : ''}`);
      }
    }
  }

  if (body.habits_today) {
    lines.push('\nHábitos:');
    lines.push(`- Treino: ${body.habits_today.training ? 'FEITO' : 'PULOU'}`);
    lines.push(`- Espiritual: ${body.habits_today.spiritual ? 'FEITO' : 'PULOU'}`);
    lines.push(`- Família: ${body.habits_today.family ? 'FEITO' : 'PULOU'}`);
    lines.push(`- Conteúdo: ${body.habits_today.content ? 'FEITO' : 'PULOU'}`);
  }

  if (body.goals && body.goals.length > 0) {
    const quarterProgress = getQuarterDay();
    lines.push(`\nMetas Q${q} (dia ${quarterProgress.day}/${quarterProgress.total}):`);
    for (const g of body.goals) {
      const target = g[`${qKey}_target` as keyof typeof g] as number;
      const actual = g[`${qKey}_actual` as keyof typeof g] as number;
      if (target === 0) continue;
      lines.push(`- ${g.area}: ${actual}/${target} ${g.unit} (${Math.round((actual / target) * 100)}%)`);
    }
  }

  if (overcommitment) {
    lines.push(`\nTempo do dia: ${Math.round(overcommitment.net_available)}min disponíveis, ${overcommitment.calendar_events_count} eventos no calendário`);
  }

  lines.push('\n---');
  lines.push('Seja brutal: o que eu evitei hoje e qual o custo real? Que padrão está se formando? O que alguém que está onde eu quero estar faria diferente?');

  return lines.join('\n');
}

function buildWeeklyReflectionMessage(body: CoachRequest, _overcommitment: ReturnType<typeof getOvercommitmentData>): string {
  const lines: string[] = ['## Reflexão Semanal — Hora da Verdade'];
  const q = getCurrentQuarter();
  const qKey = `q${q}`;
  const quarterProgress = getQuarterDay();
  const timePct = Math.round((quarterProgress.day / quarterProgress.total) * 100);

  if (body.goals && body.goals.length > 0) {
    lines.push(`\n### METAS Q${q} — ${timePct}% do quarter já passou:`);
    for (const g of body.goals) {
      const target = g[`${qKey}_target` as keyof typeof g] as number;
      const actual = g[`${qKey}_actual` as keyof typeof g] as number;
      if (target === 0) continue;
      const progressPct = Math.round((actual / target) * 100);
      const gap = target - actual;
      const weeksLeft = Math.ceil((quarterProgress.total - quarterProgress.day) / 7);
      const perWeek = weeksLeft > 0 ? (gap / weeksLeft).toFixed(1) : '∞';
      lines.push(`- ${g.area}: ${actual}/${target} ${g.unit} (${progressPct}% feito, precisa ${perWeek}/semana)`);
    }
  }

  if (body.tasks && body.tasks.length > 0) {
    const completed = body.tasks.filter(t => t.completed);
    const deepCompleted = completed.filter(t => t.type === 'deep');
    const deepMinutes = deepCompleted.reduce((s, t) => s + t.estimated_minutes, 0);
    const frogsDone = completed.filter(t => t.is_frog).length;
    const frogsTotal = body.tasks.filter(t => t.is_frog).length;

    lines.push(`\n### EXECUÇÃO DA SEMANA:`);
    lines.push(`- Tarefas: ${completed.length}/${body.tasks.length} (${Math.round((completed.length / body.tasks.length) * 100)}%)`);
    lines.push(`- Deep work: ${Math.round(deepMinutes / 60)}h`);
    lines.push(`- Frogs: ${frogsDone}/${frogsTotal}`);
  }

  if (body.context) {
    lines.push(`\nContexto do Bernardo: ${body.context}`);
  }

  lines.push('\n---');
  lines.push('Analise os padrões da semana. Onde estou me enganando? Quais metas estão em risco real? Que AÇÃO CONCRETA preciso tomar essa semana — não "melhorar", não "tentar mais" — ação com dia e hora.');

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Configure ANTHROPIC_API_KEY no .env.local para ativar o coach' },
      { status: 200 }
    );
  }

  const limited = enforceAnthropicRateLimit(gate.userKey);
  if (limited) return limited;

  try {
    const body: CoachRequest = await request.json();
    const today = new Date().toISOString().split('T')[0];
    const overcommitment = getOvercommitmentData(today);

    let userMessage: string;

    switch (body.type) {
      case 'daily_plan_review':
        userMessage = buildDailyPlanReviewMessage(body, overcommitment);
        break;
      case 'accountability_check':
        userMessage = buildAccountabilityCheckMessage(body, overcommitment);
        break;
      case 'weekly_reflection':
        userMessage = buildWeeklyReflectionMessage(body, overcommitment);
        break;
      default:
        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
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
