# ☽ Jyotish Consultations — Full-Stack Web App

A premium, conversion-optimised astrology consultation booking platform built with **Astro + React Islands + Google Apps Script**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (Astro SSR)                  │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Astro    │  │ React Islands│  │ Zustand Store   │  │
│  │ Pages    │  │ (hydrated)   │  │ (shared state)  │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬────────┘  │
└───────┼────────────────┼───────────────────┼────────────┘
        │                │                   │
        ▼                ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│              Cache Layer (localStorage)                  │
│  Boot: 24h UTC reset  │  Slots: 15min max               │
└───────────────────────┬──────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│        Google Apps Script Web App (REST API)             │
│                                                          │
│  /boot ──────────────► Config + Services + Pricing +    │
│                         Content + FAQs + Testimonials    │
│                                                          │
│  /getSlots ──────────► Slot availability (live)         │
│  /lockSlot ──────────► Atomic lock (LockService)        │
│  /releaseSlot ───────► Free lock on dismiss/fail        │
│  /confirmBooking ────► Verify Razorpay + Calendar Meet  │
│  /requestOtp ────────► Send OTP email                   │
│  /verifyOtp ─────────► Validate code                    │
└──────────────────────────┬───────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        Google         Google       Razorpay
         Sheets        Calendar       API
      (database)     (Meet links)  (payments)
```

---

## Quick Start

### 1. Clone & Install

```bash
git clone <repo>
cd astro-jyotish
npm install
cp .env.example .env
```

### 2. Google Sheets Setup

1. Create a new Google Spreadsheet
2. Create all tabs as defined in `scripts/SHEETS_SCHEMA.md`
3. Add your initial data to Config, Services, Pricing, etc.

### 3. Google Apps Script Setup

1. Open the Google Spreadsheet → Extensions → Apps Script
2. Paste the content of `scripts/Code.gs`
3. Enable **Advanced Google Calendar Service**:
   - In the GAS editor: Services → Google Calendar API → Add
4. Set Script Properties (Project Settings → Script Properties):
   ```
   ADMIN_SECRET      = your-secure-admin-token
   RAZORPAY_KEY_ID   = rzp_live_xxx
   RAZORPAY_KEY_SECRET = your_secret
   FROM_EMAIL        = noreply@yourdomain.com
   CALENDAR_ID_DEFAULT = primary (or specific calendar ID)
   ```
5. **Deploy as Web App**:
   - Execute as: **Me**
   - Who has access: **Anyone** (required for public booking API)
   - Copy the deployment URL

6. **Set up daily cleanup trigger**:
   - Triggers → Add trigger → `dailyCleanup` → Time-driven → Day timer → 12:00 AM UTC

### 4. Environment Configuration

```env
PUBLIC_GAS_URL=https://script.google.com/macros/s/YOUR_ID/exec
PUBLIC_RAZORPAY_KEY=rzp_live_xxxxx
PUBLIC_SITE_URL=https://yourdomain.com
RAZORPAY_SECRET=your_razorpay_secret
```

### 5. Run Development Server

```bash
npm run dev
```

### 6. Deploy

```bash
npm run build
npm start
# Or deploy to Vercel/Netlify/Railway
```

---

## Booking Flow (Concurrency-Safe)

```
User selects slot
      │
      ▼
 Check slot status (available?)
      │ YES
      ▼
 lockSlot() ─── LockService.getScriptLock()  ←─ atomic
      │         Sets status='locked', lockToken, lockExpiresAt
      ▼
 Email OTP verification
      │ verified
      ▼
 createRazorpayOrder() ─── backend creates order
      │
      ▼
 Razorpay checkout opens
      │
      ├─── User pays ──────────► confirmBooking()
      │                              ├─ Verify HMAC signature
      │                              ├─ Calendar.Events.insert()
      │                              │   conferenceDataVersion: 1
      │                              │   → generates hangoutLink
      │                              ├─ Mark slot 'booked'
      │                              ├─ Save booking record
      │                              └─ Send confirmation email
      │
      └─── User dismisses ──► releaseSlot()
                                  └─ Sets status back to 'available'
```

---

## Cache Strategy

| Data | Cache Duration | Reset Trigger |
|------|---------------|---------------|
| Boot (config, services, pricing, content, FAQs, testimonials) | 24 hours | 00:00 UTC daily |
| Slot availability | 15 minutes | On booking confirmation |
| Booking records | No cache | Always fresh |
| OTP tokens | No cache | Always fresh |

---

## Admin Panel

Access at `/admin` (no auth UI — use your `ADMIN_SECRET` in the prompt).

| Section | Feature |
|---------|---------|
| Dashboard | 30-day stats, recent bookings table |
| Manage Slots | Create recurring slots, enable/disable, delete |
| Bookings | Full booking list with status filters |
| Content Manager | Edit Hero, About, FAQs, Quick Consult pricing |
| Settings | WhatsApp button, urgency messaging, timezone |

---

## Key Technical Decisions

### Why Google Apps Script?
- Zero hosting cost for the backend
- Integrated Calendar API (Google Meet links)
- GmailApp for transactional emails
- Native Google Sheets as a database
- LockService for atomic concurrency control

### Why Boot Endpoint?
- Single round trip vs. 5-7 separate API calls
- Reduces GAS execution quota consumption by ~85%
- One 24h cache TTL to manage instead of many

### Why Server-Side Recurring Slot Calculation?
- Avoids timezone/DST bugs from browser Date manipulation
- `Utilities.parseDate(localStr, tz, pattern)` in GAS correctly handles IST and other timezone offsets
- Frontend only sends the *template*; backend writes all individual rows

---

## File Structure

```
src/
├── components/
│   ├── admin/           # Admin panel components
│   ├── booking/         # BookingModal (5-step flow)
│   └── islands/         # React islands for public pages
├── layouts/
│   ├── BaseLayout.astro # Public pages layout
│   └── AdminLayout.astro
├── lib/
│   ├── api.ts           # GAS API client
│   ├── cache.ts         # 24h UTC + 15min cache service
│   ├── slots.ts         # Timezone, slot transforms
│   └── types.ts         # All TypeScript types
├── pages/
│   ├── index.astro      # Landing page
│   ├── quick-consult.astro
│   └── admin/           # Admin pages
├── services/
│   ├── otp.ts           # OTP flow service
│   └── payment.ts       # Razorpay integration
├── stores/
│   └── appStore.ts      # Zustand store (shared across islands)
└── styles/
    └── global.css       # Cosmic gold theme

scripts/
├── Code.gs              # Google Apps Script backend
└── SHEETS_SCHEMA.md     # Database schema
```

---

## Extending

**Add a new service:**
1. Add row to `Services` sheet
2. Add pricing rows to `Pricing` sheet
3. Add calendar mapping to `Config`: key=`calendarId_<serviceId>`, value=`<calendarId>`
4. Clear site cache (Admin → Clear Cache button)

**Add a new page content section:**
1. Create `Content_<SectionName>` sheet with `key | value` columns
2. Add `getContentSection('Content_<SectionName>')` call in `getBoot()`
3. Add field to `PageContent` TypeScript type
4. Add editor to `AdminContentManager.tsx`

---

## License

MIT — © 2025 Jyotish Consultations
