# Daylight AI ☀️

A calm study notification maker: Canvas LMS, school Outlook through a Gmail bridge, SIS UMT class schedules, deadlines and mobile reminders.

[**☀️ Mở Daylight AI online**](https://daylight-ai-three.vercel.app) · Vercel Hobby + Neon Free.

[**📖 Hướng dẫn Canvas & Outlook từng bước**](https://daylight-ai-three.vercel.app/huong-dan) · [Canvas](https://daylight-ai-three.vercel.app/huong-dan#canvas) · [Outlook](https://daylight-ai-three.vercel.app/huong-dan#outlook).

Daylight is a **free public beta for students using Canvas**. Visitors can [create a verified email account](https://daylight-ai-three.vercel.app/app?signup) and connect their own Canvas LMS/Gmail sources in an isolated workspace. The original owner's workspace remains at `/owner` with its existing password; it is never merged into a visitor account. Direct Outlook is unavailable. This release has no generative AI feature.

Canvas and Outlook instructions include direct new-tab links, a copyable Microsoft redirect URI, and school IT troubleshooting. The same help is linked from sign-in, connection cards and the Canvas token dialog.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. Requires Node 22.18+. Personal tasks work immediately; source data appears only after connecting your own account. Outlook requires Microsoft app registration.

For free hosting, use [Vercel + Neon setup](VERCEL.md). For a continuously running server, see [Render setup, security and scope](DEPLOYMENT.md).

The UI uses locally bundled Nunito with Vietnamese support for a softer, more readable study space.

### Source automation and new-message alerts

Connections now shows separate flags for automatic, conditional, stale, manual and unavailable sources. Granting access is not treated as proof of a running bridge. Canvas auto-refresh defaults on, runs about every 30–40 minutes through the existing Google reminder clock, honors its own off switch, and retains manual refresh. Source work runs after the reminder response with `waitUntil`, so slow Canvas endpoints do not hold up the clock response. Both the source interval and a distributed lease prevent repeated syncs. The daily cron remains a fallback. Partial Canvas permissions remain visible.

Gmail uses its actual receiving heartbeat and only includes mail with the Daylight label. SIS remains conditional on the local Chrome bridge, an awake computer and a valid school session; generating/downloading its key is not treated as a successful sync. Imported ICS/EML files require reimport. An ICS date filling a missing Canvas API due date retains a manual-date flag. Native Outlook remains unavailable. Personal tasks have no external feed to update.

New Gmail messages and new Canvas announcements, discussions, assignments and quizzes enter a durable outbox after a one-time baseline of existing data. Repeated imports/syncs do not enqueue the same ID again. Successful provider acceptance is tracked per device; transient failures retain pending work with retry/backoff, and expired subscriptions are removed and flagged. Up to 500 jobs remain pending at once; unqueued new IDs remain unseen for a later scan instead of being silently discarded. Quiet hours hold new-message jobs until later. Disabling new-message alerts is separate from deadline reminders. The source must first deliver the item to Daylight; neither inaccessible Canvas resources nor unlabelled/unforwarded emails can generate alerts.

The server does not claim that push-provider acceptance proves a banner appeared, or that web apps can override notification permissions, Focus, Silent mode, battery policies or network outages. Settings includes banner/sound guidance and the closed-app 15-second sound test.

### Mobile reminders with sound

Each workspace supports responsive iPhone and Android layouts; each phone registers its own Web Push subscription. iPhone requires iOS 16.4+ and a Home Screen installation. In Settings, enable notifications, then choose **Thử sau 15 giây** and close the app/lock the phone. The test runs on the server via Vercel `waitUntil`; the app does not claim delivery or sound until the owner confirms hearing it on that device. Push explicitly requests `silent: false`, Android vibration/re-notification and high delivery urgency. Sound remains subject to OS permissions, volume, Focus/Do Not Disturb and network availability; this is not a critical-alert entitlement or a delivery guarantee.

The existing private Google Apps Script bridge can run **setupDaylightReminders** to add a one-minute cloud trigger using its existing external-request/trigger permissions. No laptop or open phone app is required. The trigger calls a dedicated Bearer-protected reminder endpoint with its existing revocable bridge key; it cannot read the dashboard, subjects or push credentials. The server returns only the next wake-up timestamp, up to ten minutes away, and selects earlier known 24h/1h boundaries. Google wakes around those boundaries once per minute; newly changed schedules are refreshed within ten minutes. Idle minutes do not query the database, reducing free-tier runtime/compute use. Transient push failures retry; expired subscriptions are removed; a shared lease plus per-device/per-window markers prevent routine duplicate sends. Quiet hours, completion, cancellation and snooze remain enforced. Free Google/Vercel/Neon quotas and scheduler delays still apply.

Settings displays actual scheduler heartbeat freshness and a per-device sound-test confirmation. The Vercel daily cron remains a fallback for source sync/reminders; it is no longer the only closed-app reminder caller after Google setup. Stop just the background reminder trigger with **stopDaylightReminders** in Apps Script. An existing authorized project can instead add the separate file generated by `reminderClockCode`: run **setupDaylightReminderClock** once, or **stopDaylightReminderClock** to stop that separate clock. The file contains no Gmail-reading functions and leaves the existing mail script unchanged. Revoking the Gmail bridge key also disables its reminder calls.

The overview has interactive stacked bars for the next seven days, a completion ring, assignment/quiz counters and separate upcoming deadlines/classes. Calendar search supports subject, deadline/class filtering and month/list views; graph clicks open the selected calendar day. Counts come from saved items, with classes and informational content excluded from work-completion totals. Manual entries can be tasks, assignments, quizzes or dated class events. The direct Outlook card remains visible as **Sắp có**, without an active setup/connect button; the working Gmail bridge is unchanged.

SIS timetable snapshots can be previewed/imported as `.sis.json` using the `daylight.sis-schedule.v1` format. The export contains only dates, start/end times, rooms/buildings, lesson type and instructor from the authenticated SIS lesson table; attendance marks are excluded. UTC+7 dates are validated before saving, explicit cancellations are skipped, and no weekly recurrence is inferred. Re-importing the same semester replaces its snapshot, leaving Canvas and Gmail data intact.

For schedule changes, **Connections → SIS UMT → Bật cập nhật lịch** downloads a private Manifest V3 Chrome bridge. Unzip, open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select the extracted folder. Sign in to SIS in that Chrome profile, then open **Daylight · SIS UMT → Bật cập nhật**. The bridge checks approximately hourly while Chrome is running, the computer is awake and the SIS session remains valid. It opens temporary background tabs for the semester's known courses, reads only rendered timetable columns, and closes only its own tabs. It neither reads credentials/cookies nor bypasses sign-in. New courses/semesters require a refreshed import/catalog. This is a local bridge, not an official SIS API integration or an always-on cloud service.

The SIS card distinguishes imported snapshots, actual successful checks, stale checks and errors. Partial pages, missing courses, empty tables, unexpected sources or stale payloads are rejected without replacing stored classes. Successful checks replace that semester atomically in the item store, including changed times/rooms and removed lessons. The ZIP contains a separate revocable write-only key; keep it private. Setup/download requires the owner's app session and exact Origin. The inbound endpoint requires that key and cannot read the dashboard. Revoking the key leaves previously imported classes intact. Chrome host permissions are restricted to SIS and this Daylight origin; no Google/Microsoft tokens are sent to Daylight.

Canvas iCal `URL;VALUE=URI` values are unwrapped before classification. Calendar URLs paired with `event-assignment-*` UIDs remain deadlines. When the same Canvas assignment is already available through the API, the native record supplies its exact time, quiz type and completion state; the imported snapshot does not duplicate it. If the API has no due date, the imported calendar date fills that gap with its all-day flag and source label preserved.

Canvas sync preserves successful partitions when one endpoint fails. If course-file listing returns 403/404, the connector separately collects file links from readable, unlocked modules; it does not download file content or bypass Canvas access checks. Quiz 404 warnings explain that assignment-based quiz data is retained without claiming every quiz is present.

### Use without a Microsoft app registration

Open **Connections → Đưa thư và lịch về Daylight**. A private Google Apps Script bridge can send headers, bounded message bodies and links of Gmail messages carrying the `Daylight` label; it requires the owner's Google consent for read-only Gmail, external requests and scheduled triggers. Script code and its manifest are generated inside the authenticated app. The bridge uses its own revocable, encrypted receiving key and never receives a Google refresh token or school password. It sends up to 100 new messages per run from the 1,000 most recent labelled messages within 30 days, approximately every 10 minutes, subject to Google quotas. Forwarding from school Outlook must be permitted and tested; Canvas can also deliver notifications to a verified personal address. [Step-by-step Gmail guide](https://daylight-ai-three.vercel.app/huong-dan#gmail).

The owner can also preview and confirm `.ics` calendars or `.eml` messages (1 MB per file). Imported data is explicitly labelled as a manual snapshot; uploading an ICS with the same filename replaces that calendar's previous snapshot, including cancellations. Calendar expansion covers -30/+366 days, capped at 1,000 source events and 2,000 instances. All-day dates have no guessed time or timed reminder. Email imports discard attachments and never infer deadlines. Gmail, manual imports and native OAuth connection states remain separate. None of these alternatives grants full Canvas grades/files or a native Outlook connection. [File import guide](https://daylight-ai-three.vercel.app/huong-dan#nhap-tep).

```sh
npm test
npm run build
```

### Public accounts

`NEON_AUTH_BASE_URL` enables Managed Neon Auth (SDK 0.8.2) through a same-origin Express proxy. Registration requires email OTP verification; password reset uses OTP and revokes provider sessions. Only provider cookies are forwarded. The owner credential never travels to the auth provider. Unverified users cannot access app APIs. Configure the trusted origin, disable localhost in production, and keep ENCRYPTION_KEY stable.

Each verified user ID maps to a SHA-256 workspace prefix. AsyncLocalStorage carries request/async source work, sync guards and leases are per workspace. Hashed receiving keys route Gmail/SIS callbacks. Provider tokens, imported data, completion, subscriptions, queues and settings are isolated. A push endpoint belongs to one workspace; explicit logout detaches it. Sign-in unsubscribes the browser's previous channel.

The beta uses Neon's shared verification sender, which is rate limited and intended for testing. Configure a custom SMTP sender before a broad production launch. No paid sender was provisioned. Signup/reset are rate limited. The public landing, sitemap, robots and llms.txt describe actual scope; indexing or LLM recommendations are not guaranteed.

Every new workspace must install its own Google clock for closed-app reminders/auto-refresh. Settings provides clock-only code requiring external-request/trigger permissions, without Gmail read access. The full Gmail bridge includes a clock too. A generated script is not an active heartbeat. The daily Vercel cron remains an owner fallback and does not scan all member workspaces.

Members can erase their Daylight data in Settings, revoking bridges and clearing source tokens, imported items and settings. This preserves the login account and upstream data. Owner data is excluded.

Run npm test for concurrent owner/two-member isolation, callback routing, cross-account mutation and logout checks. Verify real provider auth whenever changing its configuration.

### Connect a school's Canvas

Each workspace stores its own `canvas-origin` alongside the encrypted token. Enter a public HTTPS school Canvas URL, including either an `*.instructure.com` site or a custom domain (for example `canvas.school.edu`). Pasted login/settings paths normalize to the origin; only standard HTTPS port 443 is supported. Tokens must be issued by that exact site and the school must allow API access. Internal/VPN-only sites are unavailable from the hosted app.

Existing connections without `canvas-origin` keep the original UMT origin. No token is migrated to a different school. Profile validation succeeds at the candidate origin before changing the connection. A successful school change clears the former Canvas partitions, completion/snoozes and queued Canvas alerts; Gmail, personal items and explicitly imported snapshots stay intact. Same numeric assignment IDs from different schools do not share imported deadline fallbacks.

Every Canvas socket uses an Undici dispatcher whose DNS lookup accepts only public unicast IPv4/IPv6 answers. The validated addresses are supplied directly to the socket, blocking DNS rebinding and private/metadata/loopback targets; mixed public/private answers are rejected. TLS certificate validation remains enabled. Pagination remains on the chosen origin under `/api/v1/`; redirects are refused. Sync, connection replacement and disconnect share the same workspace-scoped lease. Settings/token/calendar links are derived from the selected school. SIS remains a separate UMT-specific integration.

### Public metadata and Google ownership

This is a React/Vite app. Public assets belong in `public/`; Vite copies them to the `dist/` root. Google ownership file `public/googlee92d32c120829c65.html` is the exact supplied file and must remain deployed after verification. Its public URL is `https://daylight-ai-three.vercel.app/googlee92d32c120829c65.html`.

`index.html` contains SEO, Open Graph, Twitter and iOS metadata. Build also renders complete public HTML for home, guide, privacy and terms via `scripts/render-public.tsx`, with page-specific canonical URLs and metadata. `vercel.json` routes those pages to their rendered files; its SPA fallback excludes static file paths, so Google verification, images, robots and sitemap cannot turn into the homepage. App, owner and API responses remain noindex/protected.

The committed `public/og-image.png` is 1200×630 and contains only brand art plus a labelled illustrative phone, not private student data. PNG app icons and Apple touch icon are included. Optional art regeneration: `python3 scripts/generate-social-assets.py /path/to/Nunito.ttf` (Pillow and fontTools required; official Nunito font under OFL). Build does not require Python or re-download art.

After deployment, open the exact Google file URL and press Verify in Search Console. Submit `sitemap.xml` there separately. HTML metadata and a sitemap do not guarantee indexing, ranking, or a platform clearing its old link-preview cache. Actual Zalo/Messenger/Discord sharing should be checked in those services.

### Readable mobile content and session recovery

Email, assignments, quizzes, announcements, files and calendar items share responsive content cards with separate course/sender, title, type, due date, readable paragraphs, safe inline links and expand/collapse. Original-source, completion, snooze and task-creation actions remain available. Canvas HTML and EML HTML are converted server-side to bounded text/link runs; scripts, hidden content and remote-image loading are excluded. The client never inserts provider HTML.

Gmail bridge revision 2 reads bounded text/HTML MIME bodies of Daylight-labelled mail, skips attachments, and uses separate sent:v2 markers to backfill existing labelled messages once. Existing IDs are upgraded without duplicate notifications, and legacy snippet retries cannot downgrade a richer saved message. Update Code.gs in the existing Google project and run syncDaylight once; the read-only Gmail scope is unchanged. Existing bridge installations are not remotely changed by a web deployment. The app flags a snippet-only bridge until actual richer content arrives.

A provider transport/5xx/rate-limit failure during session validation returns 503 rather than a signed-out 401. The browser confirms a failed authorization against /api/session before clearing its authenticated state, retries a transient 401 after successful confirmation, and retains the screen on a failed network check. It resumes fetching on visibility/pageshow/online, pauses hidden-page polling, deduplicates requests, and ignores data responses from an older login generation. Sign-in explicitly requests rememberMe; credentials remain in secure server cookies, never localStorage. Genuine expiry/revocation still signs out.
