import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';

export async function GET() {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const projects = db.prepare('SELECT * FROM projects WHERE active = 1 ORDER BY sort_order ASC').all();
    return NextResponse.json(projects);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const body = await request.json();
    const { name } = body;
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM projects').get() as { m: number };
    const result = db.prepare('INSERT INTO projects (name, sort_order) VALUES (?, ?)').run(name, (maxOrder.m || 0) + 1);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(project);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
