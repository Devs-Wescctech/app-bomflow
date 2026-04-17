import { google } from 'googleapis';
import { query } from '../config/database.js';
import crypto from 'crypto';
import { encrypt, decrypt } from '../utils/cryptoTokens.js';

// OAuth scope (Phase 1.2) — minimum privilege: events only.
// Tokens granted before this change carry the legacy scope
// 'https://www.googleapis.com/auth/calendar' (broader). The
// `granted_scope` column on google_calendar_tokens lets the UI
// detect outdated grants and prompt reconnection.
export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const GCAL_LEGACY_SCOPE = 'https://www.googleapis.com/auth/calendar';

function isConfiguredViaEnv() {
  return !!(process.env.GCAL_CLIENT_ID && process.env.GCAL_CLIENT_SECRET && process.env.GCAL_REDIRECT_URI);
}

function getOAuth2Client() {
  const clientId = process.env.GCAL_CLIENT_ID;
  const clientSecret = process.env.GCAL_CLIENT_SECRET;
  const redirectUri = process.env.GCAL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const missing = [
      !clientId && 'GCAL_CLIENT_ID',
      !clientSecret && 'GCAL_CLIENT_SECRET',
      !redirectUri && 'GCAL_REDIRECT_URI',
    ].filter(Boolean).join(', ');
    console.error(`[GCal] ${missing} not configured. Set in environment variables.`);
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

async function getAuthenticatedClient(agentId) {
  const oauth2 = getOAuth2Client();
  if (!oauth2) return null;

  const result = await query(
    'SELECT * FROM google_calendar_tokens WHERE agent_id = $1',
    [agentId]
  );
  const tokenRow = result.rows[0];
  if (!tokenRow) return null;

  let accessTokenPlain;
  let refreshTokenPlain;
  try {
    accessTokenPlain = decrypt(tokenRow.access_token);
    refreshTokenPlain = decrypt(tokenRow.refresh_token);
  } catch (err) {
    console.error('[GCal] Failed to decrypt token for agent', agentId, '-', err.message);
    return null;
  }

  oauth2.setCredentials({
    access_token: accessTokenPlain,
    refresh_token: refreshTokenPlain,
    expiry_date: tokenRow.token_expiry ? new Date(tokenRow.token_expiry).getTime() : undefined,
  });

  oauth2.on('tokens', async (tokens) => {
    try {
      const updates = [];
      const values = [];
      let idx = 1;
      if (tokens.access_token) {
        updates.push(`access_token = $${idx++}`);
        values.push(encrypt(tokens.access_token));
      }
      if (tokens.expiry_date) {
        updates.push(`token_expiry = $${idx++}`);
        values.push(new Date(tokens.expiry_date).toISOString());
      }
      updates.push(`updated_at = NOW()`);
      values.push(agentId);
      await query(
        `UPDATE google_calendar_tokens SET ${updates.join(', ')} WHERE agent_id = $${idx}`,
        values
      );
    } catch (err) {
      console.error('[GCal] Error refreshing token:', err.message);
    }
  });

  return oauth2;
}

export async function getAuthUrl(agentId) {
  const oauth2 = getOAuth2Client();
  if (!oauth2) throw new Error('Google Calendar não configurado no servidor. Contate o administrador (variáveis GCAL_CLIENT_ID, GCAL_CLIENT_SECRET, GCAL_REDIRECT_URI).');

  const state = crypto.randomBytes(20).toString('hex') + ':' + agentId;

  await query(
    `INSERT INTO system_settings (id, setting_key, setting_value)
     VALUES (uuid_generate_v4(), 'gcal_oauth_state_' || $1, $2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2`,
    [agentId, state]
  );

  // 'openid' + 'email' are the minimum complementary scopes needed to
  // obtain the user's email via OAuth2 userinfo (used to display which
  // Google account is connected). They do NOT grant access to mail or
  // any additional calendar data. The reduced 'calendar.events' scope
  // remains the only data-access scope.
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GCAL_SCOPE, 'openid', 'email'],
    state: state,
  });
}

export async function validateOAuthState(state) {
  const agentId = state.split(':').pop();
  const result = await query(
    'SELECT setting_value FROM system_settings WHERE setting_key = $1',
    ['gcal_oauth_state_' + agentId]
  );
  const stored = result.rows[0]?.setting_value;
  if (stored === state) {
    await query('DELETE FROM system_settings WHERE setting_key = $1', ['gcal_oauth_state_' + agentId]);
    return agentId;
  }
  return null;
}

