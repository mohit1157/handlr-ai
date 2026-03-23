const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");
const platform = require("../platform");

const CREDS_PATH = path.join(config.DATA_DIR, "google_credentials.json");
const TOKEN_PATH = path.join(config.DATA_DIR, "google_token.json");

function getTimezone() {
  return platform.timezone;
}

function getAuth() {
  const { google } = require("googleapis");

  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error("Google Calendar not configured. Use configure_calendar first.");
  }

  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));

  if (creds.type === "service_account") {
    return new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
  }

  const { client_id, client_secret } = creds.installed || creds.web || creds;
  const auth = new google.auth.OAuth2(client_id, client_secret, "urn:ietf:wg:oauth:2.0:oob");

  if (fs.existsSync(TOKEN_PATH)) {
    auth.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));
  } else {
    throw new Error("Calendar OAuth not complete. Authorize via the URL provided by configure_calendar.");
  }

  return auth;
}

async function configureCalendar({ credentials_json }) {
  fs.mkdirSync(path.dirname(CREDS_PATH), { recursive: true });
  const creds = typeof credentials_json === "string" ? JSON.parse(credentials_json) : credentials_json;
  fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2));

  if (creds.installed || creds.web) {
    const { google } = require("googleapis");
    const { client_id, client_secret } = creds.installed || creds.web;
    const auth = new google.auth.OAuth2(client_id, client_secret, "urn:ietf:wg:oauth:2.0:oob");
    const url = auth.generateAuthUrl({ access_type: "offline", scope: ["https://www.googleapis.com/auth/calendar"] });
    return { success: true, message: "Credentials saved. Authorize at this URL:", authUrl: url };
  }

  return { success: true, message: "Service account credentials saved. Calendar ready." };
}

async function listEvents({ days, max_results }) {
  const { google } = require("googleapis");
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const now = new Date();
  const future = new Date(now.getTime() + (days || 7) * 86400000);

  const res = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    maxResults: max_results || 20,
    singleEvents: true,
    orderBy: "startTime",
  });

  return {
    timezone: getTimezone(),
    events: (res.data.items || []).map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      description: e.description,
      location: e.location,
      meetLink: e.hangoutLink || null,
      attendees: e.attendees?.map((a) => ({ email: a.email, status: a.responseStatus })),
    })),
  };
}

async function createEvent({ summary, description, start, end, attendees, generate_meet_link }) {
  const { google } = require("googleapis");
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const tz = getTimezone();

  const event = {
    summary,
    description,
    start: { dateTime: start, timeZone: tz },
    end: { dateTime: end, timeZone: tz },
  };

  if (attendees?.length) {
    event.attendees = attendees.map((e) => ({ email: e }));
  }

  // Google Meet link
  if (generate_meet_link) {
    event.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  const res = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    resource: event,
    conferenceDataVersion: generate_meet_link ? 1 : 0,
    sendUpdates: attendees?.length ? "all" : "none",
  });

  return {
    success: true,
    eventId: res.data.id,
    link: res.data.htmlLink,
    meetLink: res.data.hangoutLink || null,
  };
}

async function updateEvent({ event_id, summary, description, start, end, attendees }) {
  const { google } = require("googleapis");
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });
  const tz = getTimezone();

  const update = {};
  if (summary) update.summary = summary;
  if (description) update.description = description;
  if (start) update.start = { dateTime: start, timeZone: tz };
  if (end) update.end = { dateTime: end, timeZone: tz };
  if (attendees?.length) update.attendees = attendees.map((e) => ({ email: e }));

  const res = await calendar.events.patch({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    eventId: event_id,
    resource: update,
    sendUpdates: attendees?.length ? "all" : "none",
  });

  return { success: true, eventId: res.data.id };
}

async function deleteEvent({ event_id }) {
  const { google } = require("googleapis");
  const auth = getAuth();
  const calendar = google.calendar({ version: "v3", auth });

  await calendar.events.delete({
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
    eventId: event_id,
    sendUpdates: "all",
  });

  return { success: true, message: `Event ${event_id} deleted.` };
}

module.exports = { configureCalendar, listEvents, createEvent, updateEvent, deleteEvent };
