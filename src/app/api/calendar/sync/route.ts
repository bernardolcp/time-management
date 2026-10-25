import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getDb } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";

// Get RFC3339 timezone offset string (e.g., "-08:00") for a given IANA timezone
function getTzOffset(timezone: string, dateStr: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  });
  const parts = formatter.formatToParts(new Date(`${dateStr}T12:00:00Z`));
  const tz = parts.find((p) => p.type === "timeZoneName");
  if (!tz) return "+00:00";
  const match = tz.value.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : "+00:00";
}

export async function POST(request: NextRequest) {
  const gate = await requireApiUser();
  if (!gate.ok) return gate.response;

  const accessToken = (gate.session as { accessToken?: string }).accessToken;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  try {
    const dateParam = request.nextUrl.searchParams.get("date");
    const date = dateParam || (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    // Get user's timezone from Google Calendar settings
    const calSettings = await calendar.settings.get({ setting: "timezone" });
    const userTimezone = calSettings.data.value || "America/Los_Angeles";

    // Build timezone-aware time boundaries for the full day
    const offset = getTzOffset(userTimezone, date);
    const timeMin = `${date}T00:00:00${offset}`;
    const timeMax = `${date}T23:59:59${offset}`;

    // Fetch only calendars the user owns (primary + created by them)
    // Skips subscribed/read-only calendars (GSB clubs, event listings, etc.)
    const calendarList = await calendar.calendarList.list();
    const calendars = (calendarList.data.items || []).filter(
      (cal) => cal.accessRole === "owner" || cal.accessRole === "writer"
    );

    const allEvents: any[] = [];

    for (const cal of calendars) {
      if (!cal.id || cal.hidden) continue;

      try {
        const response = await calendar.events.list({
          calendarId: cal.id,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          timeZone: userTimezone,
        });

        for (const event of response.data.items || []) {
          // Skip events the user declined
          const self = event.attendees?.find((a) => a.self);
          if (self?.responseStatus === "declined") continue;

          allEvents.push(event);
        }
      } catch {
        // Some calendars may not be accessible — skip
      }
    }

    // Deduplicate by event ID (same event can appear in multiple calendars)
    const seen = new Set<string>();
    const uniqueEvents = allEvents.filter((event) => {
      const id = event.id || event.iCalUID || Math.random().toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Save to SQLite
    const db = getDb();
    db.prepare("DELETE FROM calendar_events WHERE date = ?").run(date);

    const insert = db.prepare(
      "INSERT OR IGNORE INTO calendar_events (id, title, start_time, end_time, date, all_day) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const syncedEvents = [];

    for (const event of uniqueEvents) {
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
