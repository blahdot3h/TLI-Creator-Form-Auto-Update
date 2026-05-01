const scriptProps = PropertiesService.getScriptProperties();

const CLIENT_ID = scriptProps.getProperty("CLIENT_ID");
const CLIENT_SECRET = scriptProps.getProperty("CLIENT_SECRET");
const USERNAME = scriptProps.getProperty("CLIENT_USERNAME");

const START_DATE = new Date('2026-04-01T00:00:00Z');
const END_DATE = new Date('2026-05-01T23:59:59Z');

const SHEET_NAME = "Twitch Tracker";
const START_ROW = 2;

function fetchTwitchVODs() {
  const userId = getUserId(USERNAME);
  if (!userId) {
    Logger.log('Could not fetch user ID.');
    return;
  }

  const vods = getVODs(userId);
  const filtered = vods.filter(video => {
    const date = new Date(video.created_at);
    return date >= START_DATE && date <= END_DATE;
  });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log(`Sheet "${SHEET_NAME}" not found.`);
    return;
  }

  let row = START_ROW;
  let totalMinutes = 0;
  let totalViewerHours = 0;
  let index = 1;

  filtered.forEach(video => {
    const streamDate = new Date(video.created_at);
    const url = `https://www.twitch.tv/videos/${video.id}`;
    const title = video.title || '';
    const durationStr = video.duration;
    const minutes = parseDurationToMinutes(durationStr);
    const hours = minutes / 60;
    const formattedLength = formatDuration(minutes);

    // Avg viewers (CCV) is not available from the Helix videos endpoint.
    // Leaving blank for manual entry. Hours Watched will compute via formula
    // once you fill it in.
    const avgViewersCell = `F${row}`;
    const hoursWatchedFormula = `=IF(ISNUMBER(${avgViewersCell}),${avgViewersCell}*${hours.toFixed(4)},"")`;

    totalMinutes += minutes;

    sheet.getRange(`A${row}`).setValue(index);
    sheet.getRange(`B${row}`).setValue(streamDate);
    sheet.getRange(`C${row}`).setValue(url);
    sheet.getRange(`D${row}`).setValue(title);
    sheet.getRange(`E${row}`).setValue(formattedLength);
    // F (Avg Viewers) left blank for manual entry
    sheet.getRange(`G${row}`).setFormula(hoursWatchedFormula);

    row++;
    index++;
  });

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const lastDataRow = row - 1;
  const summaryRow = row + 1;

  sheet.getRange(`D${summaryRow}`).setValue("Total Stream Time:");
  sheet.getRange(`E${summaryRow}`).setValue(`${totalHours}h ${remainingMinutes}m`);

  sheet.getRange(`F${summaryRow}`).setValue("Total Hours Watched:");
  if (lastDataRow >= START_ROW) {
    sheet.getRange(`G${summaryRow}`).setFormula(`=SUM(G${START_ROW}:G${lastDataRow})`);
  }
}

// --- Utility to parse Twitch duration string like "2h13m25s" ---
function parseDurationToMinutes(duration) {
  const hoursMatch = duration.match(/(\d+)h/);
  const minsMatch = duration.match(/(\d+)m/);
  const secsMatch = duration.match(/(\d+)s/);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const mins = minsMatch ? parseInt(minsMatch[1], 10) : 0;
  const secs = secsMatch ? parseInt(secsMatch[1], 10) : 0;

  return hours * 60 + mins + Math.floor(secs / 60);
}

// --- Format total minutes as "H:MM" for the Stream Length column ---
function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

// --- Get new OAuth token using Client Credentials flow ---
function getOAuthToken() {
  const url = 'https://id.twitch.tv/oauth2/token';
  const payload = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'client_credentials'
  };

  const options = {
    method: 'post',
    payload: payload
  };

  const response = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(response.getContentText());

  return json.access_token;
}

// --- Get Twitch user ID by username ---
function getUserId(username) {
  const token = getOAuthToken();
  const url = `https://api.twitch.tv/helix/users?login=${username}`;
  const response = UrlFetchApp.fetch(url, {
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${token}`
    }
  });
  const json = JSON.parse(response.getContentText());
  return json.data?.[0]?.id || null;
}

// --- Get VODs for the user ---
function getVODs(userId) {
  const token = getOAuthToken();
  const url = `https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=100`;
  const response = UrlFetchApp.fetch(url, {
    headers: {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${token}`
    }
  });
  const json = JSON.parse(response.getContentText());
  return json.data || [];
}
