import { query } from '../config/database.js';
import https from 'https';

async function getSetting(key) {
  const result = await query(
    'SELECT setting_value FROM system_settings WHERE setting_key = $1',
    [key]
  );
  return result.rows[0]?.setting_value || null;
}

const ALLOWED_HOSTS = ['calendar.google.com'];
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT = 10000;
const MAX_BODY_SIZE = 5 * 1024 * 1024;

function validateUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (!ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) return false;
    return true;
  } catch {
    return false;
  }
}

function fetchUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (!validateUrl(url)) {
      return reject(new Error('URL não permitida. Apenas URLs do Google Calendar (HTTPS) são aceitas.'));
    }
    if (redirectCount > MAX_REDIRECTS) {
      return reject(new Error('Muitos redirecionamentos'));
    }

    const req = https.get(url, { timeout: FETCH_TIMEOUT }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirectCount + 1).then(resolve).catch(reject);
      }
      let data = '';
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_SIZE) {
          res.destroy();
          return reject(new Error('Resposta muito grande'));
        }
        data += chunk;
      });
      res.on('end', () => resolve(data));
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout ao buscar calendário'));
    });
    req.on('error', reject);
  });
}

function parseICS(icsData) {
  const events = [];
  const lines = icsData.replace(/\r\n /g, '').split(/\r?\n/);
  let currentEvent = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      events.push(currentEvent);
      currentEvent = null;
    } else if (currentEvent) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;
      const key = line.substring(0, colonIndex);
      const value = line.substring(colonIndex + 1);
      const baseKey = key.split(';')[0];

      if (baseKey === 'SUMMARY') {
        currentEvent.summary = value.replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      } else if (baseKey === 'DESCRIPTION') {
        currentEvent.description = value.replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
      } else if (baseKey === 'DTSTART') {
        currentEvent.start = parseICSDate(value, key);
      } else if (baseKey === 'DTEND') {
        currentEvent.end = parseICSDate(value, key);
      } else if (baseKey === 'UID') {
        currentEvent.id = value;
      } else if (baseKey === 'LOCATION') {
        currentEvent.location = value.replace(/\\,/g, ',');
      }
    }
  }

  return events;
}

function parseICSDate(value, fullKey) {
  if (!value) return null;
  const clean = value.replace('Z', '');

  if (clean.length === 8) {
    return {
      date: `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}`,
    };
  }

  if (clean.length >= 15) {
    const iso = `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}T${clean.substring(9, 11)}:${clean.substring(11, 13)}:${clean.substring(13, 15)}`;

    if (value.endsWith('Z')) {
      return { dateTime: iso + 'Z' };
    }

    const tzMatch = fullKey && fullKey.match(/TZID=([^;:]+)/);
    if (tzMatch) {
      return { dateTime: iso, timeZone: tzMatch[1] };
    }

    return { dateTime: iso };
  }
  return { date: value };
}

export async function getCalendarEvents(timeMin, timeMax) {
  const icsUrl = await getSetting('google_calendar_ics_url');
  if (!icsUrl) return [];

  try {
    const icsData = await fetchUrl(icsUrl);
    const allEvents = parseICS(icsData);

    const minDate = timeMin ? new Date(timeMin) : new Date();
    const maxDate = timeMax ? new Date(timeMax) : null;

    return allEvents.filter((ev) => {
      const startStr = ev.start?.dateTime || ev.start?.date;
      if (!startStr) return false;
      const eventDate = new Date(startStr);
      if (eventDate < minDate) return false;
      if (maxDate && eventDate > maxDate) return false;
      return true;
    }).slice(0, 100);
  } catch (error) {
    console.error('Error fetching ICS calendar:', error.message);
    return [];
  }
}

export async function getConnectionStatus() {
  const icsUrl = await getSetting('google_calendar_ics_url');
  const connected = await getSetting('google_calendar_connected');

  return {
    configured: !!icsUrl,
    connected: connected === 'true' && !!icsUrl,
  };
}
