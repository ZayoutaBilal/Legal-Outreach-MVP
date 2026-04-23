# Legal Outreach MVP

Minimal SaaS-style MVP built with Next.js App Router, Prisma, TiDB/MySQL, Nodemailer, and Vercel cron.

## Features

- Admin login with email/password and JWT cookie session
- Protected dashboard with delivery metrics and status filtering
- Add avocat contacts manually from the dashboard
- Import avocat contacts from a JSON file
- Export avocat contacts as a JSON file
- Hourly outreach sender via `/api/send`
- Gmail SMTP delivery with Prisma logging
- Twilio WhatsApp delivery for `whatsapp` and `both` contacts
- Manual `Send Now` and `Retry Failed` actions
- Vercel-ready cron configuration

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill in real values:

```bash
cp .env.example .env
```

3. Generate the Prisma client:

```bash
npm run prisma:generate
```

4. Push the schema to TiDB/MySQL:

```bash
npm run prisma:push
```

5. Start the app:

```bash
npm run dev
```

6. Open `http://localhost:3000/login` and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## JSON import format

Use a JSON array like this in the dashboard import flow:

```json
[
  {
    "title": "Cabinet Avocat Sara Bennani",
    "phone": "+212600000000",
    "city": "Tanger",
    "website": "https://example.com",
    "reviewsCount": 8
  }
]
```

Import behavior:

- `phone` is normalized into Moroccan local format
- `title` is cleaned into `full_name`
- `city` is stored in uppercase
- `firm_name` keeps the original title
- rows are skipped when `phone` is missing or `reviewsCount < 5`
- rows are skipped when another avocat already has the same phone or email

## Required environment variables

- `DATABASE_URL`: TiDB or MySQL connection string
- `JWT_SECRET`: secret used to sign admin sessions
- `ADMIN_EMAIL`: dashboard login email
- `ADMIN_PASSWORD`: dashboard login password
- `SMTP_HOST`: Gmail SMTP host, usually `smtp.gmail.com`
- `SMTP_PORT`: usually `465`
- `SMTP_USER`: Gmail address
- `SMTP_PASS`: Gmail app password
- `SMTP_FROM`: sender email shown in outbound mail
- `CRON_SECRET`: shared secret for Vercel cron protection
- `YOUR_NAME`: closing name used in the email template
- `DEFAULT_CAMPAIGN_NAME`: optional default campaign name used when the first avocat is created
- `DEFAULT_FORM_LINK`: optional default questionnaire link used to auto-create the first campaign
- `TWILIO_SID`: Twilio account SID for WhatsApp sending
- `TWILIO_AUTH_TOKEN`: Twilio auth token
- `TWILIO_WHATSAPP_NUMBER`: Twilio WhatsApp sender, usually in `whatsapp:+...` format

## Suggested data flow

1. Insert `Avocat` rows into the database.
2. Either insert an `OutreachCampaign` row manually, or set `DEFAULT_FORM_LINK` so the app creates a default campaign automatically.
3. New avocats are attached to the active campaign with a `pending` outreach log.
4. Vercel cron calls `/api/send` every hour.
5. The sender processes exactly one email per run: first it tries the earliest `pending` log, and if none exist it retries the earliest `failed` log.

## Deployment on Vercel

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Add all environment variables from `.env.example` in the Vercel dashboard.
4. Make sure `DATABASE_URL` points to your TiDB instance.
5. Deploy.
6. Configure Vercel cron authentication by sending `Authorization: Bearer <CRON_SECRET>` to `/api/send`.

## Notes

- The send route intentionally processes one email per run.
- It prefers the first `pending` outreach log and falls back to the first `failed` log only when no pending log exists.
- WhatsApp sends require a valid Moroccan mobile number starting with `06` or `07`.
- Failed outreach logs stop retrying after 3 attempts.
- For real production scale, a queue worker is a better fit than long function sleeps, but this implementation follows the MVP requirements exactly.
