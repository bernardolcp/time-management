import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const fields = Object.keys(body);
    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const sets = fields.map((f) => `${f} = ?`).join(', ');
    const values = fields.map((f) => body[f]);

    db.prepare(`UPDATE behaviors SET ${sets} WHERE id = ?`).run(...values, id);
    const behavior = db.prepare('SELECT * FROM behaviors WHERE id = ?').get(id);

    if (!behavior) {
      return NextResponse.json({ error: 'Behavior not found' }, { status: 404 });
    }
    return NextResponse.json(behavior);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to update behavior' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const result = db.prepare('DELETE FROM behaviors WHERE id = ?').run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: 'Behavior not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to delete behavior' }, { status: 500 });
  }
}
