import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const date = request.nextUrl.searchParams.get("date");

    if (!date) {
      return NextResponse.json(
        { error: "date query param is required" },
        { status: 400 }
      );
    }

    const events = db
      .prepare("SELECT * FROM calendar_events WHERE date = ? ORDER BY start_time")
      .all(date);

    return NextResponse.json({ events });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to fetch calendar events" },
      { status: 500 }
    );
  }
}