export async function handleCallback(code, agentId) {
  const oauth2 = getOAuth2Client();
  if (!oauth2) throw new Error('Google Calendar não configurado no servidor');

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Try to read the user's email via OAuth2 userinfo. The reduced scope
  // (calendar.events) does NOT include calendarList.get, so we fall back
  // to OAuth2 v2 userinfo (covered by 'openid'/'email') and finally to
  // the JWT id_token if present. May be null — UI handles it gracefully.
  let calendarEmail = null;
  try {
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const userInfo = await oauth2Api.userinfo.get();
    calendarEmail = userInfo.data.email || null;
  } catch {
    // userinfo requires email/openid scope; skip silently if not granted.
  }

  const grantedScope = tokens.scope || null;
  const encAccess = encrypt(tokens.access_token);
  const encRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  if (encRefresh) {
    await query(
      `INSERT INTO google_calendar_tokens (id, agent_id, access_token, refresh_token, token_expiry, calendar_email, granted_scope)
       VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (agent_id) DO UPDATE SET
         access_token = $2, refresh_token = $3, token_expiry = $4, calendar_email = $5, granted_scope = $6, updated_at = NOW()`,
      [
        agentId,
        encAccess,
        encRefresh,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        calendarEmail,
        grantedScope,
      ]
    );
  } else {
    await query(
      `INSERT INTO google_calendar_tokens (id, agent_id, access_token, refresh_token, token_expiry, calendar_email, granted_scope)
       VALUES (uuid_generate_v4(), $1, $2, '', $3, $4, $5)
       ON CONFLICT (agent_id) DO UPDATE SET
         access_token = $2, token_expiry = $3, calendar_email = $4, granted_scope = $5, updated_at = NOW()`,
      [
        agentId,
        encAccess,
        tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        calendarEmail,
        grantedScope,
      ]
    );
  }

  return { success: true, email: calendarEmail, grantedScope };
}

export async function disconnectAgent(agentId) {
  // Phase 3.2 — Revoke at Google before purging local state.
  // We must revoke even when the local DELETE will succeed, so a leaked
  // or cached refresh_token can no longer be used to mint access tokens.
  // Failures here (already-invalid token, network issue) must NOT block
  // the local removal; we log and continue.
  let revoked = false;
  let revokeError = null;
  try {
    const tokenResult = await query(
      'SELECT refresh_token FROM google_calendar_tokens WHERE agent_id = $1',
      [agentId]
    );
    const tokenRow = tokenResult.rows[0];
    if (tokenRow?.refresh_token) {
      let refreshTokenPlain;
      try {
        refreshTokenPlain = decrypt(tokenRow.refresh_token);
      } catch (decErr) {
        console.warn(`[GCal] Could not decrypt refresh_token for agent ${agentId} during revoke: ${decErr.message}`);
      }
      if (refreshTokenPlain) {
        const oauth2 = getOAuth2Client();
        if (oauth2) {
          try {
            await oauth2.revokeToken(refreshTokenPlain);
            revoked = true;
            console.log(`[GCal] Revoked Google OAuth token for agent ${agentId}.`);
          } catch (revErr) {
            // Common cases: invalid_token (already revoked), network error.
            revokeError = revErr.message || String(revErr);
            console.warn(`[GCal] revokeToken for agent ${agentId} failed (proceeding with local delete): ${revokeError}`);
          }
        }
      }
    }
  } catch (err) {
    revokeError = err.message || String(err);
    console.warn(`[GCal] Unable to look up token for revoke (agent ${agentId}): ${revokeError}`);
  }

  await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
  // Drain any pending outbox entries for this agent — there is no longer
  // a valid token, so further attempts would only fail and noise up the UI.
  await query("DELETE FROM gcal_event_outbox WHERE agent_id = $1 AND status IN ('pending','failed','processing')", [agentId]);

  return { success: true, revoked, revokeError };
}

function isScopeOutdated(grantedScope) {
  if (!grantedScope) return true;
  // Scope strings from Google are space-separated. We require calendar.events;
  // the legacy 'calendar' scope (broader) does NOT satisfy this because Google
  // returns the exact scope the user consented to. Flag as outdated whenever
  // the canonical 'calendar.events' string is missing.
  const scopes = grantedScope.split(/\s+/);
  return !scopes.includes(GCAL_SCOPE);
}

