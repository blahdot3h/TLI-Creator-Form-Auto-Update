const scriptProps = PropertiesService.getScriptProperties();

const CLIENT_ID = scriptProps.getProperty("CLIENT_ID");
const CLIENT_SECRET = scriptProps.getProperty("CLIENT_SECRET");
const USERNAME = scriptProps.getProperty("CLIENT_USERNAME");
const START_DATE = new Date('2026-01-01T00:00:00Z'); // Set start date for reporting month
const END_DATE = new Date('2026-02-01T23:59:59Z'); // set end date for reporting month

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

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  let row = 10;
  let totalMinutes = 0;
  let totalViewerHours = 0;

  filtered.forEach(video => {
    const streamDate = new Date(video.created_at).toLocaleString();
    const url = `https://www.twitch.tv/videos/${video.id}`;
    const durationStr = video.duration;
    const minutes = parseDurationToMinutes(durationStr);
    const hours = minutes / 60;

    // Manually set or pull average viewer count from another source if needed
    const avgViewers = video.average_viewers || 0; // ← default fallback is 0

    const viewerHours = hours * avgViewers;

    totalMinutes += minutes;
    totalViewerHours += viewerHours;

    sheet.getRange(`L${row}`).setValue(streamDate);
    sheet.getRange(`M${row}`).setValue(url);
    sheet.getRange(`O${row}`).setValue(durationStr);
    sheet.getRange(`P${row}`).setValue('N/A');
    sheet.getRange(`Q${row}`).setValue('N/A');
    sheet.getRange(`R${row}`).setValue(viewerHours.toFixed(2)); // Total Viewer Hours
    sheet.getRange(`S${row}`).setValue(avgViewers);              // Avg Viewers
    row++;
  });

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const summary = `Total Stream Time: ${totalHours}h ${remainingMinutes}m`;
  const viewerSummary = `Total Viewer Hours: ${totalViewerHours.toFixed(2)}h`;

  sheet.getRange(`O${row + 1}`).setValue(summary);
  sheet.getRange(`R${row + 1}`).setValue(viewerSummary);
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
  console.log(json.data);
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
