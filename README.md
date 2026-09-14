# Simple Daily Task Tracker

A very-simple, mobile-friendly app for tracking daily tasks. No sign-up, no backend, no build step — just open it and tap. It started as a way to track a kid's daily routine (piano practice, chores, reading) with a points-based reward system, but it works for tracking any recurring daily activity you want to build a habit around.

## Why this exists

Spreadsheets work, but they're fiddly on a phone. This app is the opposite: three screens, big tap targets, and nothing to configure beyond naming your activities and how many points each is worth.

## What it does

- Set up to 10 activities (e.g. "Piano practice", "Reading"), each worth a point value you choose, with an optional time-of-day.
- Tap a day's square to mark it **Done** (with an optional short comment, e.g. "lesson 12") or **Missed**.
- A **Redeemed** row on the same grid lets you cash in points for rewards, right next to the activities that earned them.
- **Dashboard** gives Daily / Weekly / Monthly summaries — points earned, points redeemed, and a running **Net** total (your point "balance").
- All data lives in your browser's local storage on your device — nothing is sent anywhere, ever. Back it up or move devices anytime with the Export/Import buttons in Settings.

## Using it

Open `index.html` in any browser — no installs, no build step. Three screens, reachable from the bottom nav:

- **Track** — this week's grid (Sunday–Saturday). Tap any square to log it.
- **Dashboard** — Daily / Weekly / Monthly summary of points, with a day-by-day and activity-by-activity breakdown.
- **Settings** — add, edit, or delete activities; export or import a backup; reset everything.

## Running it locally

It's plain HTML/CSS/JS — no dependencies, no build tooling. Either:

- Double-click `index.html` to open it directly in a browser, or
- Serve the folder with any static file server, e.g. `npx serve .`

## Deploying (GitHub Pages)

This repo is set up to be served straight from GitHub Pages:

1. Go to the repo's **Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`. Save.
4. After a minute or two, it'll be live at:
   `https://karthik647p-creator.github.io/simple-daily-task-tracker/`

Any push to `main` updates the live site automatically after that.

## Tech

Vanilla HTML, CSS, and JavaScript. No frameworks, no npm packages, no backend — just three files.
