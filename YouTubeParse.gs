function fetchVideosFromYourYoutubeChannel() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Youtube Tracker');

  if (!sheet) {
    throw new Error('Sheet "Youtube Tracker" not found');
  }

  const startRow = 2;

  const columns = {
    number: 1,      // A
    date: 2,        // B
    url: 3,         // C
    title: 4,       // D
    length: 5,      // E
    watchHours: 6   // F
  };

  const startDate = '2026-04-01';
  const endDate = '2026-04-30';

  const publishedAfter = new Date(startDate + 'T00:00:00Z').toISOString();
  const publishedBefore = new Date('2026-05-01T00:00:00Z').toISOString();

  const handle = 'CoffeeBns';

  sheet.getRange(startRow, 1, sheet.getMaxRows() - startRow + 1, 6).clearContent();

  const channelSearch = YouTube.Search.list('snippet', {
    q: handle,
    type: 'channel',
    maxResults: 1
  });

  if (!channelSearch.items || channelSearch.items.length === 0) {
    sheet.getRange(startRow, columns.url).setValue('Channel not found');
    return;
  }

  const channelId = channelSearch.items[0].snippet.channelId;

  let videoIds = [];
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

    if (videoSearch.items && videoSearch.items.length > 0) {
      videoSearch.items.forEach(video => {
        videoIds.push(video.id.videoId);
      });
    }

    nextPageToken = videoSearch.nextPageToken || '';
  } while (nextPageToken);

  if (videoIds.length === 0) {
    sheet.getRange(startRow, columns.url).setValue('No videos found in date range.');
    return;
  }

  let output = [];
  let count = 1;
  let nonShortVideoIds = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batchIds = videoIds.slice(i, i + 50);

    const response = YouTube.Videos.list('snippet,contentDetails', {
      id: batchIds.join(',')
    });

    response.items.forEach(item => {
      const durationSeconds = parseISODurationToSeconds(item.contentDetails.duration);

      // Ignore YouTube Shorts
      if (durationSeconds <= 60) return;

      nonShortVideoIds.push(item.id);
    });
  }

  if (nonShortVideoIds.length === 0) {
    sheet.getRange(startRow, columns.url).setValue('No non-Short videos found in date range.');
    return;
  }

  const watchHoursByVideoId = getWatchHoursByVideoId(
    channelId,
    startDate,
    endDate,
    nonShortVideoIds
  );

  for (let i = 0; i < nonShortVideoIds.length; i += 50) {
    const batchIds = nonShortVideoIds.slice(i, i + 50);

    const response = YouTube.Videos.list('snippet,contentDetails', {
      id: batchIds.join(',')
    });

    response.items.forEach(item => {
      const videoId = item.id;
      const publishedAt = new Date(item.snippet.publishedAt);
      const title = item.snippet.title;
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const length = formatYouTubeDuration(item.contentDetails.duration);
      const watchHours = watchHoursByVideoId[videoId] || 0;

      output.push([
        count,
        publishedAt,
        url,
        title,
        length,
        watchHours
      ]);

      count++;
    });
  }

  sheet.getRange(startRow, 1, output.length, 6).setValues(output);
  sheet.getRange(startRow, columns.date, output.length, 1).setNumberFormat('m/d/yyyy');
  sheet.getRange(startRow, columns.watchHours, output.length, 1).setNumberFormat('0.00');

  const totalRow = startRow + output.length;
  sheet.getRange(totalRow, columns.length).setValue('Total Watch Hours:');
  sheet.getRange(totalRow, columns.watchHours).setFormula(`=SUM(F${startRow}:F${totalRow - 1})`);
}

function getWatchHoursByVideoId(channelId, startDate, endDate, videoIds) {
  const results = {};

  for (let i = 0; i < videoIds.length; i += 50) {
    const batchIds = videoIds.slice(i, i + 50);

    const report = YouTubeAnalytics.Reports.query({
      ids: 'channel==' + channelId,
      startDate: startDate,
      endDate: endDate,
      metrics: 'estimatedMinutesWatched',
      dimensions: 'video',
      filters: 'video==' + batchIds.join(','),
      sort: 'video',
      maxResults: 50
    });

    if (!report.rows) continue;

    report.rows.forEach(row => {
      const videoId = row[0];
      const minutesWatched = Number(row[1]) || 0;
      results[videoId] = minutesWatched / 60;
    });
  }

  return results;
}

function formatYouTubeDuration(duration) {
  const seconds = parseISODurationToSeconds(duration);

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function parseISODurationToSeconds(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

  if (!match) return 0;

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  return hours * 3600 + minutes * 60 + seconds;
}
