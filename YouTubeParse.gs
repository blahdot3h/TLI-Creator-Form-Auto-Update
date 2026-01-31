function fetchVideosFromYouTubeChannel() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startRow = 10;
  const urlColumn = 6; // Column F
  let currentRow = startRow;

  const publishedAfter = new Date('2026-01-01T00:00:00Z').toISOString(); // Set date to start of Month you are tracking
  const publishedBefore = new Date('2026-02-01T11:59:59Z').toISOString(); //Set date to end of Month you are tracking

  // Step 1: Resolve Channel ID from Handle
  const handle = 'YourYoutubeHandle'; //Enter Your YouTube Handle here
  const channelSearch = YouTube.Search.list('snippet', {
    q: handle,
    type: 'channel',
    maxResults: 1
  });

  if (!channelSearch.items || channelSearch.items.length === 0) {
    Logger.log("Could not find channel with handle @YourYoutubeHandle");
    sheet.getRange(currentRow, urlColumn).setValue("Channel not found");
    return;
  }

  const channelId = channelSearch.items[0].snippet.channelId;

  // Step 2: Fetch videos from that channel in the date range
  let nextPageToken = '';
  do {
    const videoSearch = YouTube.Search.list('id', {
      channelId: channelId,
      type: 'video',
      publishedAfter: publishedAfter,
      publishedBefore: publishedBefore,
      maxResults: 50,
      pageToken: nextPageToken
    });

    const videos = videoSearch.items;
    if (videos.length === 0 && currentRow === startRow) {
      sheet.getRange(startRow, urlColumn).setValue("No videos found in date range.");
      return;
    }

    videos.forEach(function(video) {
      const videoId = video.id.videoId;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      sheet.getRange(currentRow, urlColumn).setValue(videoUrl);
      currentRow++;
    });

    nextPageToken = videoSearch.nextPageToken;
  } while (nextPageToken);

  // Step 3: Trigger the view count / publish date update
  getYouTubeViewsAndDates();
}

function getYouTubeViewsAndDates() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const startRow = 10;
  const urlColumn = 6; // Column F
  const dateColumn = 3; // Column C
  const viewColumn = 4; // Column D
  const lastRow = sheet.getLastRow();
  let finalDataRow = startRow;

  for (let i = startRow; i <= lastRow; i++) {
    const url = sheet.getRange(i, urlColumn).getValue();
    if (!url) break;

    const videoId = extractVideoID(url);
    finalDataRow = i;

    if (!videoId) {
      sheet.getRange(i, dateColumn).setValue("Invalid URL");
      sheet.getRange(i, viewColumn).setValue("Invalid URL");
      continue;
    }

    try {
      const response = YouTube.Videos.list("snippet,statistics", { id: videoId });
      const item = response.items && response.items.length > 0 ? response.items[0] : null;

      if (item) {
        const publishedAt = item.snippet.publishedAt;
        const viewCount = parseInt(item.statistics.viewCount);

        sheet.getRange(i, dateColumn).setValue(new Date(publishedAt));
        sheet.getRange(i, viewColumn).setValue(viewCount);
      } else {
        sheet.getRange(i, dateColumn).setValue("Not Found");
        sheet.getRange(i, viewColumn).setValue("Not Found");
      }
    } catch (e) {
      sheet.getRange(i, dateColumn).setValue("Error");
      sheet.getRange(i, viewColumn).setValue("Error: " + e.message);
    }
  }

  // Total Views row
  const totalRow = finalDataRow + 1;
  sheet.getRange(totalRow, viewColumn - 1).setValue("Total Views:");
  const totalFormula = `=SUM(D${startRow}:D${finalDataRow})`;
  sheet.getRange(totalRow, viewColumn).setFormula(totalFormula);
}

function extractVideoID(url) {
  const regExp = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/;
  const match = url.match(regExp);
  return match && match[1] ? match[1] : null;
}
