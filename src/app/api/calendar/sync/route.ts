import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session || !(session as any).accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const accessToken = (session as any).accessToken as string;

    // Get date from query param or default to today
    const dateParam = request.nextUrl.searchParams.get("date");
    const date = dateParam || new Date().toISOString().split("T")[0];

    // Create OAuth2 client with the user's access token
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Fetch events for the given day
    const timeMin = new Date(`${date}T00:00:00Z`).toISOString();
    const timeMax = new Date(`${date}T23:59:59Z`).toISOString();

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];

    // Save to SQLite
    const db = getDb();

    // Delete existing events for this date
    db.prepare("DELETE FROM calendar_events WHERE date = ?").run(date);

    // Insert each event
    const insert = db.prepare(
      "INSERT INTO calendar_events (id, title, start_time, end_time, date, all_day) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const syncedEvents = [];

    for (const event of events) {
      const allDay = !!event.start?.date;
      const startTime = event.start?.dateTime || event.start?.date || "";
      const endTime = event.end?.dateTime || event.end?.date || "";

      insert.run(
        event.id,
        event.summary || "(No title)",
        startTime,
        endTime,
        date,
        allDay ? 1 : 0
      );

      syncedEvents.push({
        id: event.id,
        title: event.summary || "(No title)",
        start_time: startTime,
        end_time: endTime,
        date,
        all_day: allDay,
      });
    }

    return NextResponse.json({
      synced: syncedEvents.length,
      events: syncedEvents,
    });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to sync calendar" },
      { status: 500 }
    );
  }
}
