import { google } from 'googleapis';
import { query } from '../config/database.js';
import crypto from 'crypto';

async function getSetting(key) {
  const result = await query(
    'SELECT setting_value FROM system_settings WHERE setting_key = $1',
    [key]
  );
  return result.rows[0]?.setting_value || null;
}

async function setSetting(key, value, type = 'text') {
  const existing = await query(
    'SELECT id FROM system_settings WHERE setting_key = $1',
    [key]
  );
  if (existing.rows.length > 0) {
    await query(
      'UPDATE system_settings SET setting_value = $1 WHERE setting_key = $2',
      [value, key]
    );
  } else {
    await query(
      'INSERT INTO system_settings (setting_key, setting_value, setting_type) VALUES ($1, $2, $3)',
      [key, value, type]
    );
  }
}

function getRedirectUri() {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}/api/functions/google-calendar/callback`;
  }
  const appUrl = process.env.APP_URL || 'http://localhost:3001';
  return `${appUrl}/api/functions/google-calendar/callback`;
}

export async function getOAuth2Client() {
  const clientId = await getSetting('google_calendar_client_id');
  const clientSecret = await getSetting('google_calendar_client_secret');

  if (!clientId || !clientSecret) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
  return oauth2Client;
}

export async function getAuthUrl() {
  const oauth2Client = await getOAuth2Client();
  if (!oauth2Client) {
    throw new Error('Google Calendar não configurado. Defina Client ID e Client Secret nas configurações.');
  }

  const state = crypto.randomBytes(32).toString('hex');
  await setSetting('google_calendar_oauth_state', state);

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state,
  });

  return url;
}

export async function validateOAuthState(state) {
  const stored = await getSetting('google_calendar_oauth_state');
  if (!stored || stored !== state) {
    return false;
  }
  await setSetting('google_calendar_oauth_state', '');
  return true;
}

export async function handleCallback(code) {
  const oauth2Client = await getOAuth2Client();
  if (!oauth2Client) {
    throw new Error('Google Calendar não configurado.');
  }

  const { tokens } = await oauth2Client.getToken(code);

  await setSetting('google_calendar_access_token', tokens.access_token);
  if (tokens.refresh_token) {
    await setSetting('google_calendar_refresh_token', tokens.refresh_token);
  }
  if (tokens.expiry_date) {
    await setSetting('google_calendar_token_expiry', String(tokens.expiry_date));
  }
  await setSetting('google_calendar_connected', 'true');

  return tokens;
}

export async function getAuthenticatedClient() {
  const oauth2Client = await getOAuth2Client();
  if (!oauth2Client) return null;

  const accessToken = await getSetting('google_calendar_access_token');
  const refreshToken = await getSetting('google_calendar_refresh_token');
  const expiry = await getSetting('google_calendar_token_expiry');

  if (!accessToken || !refreshToken) return null;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiry ? parseInt(expiry) : undefined,
  });

  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await setSetting('google_calendar_access_token', tokens.access_token);
    }
    if (tokens.expiry_date) {
      await setSetting('google_calendar_token_expiry', String(tokens.expiry_date));
    }
  });

  return oauth2Client;
}

export async function getCalendarEvents(timeMin, timeMax) {
  const auth = await getAuthenticatedClient();
  if (!auth) return [];

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax,
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Error fetching Google Calendar events:', error.message);
    if (error.code === 401) {
      await setSetting('google_calendar_connected', 'false');
    }
    return [];
  }
}

export async function createCalendarEvent(activity) {
  const auth = await getAuthenticatedClient();
  if (!auth) return null;

  const scheduledAt = new Date(activity.scheduled_at || activity.scheduledAt);
  if (isNaN(scheduledAt.getTime())) {
    throw new Error('Data de agendamento inválida');
  }

  const calendar = google.calendar({ version: 'v3', auth });
  const endTime = new Date(scheduledAt.getTime() + 60 * 60 * 1000);

  const typeLabels = {
    visit: 'Visita',
    call: 'Ligação',
    whatsapp: 'WhatsApp',
    email: 'E-mail',
    task: 'Tarefa',
    meeting: 'Reunião',
  };

  const event = {
    summary: `[SalesTwo] ${typeLabels[activity.type] || activity.type}: ${activity.title || activity.description || 'Atividade'}`,
    description: activity.description || '',
    start: {
      dateTime: scheduledAt.toISOString(),
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'America/Sao_Paulo',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    return response.data;
  } catch (error) {
    console.error('Error creating Google Calendar event:', error.message);
    return null;
  }
}

export async function deleteCalendarEvent(eventId) {
  const auth = await getAuthenticatedClient();
  if (!auth) return false;

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
    });
    return true;
  } catch (error) {
    console.error('Error deleting Google Calendar event:', error.message);
    return false;
  }
}

export async function syncActivitiesToGoogle() {
  const auth = await getAuthenticatedClient();
  if (!auth) return { synced: 0, errors: 0 };

  const activitiesResult = await query(`
    SELECT ap.*, lp.company_name 
    FROM activities_pj ap 
    LEFT JOIN leads_pj lp ON ap.lead_id = lp.id 
    WHERE ap.scheduled_at IS NOT NULL 
    AND ap.completed = false 
    AND ap.google_event_id IS NULL
    AND ap.scheduled_at > NOW() - INTERVAL '1 day'
    ORDER BY ap.scheduled_at ASC
    LIMIT 50
  `);

  let synced = 0;
  let errors = 0;

  for (const activity of activitiesResult.rows) {
    try {
      const event = await createCalendarEvent({
        ...activity,
        title: activity.description,
        description: activity.company_name
          ? `Lead: ${activity.company_name}\n${activity.description || ''}`
          : activity.description,
      });

      if (event && event.id) {
        await query(
          'UPDATE activities_pj SET google_event_id = $1 WHERE id = $2',
          [event.id, activity.id]
        );
        synced++;
      }
    } catch (err) {
      console.error(`Error syncing activity ${activity.id}:`, err.message);
      errors++;
    }
  }

  return { synced, errors };
}

export async function getConnectionStatus() {
  const connected = await getSetting('google_calendar_connected');
  const clientId = await getSetting('google_calendar_client_id');
  const clientSecret = await getSetting('google_calendar_client_secret');

  return {
    configured: !!(clientId && clientSecret),
    connected: connected === 'true',
    hasCredentials: !!(clientId && clientSecret),
  };
}

export async function disconnect() {
  await setSetting('google_calendar_connected', 'false');
  await setSetting('google_calendar_access_token', '');
  await setSetting('google_calendar_refresh_token', '');
  await setSetting('google_calendar_token_expiry', '');
  return true;
}
