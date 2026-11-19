export function bridgeCode(config: { endpoint: string; key: string }) {
  return `// Giữ riêng mã này. Chỉ gửi tiêu đề, người gửi và đoạn trích thư có nhãn Daylight.
const DAYLIGHT = ${JSON.stringify(config)};

function setupDaylight() {
  syncDaylight();
  stopDaylight();
  ScriptApp.newTrigger('syncDaylight').timeBased().everyMinutes(10).create();
  console.log('Đã cài xong. Quay lại Daylight để xem trạng thái.');
}

function stopDaylight() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncDaylight').forEach(t => ScriptApp.deleteTrigger(t));
}

function syncDaylight() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const sent = props.getProperties();
    const cutoff = Date.now() - 31 * 86400000;
    Object.keys(sent).filter(k => k.indexOf('sent:') === 0).forEach(k => {
      if (Number(sent[k]) < cutoff) { props.deleteProperty(k); delete sent[k]; }
    });
    const label = (Gmail.Users.Labels.list('me').labels || []).find(l => l.name === 'Daylight');
    if (!label) throw new Error('Tạo nhãn Daylight trong Gmail và gắn nhãn này cho thư học tập trước.');
    let pageToken;
    let total = 0;
    let pages = 0;
    do {
      const options = { labelIds: [label.id], q: 'newer_than:30d', maxResults: 100 };
      if (pageToken) options.pageToken = pageToken;
      const result = Gmail.Users.Messages.list('me', options);
      pages++;
      const pending = (result.messages || []).filter(m => !sent['sent:' + m.id]).slice(0, 100 - total);
      for (let offset = 0; offset < pending.length; offset += 5) {
        const messages = pending.slice(offset, offset + 5).map(m => {
          const mail = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['Subject', 'From'] });
          const header = name => ((mail.payload || {}).headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
          return { id: mail.id, subject: ((header('Subject') || {}).value || '').slice(0, 300), from: ((header('From') || {}).value || '').slice(0, 100), snippet: (mail.snippet || '').slice(0, 1000) };
        });
        daylightSend(messages);
        const done = {};
        messages.forEach(m => { done['sent:' + m.id] = String(Date.now()); sent['sent:' + m.id] = done['sent:' + m.id]; });
        props.setProperties(done);
        total += messages.length;
      }
      pageToken = result.nextPageToken;
    } while (pageToken && total < 100 && pages < 10);
    if (!total) daylightSend([]);
  } finally { lock.releaseLock(); }
}

function daylightSend(messages) {
  const response = UrlFetchApp.fetch(DAYLIGHT.endpoint, {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + DAYLIGHT.key },
    payload: JSON.stringify({ messages: messages }), muteHttpExceptions: true, followRedirects: false
  });
  if (response.getResponseCode() !== 200) throw new Error('Daylight chưa nhận thư (HTTP ' + response.getResponseCode() + '). Kiểm tra kết nối trong app.');
}
`;
}