export async function getAgentConnectionStatus(agentId) {
  const configured = isConfiguredViaEnv();

  const result = await query(
    'SELECT calendar_email, last_sync_at, granted_scope FROM google_calendar_tokens WHERE agent_id = $1',
    [agentId]
  );
  const tokenRow = result.rows[0];

  return {
    configured,
    connected: configured && !!tokenRow,
    calendarEmail: tokenRow?.calendar_email || null,
    lastSync: tokenRow?.last_sync_at || null,
    grantedScope: tokenRow?.granted_scope || null,
    scopeOutdated: tokenRow ? isScopeOutdated(tokenRow.granted_scope) : false,
    requiredScope: GCAL_SCOPE,
  };
}

export async function getConnectionStatus() {
  return {
    configured: isConfiguredViaEnv(),
    connected: false,
    requiredScope: GCAL_SCOPE,
  };
}

const ACTIVITY_TYPE_LABELS = {
  visit: 'Visita', call: 'Ligação', whatsapp: 'WhatsApp',
  email: 'E-mail', task: 'Tarefa', meeting: 'Reunião',
};

function activityToGCalEvent(activity) {
  const scheduledAt = new Date(activity.scheduled_at);
  if (isNaN(scheduledAt.getTime())) return null;

  const endTime = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
  const typeLabel = ACTIVITY_TYPE_LABELS[activity.type] || activity.type || 'Atividade';

  return {
    summary: `[SalesTwo] ${typeLabel}: ${activity.description || 'Atividade'}`,
    description: `Tipo: ${typeLabel}\n${activity.description || ''}\n\nCriado pelo SalesTwo`,
    start: { dateTime: scheduledAt.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: endTime.toISOString(), timeZone: 'America/Sao_Paulo' },
    colorId: activity.type === 'visit' ? '2' : activity.type === 'call' ? '7' : '9',
  };
}

/**
 * Create an event in Google Calendar.
 *
 * Phase 2.1+: this function NO LONGER persists `google_event_id` on the
 * activity row. That responsibility belongs to gcalOutboxWorker, which
 * updates the activity only after this function returns successfully.
 *
 * @returns {Promise<{id:string}>} on success
 * @throws  {Error}                on Google API failure (worker handles retry)
 */
export async function createGoogleEvent(agentId, activity) {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    const err = new Error('Agent not connected to Google Calendar');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const event = activityToGCalEvent(activity);
  if (!event) {
    const err = new Error('Activity has invalid scheduled_at');
    err.code = 'INVALID_PAYLOAD';
    throw err;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    console.log(`[GCal] Event created: ${result.data.id} for activity ${activity.id}`);
    return { id: result.data.id };
  } catch (error) {
    if (error.code === 401) {
      await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
    }
    throw error;
  }
}

export async function updateGoogleEvent(agentId, googleEventId, activity) {
  if (!googleEventId) {
    const err = new Error('Missing googleEventId for update');
    err.code = 'MISSING_EVENT_ID';
    throw err;
  }
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    const err = new Error('Agent not connected to Google Calendar');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const event = activityToGCalEvent(activity);
  if (!event) {
    const err = new Error('Activity has invalid scheduled_at');
    err.code = 'INVALID_PAYLOAD';
    throw err;
  }

  if (activity.completed) {
    event.summary = `✅ ${event.summary}`;
    event.colorId = '8';
  }

  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  await calendar.events.update({
    calendarId: 'primary',
    eventId: googleEventId,
    requestBody: event,
  });
  console.log(`[GCal] Event updated: ${googleEventId}`);
  return true;
}

export async function deleteGoogleEvent(agentId, googleEventId) {
  if (!googleEventId) return true; // nothing to delete is success
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    const err = new Error('Agent not connected to Google Calendar');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
    });
    console.log(`[GCal] Event deleted: ${googleEventId}`);
    return true;
  } catch (error) {
    // 404/410 means the event is already gone — treat as success (idempotent).
    if (error.code === 404 || error.code === 410) {
      console.log(`[GCal] Event ${googleEventId} already absent (${error.code}) — treating as deleted.`);
      return true;
    }
    throw error;
  }
}

export async function fetchGoogleEvents(agentId, timeMin, timeMax) {
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) return [];

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });
    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || undefined,
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return result.data.items || [];
  } catch (error) {
    console.error('[GCal] Error fetching events:', error.message);
    if (error.code === 401) {
      await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
    }
    return [];
  }
}

