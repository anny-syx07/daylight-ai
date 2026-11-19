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

The overview has interactive stacked bars for the next seven days, a completion ring, assignment/quiz counters and separate upcoming deadlines/classes. Calendar search supports subject, deadline/class filtering and month/list views; graph clicks open the selected calendar day. Counts come from saved items, with classes and informational content excluded from work-completion totals. Manual entries can be tasks, assignments, quizzes or dated class events. The direct Outlook card remains visible as **Sắp có**, without an active setup/connect button; the working Gmail bridge is unchanged.

Canvas iCal `URL;VALUE=URI` values are unwrapped before classification. Calendar URLs paired with `event-assignment-*` UIDs remain deadlines. When the same Canvas assignment is already available through the API, the native record supplies its exact time, quiz type and completion state; the imported snapshot does not duplicate it. If the API has no due date, the imported calendar date fills that gap with its all-day flag and source label preserved.

Canvas sync preserves successful partitions when one endpoint fails. If course-file listing returns 403/404, the connector separately collects file links from readable, unlocked modules; it does not download file content or bypass Canvas access checks. Quiz 404 warnings explain that assignment-based quiz data is retained without claiming every quiz is present.

### Use without a Microsoft app registration

Open **Connections → Đưa thư và lịch về Daylight**. A private Google Apps Script bridge can send headers and snippets of Gmail messages carrying the `Daylight` label; it requires the owner's Google consent for read-only Gmail, external requests and scheduled triggers. Script code and its manifest are generated inside the authenticated app. The bridge uses its own revocable, encrypted receiving key and never receives a Google refresh token or school password. It sends up to 100 new messages per run from the 1,000 most recent labelled messages within 30 days, approximately every 10 minutes, subject to Google quotas. Forwarding from school Outlook must be permitted and tested; Canvas can also deliver notifications to a verified personal address. [Step-by-step Gmail guide](https://daylight-ai-three.vercel.app/huong-dan#gmail).

The owner can also preview and confirm `.ics` calendars or `.eml` messages (1 MB per file). Imported data is explicitly labelled as a manual snapshot; uploading an ICS with the same filename replaces that calendar's previous snapshot, including cancellations. Calendar expansion covers -30/+366 days, capped at 1,000 source events and 2,000 instances. All-day dates have no guessed time or timed reminder. Email imports discard attachments and never infer deadlines. Gmail, manual imports and native OAuth connection states remain separate. None of these alternatives grants full Canvas grades/files or a native Outlook connection. [File import guide](https://daylight-ai-three.vercel.app/huong-dan#nhap-tep).

```sh
npm test
npm run build
```
