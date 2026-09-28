# Velo Growth - Automated Receptionist Demo

Missed call → instant text-back → AI qualification conversation → Cal.com booking link.

## How it works

1. Someone calls your Twilio number.
2. Twilio forwards the call to your real cell phone for 20 seconds.
3. If you don't answer, the caller instantly gets a text apologizing and asking what they need.
4. Claude handles the back-and-forth conversation, figuring out their name and what they want.
5. Once qualified, they get your Cal.com booking link automatically, and the lead is logged.

## One-time setup

### 1. Install dependencies
```
npm install
```

### 2. Set up your environment variables
Copy `.env.example` to `.env` and fill in your real values:
```
cp .env.example .env
```
Then open `.env` and paste in your Twilio SID/Auth Token, your Anthropic API key, your
Cal.com booking link, your own cell number, and your business name.

**Never commit `.env` to GitHub** - it's already in `.gitignore` so this should happen
automatically, but double check before pushing.

### 3. Push this to GitHub
```
git init
git add .
git commit -m "Initial commit - Velo Growth demo"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 4. Deploy to Railway
1. Go to railway.app, click "New Project" > "Deploy from GitHub repo"
2. Select this repo
3. Once deployed, go to the project's "Variables" tab and paste in ALL the values from
   your `.env` file (Railway needs them set there, not in a file, since `.env` never gets
   pushed to GitHub)
4. Railway will give you a public URL like `https://your-project.up.railway.app`

### 5. Point Twilio at your deployed server
In the Twilio Console:
1. Go to Phone Numbers > Manage > Active Numbers > click your number
2. Under "Voice Configuration", set "A call comes in" to point to:
   `https://your-project.up.railway.app/voice` (HTTP POST)
3. Under "Messaging Configuration", set "A message comes in" to point to:
   `https://your-project.up.railway.app/sms` (HTTP POST)
4. Save.

## Testing it

Since you're on a Twilio trial account, you can only call/text your number FROM a
number you've verified in the Twilio Console (Verified Caller IDs). Call your Twilio
number from your verified personal cell, let it ring without answering the forwarded
call (or just don't pick up the forwarded call to your real number), and you should get
a text within a few seconds. Reply to it like a real customer would and watch the
conversation unfold.

## Customizing for a real client

Before using this with an actual med spa client, edit:
- `BUSINESS_NAME` and the services list inside `lib/claude.js`'s system prompt, so the
  AI sounds like it actually knows their business
- `OWNER_PHONE_NUMBER` and `TWILIO_PHONE_NUMBER` to that client's real numbers (ideally
  using a separate Twilio subaccount per client - ask if you want help setting that up)
- `CAL_COM_BOOKING_LINK` to their specific booking page

## What this demo does NOT include yet (intentionally, to keep it shippable)

- Spam/robocall filtering
- Multi-location support
- A real database (currently uses simple JSON files, which is fine at low volume but
  should move to a real database like Postgres before scaling past a handful of clients)
- Automatic Twilio subaccount creation per client (currently manual)

These are all reasonable next steps once you have a real paying or trial client, not
things to build before you have one.
