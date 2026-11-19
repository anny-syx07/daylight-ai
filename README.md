# Daylight AI ☀️

A calm personal study PWA: Canvas LMS, school Outlook, deadlines and reminders.

[**☀️ Mở Daylight AI online**](https://daylight-ai-three.vercel.app) · Vercel Hobby + Neon Free.

[**📖 Hướng dẫn Canvas & Outlook từng bước**](https://daylight-ai-three.vercel.app/huong-dan) · [Canvas](https://daylight-ai-three.vercel.app/huong-dan#canvas) · [Outlook](https://daylight-ai-three.vercel.app/huong-dan#outlook).

The live app is reachable online; the study workspace is protected by its owner's Daylight password. This MVP currently has **one shared owner workspace**, not separate accounts for visitors. Do not give visitors the owner's password to set up their own Canvas or Outlook: they would share the same data. Independent user accounts are not enabled yet.

Canvas and Outlook instructions include direct new-tab links, a copyable Microsoft redirect URI, and school IT troubleshooting. The same help is linked from sign-in, connection cards and the Canvas token dialog.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. Requires Node 22.18+. Personal tasks work immediately; source data appears only after connecting your own account. Outlook requires Microsoft app registration.

For free hosting, use [Vercel + Neon setup](VERCEL.md). For a continuously running server, see [Render setup, security and scope](DEPLOYMENT.md).

The UI uses locally bundled Nunito with Vietnamese support for a softer, more readable study space.

### Mobile reminders with sound

The shared owner workspace supports responsive iPhone and Android layouts; each phone registers its own Web Push subscription. iPhone requires iOS 16.4+ and a Home Screen installation. In Settings, enable notifications, then choose **Thử sau 15 giây** and close the app/lock the phone. The test runs on the server via Vercel `waitUntil`; the app does not claim delivery or sound until the owner confirms hearing it on that device. Push explicitly requests `silent: false`, Android vibration/re-notification and high delivery urgency. Sound remains subject to OS permissions, volume, Focus/Do Not Disturb and network availability; this is not a critical-alert entitlement or a delivery guarantee.

The existing private Google Apps Script bridge can run **setupDaylightReminders** to add a one-minute cloud trigger using its existing external-request/trigger permissions. No laptop or open phone app is required. The trigger calls a dedicated Bearer-protected reminder endpoint with its existing revocable bridge key; it cannot read the dashboard, subjects or push credentials. The server returns only the next wake-up timestamp, up to ten minutes away, and selects earlier known 24h/1h boundaries. Google wakes around those boundaries once per minute; newly changed schedules are refreshed within ten minutes. Idle minutes do not query the database, reducing free-tier runtime/compute use. Transient push failures retry; expired subscriptions are removed; a shared lease plus per-device/per-window markers prevent routine duplicate sends. Quiet hours, completion, cancellation and snooze remain enforced. Free Google/Vercel/Neon quotas and scheduler delays still apply.

Settings displays actual scheduler heartbeat freshness and a per-device sound-test confirmation. The Vercel daily cron remains a fallback for source sync/reminders; it is no longer the only closed-app reminder caller after Google setup. Stop just the background reminder trigger with **stopDaylightReminders** in Apps Script. Revoking the Gmail bridge key also disables its reminder calls.

The overview has interactive stacked bars for the next seven days, a completion ring, assignment/quiz counters and separate upcoming deadlines/classes. Calendar search supports subject, deadline/class filtering and month/list views; graph clicks open the selected calendar day. Counts come from saved items, with classes and informational content excluded from work-completion totals. Manual entries can be tasks, assignments, quizzes or dated class events. The direct Outlook card remains visible as **Sắp có**, without an active setup/connect button; the working Gmail bridge is unchanged.

SIS timetable snapshots can be previewed/imported as `.sis.json` using the `daylight.sis-schedule.v1` format. The export contains only dates, start/end times, rooms/buildings, lesson type and instructor from the authenticated SIS lesson table; attendance marks are excluded. UTC+7 dates are validated before saving, explicit cancellations are skipped, and no weekly recurrence is inferred. Re-importing the same semester replaces its snapshot, leaving Canvas and Gmail data intact.

For schedule changes, **Connections → SIS UMT → Bật cập nhật lịch** downloads a private Manifest V3 Chrome bridge. Unzip, open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the extracted folder. Sign in to SIS in that Chrome profile, then open **Daylight · SIS UMT → Bật cập nhật**. The bridge checks approximately hourly while Chrome is running, the computer is awake and the SIS session remains valid. It opens temporary background tabs for the semester's known courses, reads only rendered timetable columns, and closes only its own tabs. It neither reads credentials/cookies nor bypasses sign-in. New courses/semesters require a refreshed import/catalog. This is a local bridge, not an official SIS API integration or an always-on cloud service.

The SIS card distinguishes imported snapshots, actual successful checks, stale checks and errors. Partial pages, missing courses, empty tables, unexpected sources or stale payloads are rejected without replacing stored classes. Successful checks replace that semester atomically in the item store, including changed times/rooms and removed lessons. The ZIP contains a separate revocable write-only key; keep it private. Setup/download requires the owner's app session and exact Origin. The inbound endpoint requires that key and cannot read the dashboard. Revoking the key leaves previously imported classes intact. Chrome host permissions are restricted to SIS and this Daylight origin; no Google/Microsoft tokens are sent to Daylight.

Canvas iCal `URL;VALUE=URI` values are unwrapped before classification. Calendar URLs paired with `event-assignment-*` UIDs remain deadlines. When the same Canvas assignment is already available through the API, the native record supplies its exact time, quiz type and completion state; the imported snapshot does not duplicate it. If the API has no due date, the imported calendar date fills that gap with its all-day flag and source label preserved.

Canvas sync preserves successful partitions when one endpoint fails. If course-file listing returns 403/404, the connector separately collects file links from readable, unlocked modules; it does not download file content or bypass Canvas access checks. Quiz 404 warnings explain that assignment-based quiz data is retained without claiming every quiz is present.

### Use without a Microsoft app registration

Open **Connections → Đưa thư và lịch về Daylight**. A private Google Apps Script bridge can send headers and snippets of Gmail messages carrying the `Daylight` label; it requires the owner's Google consent for read-only Gmail, external requests and scheduled triggers. Script code and its manifest are generated inside the authenticated app. The bridge uses its own revocable, encrypted receiving key and never receives a Google refresh token or school password. It sends up to 100 new messages per run from the 1,000 most recent labelled messages within 30 days, approximately every 10 minutes, subject to Google quotas. Forwarding from school Outlook must be permitted and tested; Canvas can also deliver notifications to a verified personal address. [Step-by-step Gmail guide](https://daylight-ai-three.vercel.app/huong-dan#gmail).

The owner can also preview and confirm `.ics` calendars or `.eml` messages (1 MB per file). Imported data is explicitly labelled as a manual snapshot; uploading an ICS with the same filename replaces that calendar's previous snapshot, including cancellations. Calendar expansion covers -30/+366 days, capped at 1,000 source events and 2,000 instances. All-day dates have no guessed time or timed reminder. Email imports discard attachments and never infer deadlines. Gmail, manual imports and native OAuth connection states remain separate. None of these alternatives grants full Canvas grades/files or a native Outlook connection. [File import guide](https://daylight-ai-three.vercel.app/huong-dan#nhap-tep).

```sh
npm test
npm run build
```
