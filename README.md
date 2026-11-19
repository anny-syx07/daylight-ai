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

```sh
npm test
npm run build
```