export async function fetchGoogleEventsMultiAgent(agentIds, timeMin, timeMax) {
  const allEvents = [];
  for (const agentId of agentIds) {
    try {
      const events = await fetchGoogleEvents(agentId, timeMin, timeMax);
      const agentResult = await query('SELECT name FROM agents WHERE id = $1', [agentId]);
      const agentName = agentResult.rows[0]?.name || 'Desconhecido';
      events.forEach(ev => {
        ev._agentId = agentId;
        ev._agentName = agentName;
      });
      allEvents.push(...events);
    } catch (err) {
      console.error(`[GCal] Error fetching events for agent ${agentId}:`, err.message);
    }
  }
  return allEvents;
}

export async function getConnectedAgentIds() {
  const result = await query('SELECT agent_id FROM google_calendar_tokens');
  return result.rows.map(r => r.agent_id);
}

export async function syncGoogleToSalesTwo(agentId) {
  console.log('[GCal Sync] Starting sync from Google for agent', agentId);
  const oauth2 = await getAuthenticatedClient(agentId);
  if (!oauth2) {
    console.log('[GCal Sync] No OAuth2 client for agent', agentId);
    return { synced: 0, error: 'Não conectado' };
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2 });

    const now = new Date();
    const threeMonthsAhead = new Date(now);
    threeMonthsAhead.setMonth(threeMonthsAhead.getMonth() + 3);

    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: threeMonthsAhead.toISOString(),
      maxResults: 200,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = result.data.items || [];
    let synced = 0;

    for (const event of events) {
      if (!event.summary || event.summary.startsWith('[SalesTwo]')) continue;

      const existing = await query(
        'SELECT id FROM activities_pj WHERE google_event_id = $1',
        [event.id]
      );
      if (existing.rows.length > 0) continue;

      const startDateTime = event.start?.dateTime || event.start?.date;
      if (!startDateTime) continue;

      let actType = 'meeting';
      const lowerSummary = (event.summary || '').toLowerCase();
      if (lowerSummary.includes('ligação') || lowerSummary.includes('call') || lowerSummary.includes('ligar')) actType = 'call';
      else if (lowerSummary.includes('visita') || lowerSummary.includes('visit')) actType = 'visit';
      else if (lowerSummary.includes('email') || lowerSummary.includes('e-mail')) actType = 'email';
      else if (lowerSummary.includes('whatsapp') || lowerSummary.includes('wpp')) actType = 'whatsapp';
      else if (lowerSummary.includes('tarefa') || lowerSummary.includes('task')) actType = 'task';

      const existingCheck = await query(
        `SELECT id FROM activities_pj WHERE google_event_id = $1`,
        [event.id]
      );
      if (existingCheck.rows.length > 0) {
        console.log('[GCal Sync] Event already synced, skipping:', event.id);
        continue;
      }

      await query(
        `INSERT INTO activities_pj (id, type, description, scheduled_at, created_by, google_event_id)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)`,
        [actType, event.summary, startDateTime, agentId, event.id]
      );
      synced++;
    }

    await query(
      'UPDATE google_calendar_tokens SET last_sync_at = NOW() WHERE agent_id = $1',
      [agentId]
    );

    console.log(`[GCal] Synced ${synced} events from Google for agent ${agentId}`);
    return { synced };
  } catch (error) {
    console.error('[GCal] Sync from Google error:', error.message);
    if (error.code === 401) {
      await query('DELETE FROM google_calendar_tokens WHERE agent_id = $1', [agentId]);
    }
    return { synced: 0, error: error.message };
  }
}

export async function syncAllAgents() {
  try {
    console.log('[GCal Sync] Running periodic sync for all agents');
    const result = await query('SELECT agent_id FROM google_calendar_tokens');
    console.log('[GCal Sync] Found', result.rows.length, 'agents with tokens');
    
    let totalSynced = 0;
    for (const row of result.rows) {
      const { synced, error } = await syncGoogleToSalesTwo(row.agent_id);
      if (error) {
        console.log('[GCal Sync] Agent', row.agent_id, '- error:', error);
      } else {
        console.log('[GCal Sync] Agent', row.agent_id, '- synced', synced, 'events');
        totalSynced += synced;
      }
    }
    if (totalSynced > 0) {
      console.log(`[GCal] Periodic sync complete: ${totalSynced} new events imported`);
    }
    return totalSynced;
  } catch (error) {
    console.error('[GCal] syncAllAgents error:', error.message);
    return 0;
  }
}
