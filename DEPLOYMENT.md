# Daylight AI — run and deploy

## Open locally

Requires Node 22.18+.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open http://localhost:5173. Add personal tasks immediately; enter a Canvas token only in the app's **Kết nối** screen. Without `APP_PASSWORD`, local use is limited to your own machine; the development server binds to loopback.

## Deploy from GitHub to Render

1. In Render choose **New → Blueprint**, connect `anny-syx07/daylight-ai`, apply `render.yaml`. This requests a **paid Starter instance** and a persistent 1 GB disk; review the provider's current pricing before provisioning. This session does not provision hosting or charge a provider account.
2. Set `APP_ORIGIN` to the exact service HTTPS URL, without a trailing slash. Set `VAPID_SUBJECT` to your `mailto:` contact. Render generates `APP_PASSWORD`; retrieve it from the service environment to log in. For Canvas-only use, leave Microsoft values empty.
3. Deploy, check `/api/health`, open the app, enter its password and connect Canvas. Wait for initial sync; inspect any permission warnings in **Kết nối**. Enable notifications in **Cài đặt** separately on each device.
4. Keep **one server replica** continuously running, with the disk mounted at `/data`. Do not use a sleeping instance or ephemeral serverless filesystem (such as a default Vercel deployment) for this configuration.
5. Back up the entire data directory securely, including `encryption.key`. Losing this key requires reconnecting providers; never delete or rotate it independently of the database.

Public deployment requires access to a hosting account and its GitHub connection, a production URL, and the Microsoft registration below if Outlook is needed. Those credentials have not been supplied to this workspace.

Production requires `NODE_ENV=production`, `APP_PASSWORD` (16+ characters), HTTPS `APP_ORIGIN`, persistent `DATA_DIR`, and `npm run build` before `npm start`. The Dockerfile handles the build and process startup. HTTPS terminates at your hosting proxy. `.env` is loaded locally and is ignored by Git.

## Enable Microsoft 365 school Outlook

1. In **Microsoft Entra → App registrations → New registration**, register a school single-tenant application, or an application accepting organizational directory accounts. The default authority is `organizations`; personal Microsoft accounts are not supported.
2. Add a **Web** redirect URI: `https://YOUR-HOST/api/oauth/microsoft`. For local development add `http://localhost:5173/api/oauth/microsoft`. This is a confidential server application, not an SPA registration.
3. Add **delegated Microsoft Graph permissions**: `User.Read`, `Mail.Read`, `Calendars.Read`. MSAL adds the OpenID/offline scopes for sign-in and refresh. No mail-send or calendar-write access is requested.
4. Create a client secret. Store the secret **value** in the host's `MS_CLIENT_SECRET`, the application client ID in `MS_CLIENT_ID`, and the tenant ID in `MS_TENANT_ID` for single-tenant registration (otherwise `organizations`). Restart/redeploy.
5. Choose **Kết nối → Outlook** and sign in on Microsoft's page. If school policy blocks consent or registration, its Microsoft 365 administrator must approve/register the application. The app cannot bypass that policy.

## What's implemented

- Vietnamese responsive dashboard, up to three next tasks, month calendar, resource search, dark mode and personal tasks. Completion in Daylight does not submit to Canvas.
- Canvas profile validation, active course assignments, assignment-backed New Quizzes, classic quizzes, discussions, announcements, student enrollments/grades, course files and events. Pagination is followed. Events cover the previous 30 and next 180 days. Each failed resource has a warning; cached data from a failed resource is retained.
- Outlook server OAuth with PKCE and session-bound state, MSAL encrypted token cache and silent refresh. Inbox messages cover the last 30 days; calendar the last 7 and next 180 days. Email content is shown as information, never converted into invented deadlines.
- Background sync every 10 minutes; reminder checks every minute. Web Push at 24h and 1h, device deduplication, quiet hours, timezone, one-hour snooze. Server must keep running; push delivery also depends on device/network permissions. Expired deadlines are skipped. During quiet hours, pending reminders are checked after quiet hours end.
- Install manifest, app icon, push service worker, generic offline screen. Private responses and study data are never service-worker cached; offline study-data viewing is not included. iOS needs the app added to the Home Screen to enable push.

Not included yet: AI summaries/chat, daily/email digest, email delivery, folders, team collaboration, multi-user signup or institution-wide Canvas OAuth. This is a **single-owner deployment**; everyone using the same app password sees the same data.

## Security and storage

Provider credentials stay on the server, encrypted with AES-256-GCM. Production session cookies are HttpOnly, Secure, SameSite=Lax; mutations require exact Origin. Login attempts are limited. Provider pagination is restricted to the exact API host/path, redirects are rejected, links accept HTTPS only, and remote descriptions are rendered as text. Browser push endpoints are restricted to known providers.

The SQLite database contains sensitive course content and mail previews; these records are **not encrypted field by field**. Protect the server, disk and backups. Disconnecting deletes the source's current credentials and synchronized records, but does not erase existing backups. Lock-screen notifications may show task titles.

Secrets and database are stored in `DATA_DIR` (default `.data`, ignored by Git); an encryption key is generated once. You may instead set `ENCRYPTION_KEY` to 64 hex characters and persist it securely. Never use `VITE_*` for secrets. Browser localStorage contains only the theme preference.

```sh
npm test
npm run build
```

## Reused upstream projects

The app uses established packages rather than copying an unrelated product:
[React](https://github.com/facebook/react), [Vite](https://github.com/vitejs/vite), [Express](https://github.com/expressjs/express), [Lucide](https://github.com/lucide-icons/lucide), [Microsoft MSAL](https://github.com/AzureAD/microsoft-authentication-library-for-js), [Web Push](https://github.com/web-push-libs/web-push). Versions are pinned in `package-lock.json`; upstream licenses remain in their packages.

API references: [Canvas assignments](https://developerdocs.instructure.com/services/canvas/resources/assignments), [Canvas events](https://developerdocs.instructure.com/services/canvas/resources/calendar_events), [Microsoft delegated authorization](https://learn.microsoft.com/graph/auth-v2-user), [Graph messages](https://learn.microsoft.com/graph/api/user-list-messages), [Graph calendar view](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0).
