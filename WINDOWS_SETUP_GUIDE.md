# 🪟 Jyotish Consultations — Complete Windows Setup Guide

> **Audience:** Anyone setting this up on a Windows PC for the first time.  
> **Time:** ~90 minutes end-to-end.  
> **Prerequisites:** A Google account with Gmail and Google Drive.

---

## Table of Contents

1. [Install Required Software](#1-install-required-software)
2. [Get the Project Files](#2-get-the-project-files)
3. [Google Sheets & Apps Script Setup](#3-google-sheets--apps-script-setup)
4. [Configure Script Properties](#4-configure-script-properties)
5. [Enable Google Calendar API in GAS](#5-enable-google-calendar-api-in-gas)
6. [Initialize the Database](#6-initialize-the-database)
7. [Deploy the Web App](#7-deploy-the-web-app)
8. [Set Up the Daily Cleanup Trigger](#8-set-up-the-daily-cleanup-trigger)
9. [Configure Razorpay](#9-configure-razorpay)
10. [Configure the Frontend (.env)](#10-configure-the-frontend-env)
11. [Run Locally (Development)](#11-run-locally-development)
12. [Build & Deploy to Production](#12-build--deploy-to-production)
13. [Post-Launch Checklist](#13-post-launch-checklist)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Install Required Software

Open **PowerShell as Administrator** for each step below.  
*(Right-click the Start button → Windows Terminal (Admin) or PowerShell (Admin))*

### 1a. Node.js 20 LTS

Node.js runs the Astro frontend.

1. Go to **https://nodejs.org** in your browser
2. Click **"LTS"** (the green button — do NOT choose "Current")
3. Run the downloaded `.msi` installer
4. Accept all defaults — tick **"Automatically install necessary tools"** when prompted
5. Restart PowerShell after installation

**Verify:**
```powershell
node --version   # Should print v20.x.x or higher
npm --version    # Should print 10.x.x or higher
```

### 1b. Git

Git lets you download the project and manage versions.

1. Go to **https://git-scm.com/download/win**
2. Download and run the installer
3. Accept all defaults (leave "Use Git from the command line" selected)

**Verify:**
```powershell
git --version    # Should print git version 2.x.x
```

### 1c. Visual Studio Code (recommended editor)

1. Go to **https://code.visualstudio.com**
2. Download and install
3. Open VS Code → Extensions (Ctrl+Shift+X) → install:
   - **Astro** (by Astro)
   - **ESLint**
   - **Prettier**

### 1d. Windows Terminal (optional but recommended)

Available free in the **Microsoft Store** — search "Windows Terminal".  
Much better than the default PowerShell window.

---

## 2. Get the Project Files

### Option A — From the downloaded ZIP

1. Unzip `jyotish-consultations.zip` to a folder, e.g. `C:\Projects\jyotish`
2. Open PowerShell and navigate there:
   ```powershell
   cd C:\Projects\jyotish
   ```

### Option B — From a Git repository

```powershell
cd C:\Projects
git clone https://github.com/YOUR_USERNAME/jyotish-consultations.git
cd jyotish-consultations
```

### Install dependencies

```powershell
npm install
```

Expected output: several lines ending in `added NNN packages`.  
If you see errors, see [Troubleshooting](#14-troubleshooting).

---

## 3. Google Sheets & Apps Script Setup

### 3a. Create a new Google Spreadsheet

1. Open **https://sheets.google.com** in Chrome/Edge
2. Click **"+ Blank"** to create a new spreadsheet
3. Rename it: click "Untitled spreadsheet" at the top → type `Jyotish Consultations DB` → press Enter
4. Copy the **Spreadsheet ID** from the URL bar:
   ```
   https://docs.google.com/spreadsheets/d/  >>>1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms<<<  /edit
   ```
   The long string between `/d/` and `/edit` is your Spreadsheet ID — save it.

### 3b. Open Apps Script

1. In the spreadsheet menu: **Extensions → Apps Script**
2. A new browser tab opens with the GAS editor
3. You will see a file called `Code.gs` with a placeholder function

### 3c. Paste the backend code

1. Select ALL the existing text in `Code.gs` (Ctrl+A)
2. Delete it
3. Open `scripts/Code.gs` from your project folder in VS Code
4. Select all (Ctrl+A), copy (Ctrl+C)
5. Paste into the GAS editor (Ctrl+V)
6. Click the **💾 Save** icon (or Ctrl+S)
7. Name the project: click "Untitled project" at the top → type `Jyotish Backend` → click Rename

---

## 4. Configure Script Properties

Script Properties are like environment variables — they keep secrets out of the code.

1. In the GAS editor, click the **⚙️ gear icon** (Project Settings) in the left sidebar
2. Scroll down to **"Script Properties"**
3. Click **"Add script property"** and add each of these one at a time:

| Property Name | Example Value | Where to get it |
|---|---|---|
| `ADMIN_SECRET` | `MySecureAdminToken123!` | Make up a strong password — you'll use this to log into the admin panel |
| `RAZORPAY_KEY_ID` | `rzp_live_xxxxxxxxxx` | Razorpay dashboard → Settings → API Keys (Step 9) |
| `RAZORPAY_KEY_SECRET` | `your_secret_here` | Same as above — revealed only once |
| `FROM_EMAIL` | `noreply@yourdomain.com` | Your sending email address (must be a Gmail or G Suite account) |
| `CALENDAR_ID_DEFAULT` | `primary` | Use `primary` for your main calendar, or paste a specific Calendar ID |

> ⚠️ **Important:** Click **"Save script properties"** after adding all five.

---

## 5. Enable Google Calendar API in GAS

The Calendar API is needed to generate Google Meet links automatically.

1. In the GAS editor left sidebar, click **"Services"** (the `+` icon next to "Services")
2. Scroll down the list to find **"Google Calendar API"**
3. Select it → click **"Add"**
4. You should now see `Calendar` listed under Services

> If you don't see it, search for "Calendar" in the search box at the top of the services list.

---

## 6. Initialize the Database

This is the key new feature — one click creates all 12 sheets with headers and sample data.

1. In the GAS editor, find the function selector dropdown at the top (it may say `myFunction` or `doGet`)
2. Click it and select **`initializeSheets`**
3. Click the **▶ Run** button
4. **First run:** A popup asks for Google Account permissions
   - Click **"Review permissions"**
   - Choose your Google account
   - Click **"Advanced"** → **"Go to Jyotish Backend (unsafe)"**
     *(This is expected for personal scripts — it's your own code)*
   - Click **"Allow"**
5. The function runs. After a few seconds, a dialog appears:

```
✅ Sheet initialisation complete!

  Created : 12 sheet(s)
  Rebuilt : 0 sheet(s)
  Skipped : 0 sheet(s)

NEXT STEPS:
1. Open Project Settings → Script Properties
...
```

6. Click **OK**

### Verify the sheets were created

Switch back to the Google Sheets tab (or refresh it).  
You should now see tabs at the bottom:

```
Config | Services | Pricing | Testimonials | FAQs | Slots | Bookings |
OTP_Tokens | QuickConsults | Content_Hero | Content_About | Content_QuickConsult
```

Each sheet has:
- **Bold gold headers** on a dark blue row
- **Sample data** pre-filled (except Slots, Bookings, OTP_Tokens)

### Run validateSetup() to confirm

1. In GAS, change the dropdown to **`validateSetup`**
2. Click **▶ Run**
3. A dialog shows:

```
=== SETUP VALIDATION ===

Sheets
  Missing  : None ✓
  Warnings : None ✓

Script Properties
  Missing  : All set ✓
```

If anything shows as missing, address it before continuing.

### Customize sample data

Before going live, edit the following in Google Sheets:

- **Config sheet** — Change `adminEmail` to your real email, `waNumber` to your WhatsApp number
- **Services sheet** — Update service descriptions
- **Pricing sheet** — Set your actual prices (in paise: ₹1,500 = `150000`)
- **Content_Hero sheet** — Your headline and tagline
- **Content_About sheet** — Your bio and credentials

---

## 7. Deploy the Web App

This creates the public API URL that the frontend will call.

1. In the GAS editor, click **"Deploy"** button (top right) → **"New deployment"**
2. Click the **⚙️ gear** next to "Select type" → choose **"Web app"**
3. Fill in:
   - **Description:** `v1 - Initial deployment`
   - **Execute as:** `Me` (your Google account)
   - **Who has access:** `Anyone`
4. Click **"Deploy"**
5. Click **"Authorize access"** if prompted (same permission flow as Step 6)
6. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycby.../exec
   ```
   Save this URL — you need it in Step 10.

> 📌 **Every time you change Code.gs**, you must create a **New Deployment** (not "Manage deployments") to update the live URL. Or use "Manage deployments → Edit → New version" on the same deployment URL.

---

## 8. Set Up the Daily Cleanup Trigger

This automatically releases stale booking locks and cleans up expired OTPs every night.

1. In GAS left sidebar, click **"Triggers"** (clock icon)
2. Click **"+ Add Trigger"** (bottom right)
3. Configure:
   - **Function:** `dailyCleanup`
   - **Deployment:** `Head`
   - **Event source:** `Time-driven`
   - **Time-based trigger type:** `Day timer`
   - **Time of day:** `Midnight to 1am`
4. Click **"Save"**

You should see the trigger listed on the Triggers page.

---

## 9. Configure Razorpay

Razorpay handles all payment processing.

### 9a. Create a Razorpay account

1. Go to **https://razorpay.com** → Sign up
2. Complete KYC verification (required for live payments — takes 1-2 business days)
3. For testing, you can use **Test Mode** immediately (no KYC needed)

### 9b. Get API Keys

1. Log into the Razorpay Dashboard
2. Go to **Settings → API Keys**
3. Click **"Generate Key"** (for Live mode) or use the Test key pair
4. You will see:
   - **Key ID:** `rzp_live_xxxxxxxxxxxx` (or `rzp_test_...` for testing)
   - **Key Secret:** shown only once — copy it immediately

5. Add these to GAS Script Properties (Step 4 above):
   - `RAZORPAY_KEY_ID` = Key ID
   - `RAZORPAY_KEY_SECRET` = Key Secret

### 9c. Configure Webhooks (optional but recommended)

1. In Razorpay Dashboard → Settings → Webhooks → Add New Webhook
2. URL: your Astro API route (e.g., `https://yourdomain.com/api/razorpay-webhook`)
3. Events: tick `payment.captured`, `payment.failed`
4. Secret: a random string you generate

---

## 10. Configure the Frontend (.env)

1. In VS Code, open your project folder
2. Find the file `.env.example` in the root
3. Create a copy named `.env`:
   - In PowerShell: `copy .env.example .env`
   - Or right-click in VS Code Explorer → Copy → Paste → Rename to `.env`
4. Open `.env` and fill in your values:

```env
# The Web App URL from Step 7
PUBLIC_GAS_URL=https://script.google.com/macros/s/AKfycby.../exec

# Razorpay publishable key (NOT the secret)
PUBLIC_RAZORPAY_KEY=rzp_live_xxxxxxxxxxxx

# Your website URL (use http://localhost:4321 for local dev)
PUBLIC_SITE_URL=https://yourdomain.com

# Razorpay secret (server-side only)
RAZORPAY_SECRET=your_key_secret_here
```

> ⚠️ Never commit `.env` to Git. The `.gitignore` file already excludes it.

---

## 11. Run Locally (Development)

```powershell
npm run dev
```

Expected output:
```
🚀  astro  v4.x.x started in NNN ms

  ┃ Local    http://localhost:4321/
  ┃ Network  use --host to expose
```

Open **http://localhost:4321** in your browser.

### What to check

| Page | URL | Expected |
|---|---|---|
| Home | `http://localhost:4321/` | Hero, services, slot picker load |
| Quick Consult | `http://localhost:4321/quick-consult` | Form renders |
| Admin | `http://localhost:4321/admin` | Admin dashboard |

> If pages show "Could not load services" — check your `PUBLIC_GAS_URL` in `.env` and confirm the GAS web app is deployed and accessible.

### Test the full booking flow

1. Open `http://localhost:4321/`
2. First, create a test slot via the Admin panel:
   - Go to `http://localhost:4321/admin/slots`
   - Enter your `ADMIN_SECRET` when prompted
   - Create a slot for tomorrow using the form
3. Return to the home page — the slot should appear in the picker
4. Click a time slot → complete the booking flow

---

## 12. Build & Deploy to Production

### 12a. Build the project

```powershell
npm run build
```

Output goes to `dist/`. If there are TypeScript errors, fix them before deploying.

### 12b. Deploy to Vercel (recommended — free tier)

**One-time setup:**
```powershell
npm install -g vercel
vercel login
```

**Deploy:**
```powershell
vercel
```

Follow the prompts:
- Link to existing project? → **No**
- Project name: `jyotish-consultations`
- Framework: **Astro** (auto-detected)

**Set environment variables in Vercel:**
1. Go to **https://vercel.com** → your project → Settings → Environment Variables
2. Add each variable from your `.env` file (one at a time)
3. For each: Environments → tick **Production**, **Preview**, **Development** → Save

**Redeploy after adding variables:**
```powershell
vercel --prod
```

### 12b (Alternative). Deploy to Netlify

```powershell
npm install -g netlify-cli
netlify login
netlify deploy --build --prod
```

Add environment variables in Netlify Dashboard → Site Settings → Environment Variables.

### 12c. Point your domain

In your domain registrar (GoDaddy, Namecheap, etc.):
- Add a **CNAME record**: `www` → `cname.vercel-dns.com`
- Or follow Vercel/Netlify's custom domain instructions

Then update `PUBLIC_SITE_URL` in Vercel to your actual domain and redeploy.

---

## 13. Post-Launch Checklist

Run through these after going live:

**Google Apps Script**
- [ ] `initializeSheets()` was run and `validateSetup()` shows no errors
- [ ] Script Properties: all 5 values set correctly
- [ ] Google Calendar API enabled (Services → Calendar)
- [ ] Web App deployed with "Anyone" access
- [ ] `dailyCleanup` trigger set to run nightly
- [ ] Tested `initializeSheets()` → dialog shows 12 sheets created

**Content**
- [ ] Config sheet: `adminEmail`, `waNumber`, `siteName` updated
- [ ] Services sheet: real service descriptions
- [ ] Pricing sheet: real prices in paise
- [ ] Content_Hero: your headline
- [ ] Content_About: your bio, years of experience, clients served
- [ ] FAQs: reviewed and edited
- [ ] At least 3 real testimonials added

**Payments**
- [ ] Razorpay: live API keys configured (not test keys)
- [ ] KYC verification completed
- [ ] Test payment processed end-to-end

**Frontend**
- [ ] `.env` has production values (not localhost URLs)
- [ ] `PUBLIC_SITE_URL` is your actual domain (for OG tags and canonical links)
- [ ] All admin pages accessible at `/admin`
- [ ] WhatsApp button appears with correct number

**Email**
- [ ] OTP email arrives within 30 seconds
- [ ] Booking confirmation email has correct Meet link
- [ ] Admin alert email arrives on new booking

---

## 14. Troubleshooting

### `npm install` fails with permission errors

Run PowerShell as Administrator, or:
```powershell
npm install --no-optional
```

### `npm run dev` gives "Cannot find module" errors

```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm run dev
```

### GAS Web App returns 401 or "Script function not found"

- Confirm deployment has **"Who has access: Anyone"** (not "Only myself")
- Create a **new deployment** — don't reuse old versions without bumping the version number
- Check the URL in `.env` ends with `/exec` (not `/dev`)

### `initializeSheets()` shows "Exception: You do not have permission"

- You must run it while **logged in as the spreadsheet owner**
- Go through the permissions dialog carefully — click "Advanced" → "Go to Jyotish Backend"

### Slot picker shows "Could not load" error

1. Open your GAS Web App URL directly in Chrome:
   ```
   https://script.google.com/macros/s/YOUR_ID/exec?action=boot
   ```
2. Should return JSON starting with `{"ok":true,...}`
3. If you see an HTML error page, check GAS execution logs:
   GAS editor → **Executions** (left sidebar) → look for red errors

### Google Meet link is "(Calendar error — contact admin)"

- Confirm "Google Calendar API" is enabled under GAS → Services
- The Google account running the script must have permission to create calendar events
- Check GAS Executions log for the exact Calendar API error message

### Razorpay payment fails in test mode

- Use Razorpay test credentials: Card `4111 1111 1111 1111`, any future expiry, any CVV
- Confirm `RAZORPAY_KEY_ID` starts with `rzp_test_` in test mode
- Check browser console for CORS or network errors

### Windows line-ending issues in `.env`

If your `.env` was created on Windows, it may use `\r\n` line endings. Fix:
```powershell
(Get-Content .env) | Set-Content -Encoding UTF8 .env
```

### `PUBLIC_GAS_URL` environment variable not picked up

After editing `.env`, always restart the dev server:
```powershell
# Stop with Ctrl+C, then:
npm run dev
```

### Port 4321 already in use

```powershell
npm run dev -- --port 4322
```

---

## Quick Reference — Common Commands

```powershell
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Deploy to Vercel
vercel --prod

# Clear npm cache (if install issues)
npm cache clean --force

# Check Node version
node --version

# Update npm to latest
npm install -g npm@latest
```

---

## GAS Functions Reference

| Function | When to run | What it does |
|---|---|---|
| `initializeSheets()` | Once at setup | Creates all 12 sheets with headers + sample data |
| `initializeSheets(true)` | When you want a full reset | WIPES all data and rebuilds everything |
| `validateSetup()` | After initializeSheets | Checks all sheets exist + properties set |
| `dailyCleanup()` | Runs automatically (trigger) | Releases stale locks, deletes expired OTPs |
| `doGet(e)` / `doPost(e)` | Called by the web app URL | Routes API requests — never run manually |

---

*Last updated: 2025 · Jyotish Consultations Setup Guide for Windows*
