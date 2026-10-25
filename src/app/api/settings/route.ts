import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireApiUser } from '@/lib/api-auth';

export async function GET() {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return NextResponse.json(settings);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const body = await request.json();

    const upsert = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?'
    );

    const entries = Object.entries(body);
    const transaction = db.transaction(() => {
      for (const [key, value] of entries) {
        upsert.run(key, String(value), String(value));
      }
    });
    transaction();

    // Return updated settings
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return NextResponse.json(settings);
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
