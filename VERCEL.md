# Free personal hosting: Vercel Hobby + Neon Free

This deployment profile uses a Vite static frontend and `api/index.ts` Express API. Neon Postgres persists records, encrypted provider tokens, OAuth state, VAPID keys and sessions across Vercel invocations. No writable disk is required. Local use and Render still support SQLite when `DATABASE_URL` is absent.

## Required environment values

In Vercel → Project → Settings → Environment Variables, configure **Production**:

- `DATABASE_URL`: your Neon Postgres connection string. Keep server-side.
- `ENCRYPTION_KEY`: 64 hexadecimal characters, generated once. Keep persistent with the database; changing it makes existing credentials unreadable.
- `APP_PASSWORD`: an app password of at least 16 characters. This single-owner app does not use your school password. Use Vercel's encrypted environment-variable type if you need to reveal it later in your own dashboard.
- `APP_ORIGIN`: the exact production HTTPS URL without a trailing slash. If omitted, the API uses Vercel's `VERCEL_PROJECT_PRODUCTION_URL` when available. Use this same URL for browser access and Microsoft redirects.
- `CRON_SECRET`: a random secret of at least 16 characters to protect `/api/cron`.
- `VAPID_SUBJECT`: a `mailto:` contact for Web Push.

Optional Outlook configuration: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID` (school directory tenant ID, or `organizations` for a multitenant registration).

Use a dedicated empty database. The app creates its `daylight_kv` table automatically. Keep preview environments pointed at a **separate** Neon branch/database and encryption key; this setup only configures production secrets by default. A preview without those secrets is expected not to serve authenticated API data.

## What the free version does

- Tasks and connected source data persist online.
- Click **Đồng bộ** to refresh Canvas and Outlook. The initial connection waits for sync inside the API invocation rather than leaving work running after the response.
- One Vercel cron runs daily at `01:00 UTC` (08:00 Vietnam time), subject to the platform's scheduling precision. It refreshes sources and checks reminders. `CRON_SECRET` is validated before any data access.
- While the app is open and visible, reminders are checked once per minute if enabled. Quiet hours, completed tasks, reminder deduplication and snooze still apply.
- **When the app is closed, this profile does not guarantee 24-hour or 1-hour reminders.** A once-daily check can miss short windows; do not rely on it as an alarm for exams or submissions. No extra paid scheduler is created.
- Keep Hobby and Neon Free selected. Usage quotas can suspend/restrict service; no plan upgrade is included. Verify current provider limits in your dashboards.

## Outlook in five steps

1. Open https://entra.microsoft.com and sign in with your school account. Go to **Identity → Applications → App registrations → New registration**, name it **Daylight AI**, and select single tenant for the school directory.
2. Add a **Web** redirect: `https://YOUR-PRODUCTION-HOST/api/oauth/microsoft`.
3. In **API permissions → Add a permission → Microsoft Graph → Delegated permissions**, add `User.Read`, `Mail.Read`, `Calendars.Read`.
4. In **Certificates & secrets → New client secret**, copy the secret **Value** into Vercel's `MS_CLIENT_SECRET`. From Overview, put **Application (client) ID** into `MS_CLIENT_ID` and **Directory (tenant) ID** into `MS_TENANT_ID`. Never put secrets in GitHub or chat. Redeploy after changing environment variables.
5. Open Daylight → **Kết nối → Outlook**, sign in and consent. If app registration or consent is blocked by school policy, ask the school's Microsoft 365 administrator to approve/register it. A connector cannot bypass the school's policy.

The remote store uses atomic compare-and-swap for concurrent task changes, stable insert-once VAPID keys, and short-lived database leases to coordinate sync/reminder invocations. Provider tokens and MSAL cache remain AES-GCM encrypted; the database's course/mail preview records are not encrypted field by field.

## Validation

`npm test` runs isolated SQLite tests by default. With `DATABASE_URL` and `ENCRYPTION_KEY` present it also exercises the Neon adapter, using unique `test-*` namespaces so synthetic records cannot appear in the app's normal workspace. Tests cover concurrent updates, lock ownership, authentication, CSRF, pagination and reminder windows. Test namespaces may be pruned from the database independently of application records.

References: [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel cron limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing), [Neon plans](https://neon.com/pricing), [Microsoft app registration](https://learn.microsoft.com/en-us/graph/auth-register-app-v2).
