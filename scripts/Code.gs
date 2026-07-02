// ============================================================
// scripts/Code.gs  —  Jyotish Consultations Backend
// Google Apps Script Web App
//
// FIRST-TIME SETUP (run once, in this order):
//   1. Paste this file into the GAS editor
//   2. Extensions → Apps Script → Services → Add "Google Calendar API"
//   3. Run initializeSheets()  ← creates ALL tabs + sample data
//   4. Set Script Properties (Project Settings → Script Properties)
//   5. Deploy as Web App → Execute as Me → Access Anyone
//   6. Set up dailyCleanup trigger
// ============================================================

var SS             = SpreadsheetApp.getActiveSpreadsheet();
var PROPS          = PropertiesService.getScriptProperties();
var ADMIN_SEC      = PROPS.getProperty('ADMIN_SECRET')         || '';
var RZP_KEY        = PROPS.getProperty('RAZORPAY_KEY_ID')      || '';
var RZP_SEC        = PROPS.getProperty('RAZORPAY_KEY_SECRET')  || '';
var FROM_EMAIL     = PROPS.getProperty('FROM_EMAIL')           || '';
var DEFAULT_CAL_ID = PROPS.getProperty('CALENDAR_ID_DEFAULT')  || 'primary';

// ── Security constants ────────────────────────────────────
var OTP_RATE_LIMIT_SECONDS  = 60;   // min gap between OTP sends per email
var OTP_MAX_ATTEMPTS        = 5;    // brute-force lockout after N wrong guesses
var OTP_LOCKOUT_SECONDS     = 900;  // 15-min lockout after exhausting attempts
var INPUT_MAX_LENGTH        = 2000; // reject any single field longer than this
var EMAIL_REGEX             = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ── Timing-safe string comparison ────────────────────────
// Prevents timing-attack extraction of ADMIN_SECRET length/content.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Still iterate to consume constant time relative to 'b'
    var dummy = 0;
    for (var i = 0; i < b.length; i++) dummy += b.charCodeAt(i);
    return false;
  }
  var result = 0;
  for (var i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ── Cryptographically-secure random integer [0, max) ─────
// Utilities.getSecureRandom() does NOT exist in Apps Script.
// Utilities.getUuid() is the real CSPRNG-backed API — it calls
// Java's SecureRandom internally and returns a RFC 4122 v4 UUID
// with 122 bits of random entropy. We take 8 hex chars (32 bits)
// which is more than sufficient for a 6-digit OTP.
function secureRandomInt(max) {
  var hex = Utilities.getUuid().replace(/-/g, ''); // 32 hex chars
  var val = parseInt(hex.substring(0, 8), 16);     // 0..4294967295
  return val % max;
}

// ── Secure OTP generator (6 digits, CSPRNG) ───────────────
function generateSecureOtp() {
  return String(secureRandomInt(900000) + 100000); // 100000–999999
}

// ── Input sanitisation ────────────────────────────────────
function sanitiseString(v, maxLen) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  if (s.length > (maxLen || INPUT_MAX_LENGTH)) {
    throw new Error('Input too long (max ' + (maxLen || INPUT_MAX_LENGTH) + ' chars).');
  }
  return s;
}

function validateEmail(email) {
  var e = sanitiseString(email, 254);
  if (!EMAIL_REGEX.test(e)) throw new Error('Invalid email address.');
  return e.toLowerCase();
}

// ============================================================
// █████  INITIALIZE SHEETS  █████████████████████████████████
// ============================================================
/**
 * Run this function ONCE after pasting Code.gs into Apps Script.
 * It creates every required sheet tab with correct headers and
 * populates sample/default data so the app works immediately.
 *
 * Safe to re-run: skips sheets that already exist.
 * Use initializeSheets(true) to WIPE and rebuild everything.
 */
function initializeSheets(forceRebuild) {
  // SpreadsheetApp.getUi() throws when called outside a UI context
  // (e.g. from a time-driven trigger, doGet, or doPost).
  // Detect whether we have a UI and degrade gracefully if not.
  var hasUi = false;
  var ui;
  try {
    ui = SpreadsheetApp.getUi();
    hasUi = true;
  } catch (e) {
    hasUi = false;
  }

  // Confirm destructive rebuild — only when called from the script editor UI
  if (forceRebuild === true && hasUi) {
    var response = ui.alert(
      '⚠️  Rebuild All Sheets?',
      'This will DELETE all existing data and recreate every sheet from scratch.\n\nType "REBUILD" in the next prompt to confirm.',
      ui.ButtonSet.OK_CANCEL
    );
    if (response !== ui.Button.OK) return;
    var confirm = ui.prompt('Type REBUILD to confirm:');
    if (confirm.getResponseText() !== 'REBUILD') {
      ui.alert('Cancelled. No changes were made.');
      return;
    }
  }

  Logger.log('=== initializeSheets START (forceRebuild=' + forceRebuild + ') ===');
  var results = [];

  // ── 1. Config ─────────────────────────────────────────
  results.push(_initSheet('Config',
    [['key', 'value']],
    [
      ['siteName',             'Jyotish Consultations'],
      ['tagline',              'Ancient Wisdom for the Modern Seeker'],
      ['adminEmail',           'admin@yourdomain.com'],
      ['timezone',             'Asia/Kolkata'],
      ['currencySymbol',       '₹'],
      ['currencyCode',         'INR'],
      ['waEnabled',            'true'],
      ['quickConsultPrice',   '49900'],  // paise — used by getCanonicalPrice()
      ['waNumber',             '919876543210'],
      ['waButtonText',         'Chat with us'],
      ['waPosition',           'bottom-right'],
      ['waMessage',            "Hi, I'd like to book a consultation."],
      ['urgencyEnabled',       'true'],
      ['urgencySlotsText',     'Only {n} slot(s) left this week'],
      ['urgencyResponseHours', '3'],
      ['urgencyPromoText',     'Limited spots this month'],
      ['urgencyCountdown',     ''],
      ['calendarId_astrology', 'primary'],
      ['calendarId_numerology','primary'],
      ['calendarId_vastu',     'primary'],
    ],
    forceRebuild
  ));

  // ── 2. Services ───────────────────────────────────────
  results.push(_initSheet('Services',
    [['id','slug','name','shortDescription','fullDescription','durationMinutes','iconEmoji','imageUrl','isActive','order']],
    [
      ['astrology',  'astrology',  'Vedic Astrology',  'Personalised birth chart analysis and life guidance based on Vedic tradition.', 'A deep dive into your birth chart, planetary positions, dashas, and transits. Discover the cosmic blueprint of your life.', 60,  '☽', '', 'TRUE', 1],
      ['numerology', 'numerology', 'Numerology',       'Discover your life path and destiny through the sacred power of numbers.',        'Your numbers reveal your soul purpose, personality, and the cycles of your life. Includes name analysis and lucky dates.',  45,  '🔢', '', 'TRUE', 2],
      ['vastu',      'vastu',      'Vastu Shastra',    'Harmonise your home or office to invite prosperity, health, and peace.',          'Analysis of your floor plan against Vastu principles, with specific, practical remedies tailored to your space.',           60,  '🏠', '', 'TRUE', 3],
    ],
    forceRebuild
  ));

  // ── 3. Pricing ────────────────────────────────────────
  results.push(_initSheet('Pricing',
    [['id','serviceId','label','price','priceDisplay','isPopular','features','ctaText']],
    [
      ['p1', 'astrology',  'Birth Chart Reading',      150000, '₹1,500', 'FALSE', '["Birth chart analysis","Planetary positions","1-year forecast","PDF report"]',                                            'Book Now'],
      ['p2', 'astrology',  'Detailed Life Reading',    250000, '₹2,500', 'TRUE',  '["Everything in Basic","Dasha analysis","Marriage & career guidance","Business timing","2 follow-up questions via email"]',  'Book Now'],
      ['p3', 'numerology', 'Numerology Reading',        99900, '₹999',   'FALSE', '["Life path number","Personality analysis","Lucky dates for 1 year","Name correction guidance"]',                          'Book Now'],
      ['p4', 'vastu',      'Home Vastu Consultation',  199900, '₹1,999', 'FALSE', '["Floor plan analysis","5 actionable remedies","Wealth & health zone mapping","30-min follow-up call"]',                    'Book Now'],
    ],
    forceRebuild
  ));

  // ── 4. Testimonials ───────────────────────────────────
  results.push(_initSheet('Testimonials',
    [['id','name','city','service','rating','body','avatarInitials','createdAt']],
    [
      ['t1', 'Priya Sharma',  'Mumbai',    'Astrology',  5, 'The reading was incredibly accurate. It gave me clarity I had been searching for years. Highly recommended!',           'PS', '2025-01-10'],
      ['t2', 'Rahul Verma',   'Delhi',     'Numerology', 5, 'My numerology reading changed how I approach my business decisions. The lucky dates guidance has been spot on.',        'RV', '2025-02-15'],
      ['t3', 'Anita Nair',    'Bangalore', 'Vastu',      5, 'After implementing the Vastu remedies, the energy in our home completely changed. We feel more peaceful and grounded.', 'AN', '2025-03-01'],
      ['t4', 'Suresh Patel',  'Ahmedabad', 'Astrology',  4, 'Very detailed birth chart analysis. The practitioner took time to explain every aspect clearly.',                       'SP', '2025-03-20'],
      ['t5', 'Kavitha Menon', 'Chennai',   'Astrology',  5, 'I have consulted many astrologers, but this level of depth and accuracy is unmatched. Worth every rupee.',             'KM', '2025-04-05'],
      ['t6', 'Deepak Joshi',  'Pune',      'Vastu',      5, 'The vastu consultation for our new office was transformative. Business has improved noticeably since then.',            'DJ', '2025-04-18'],
    ],
    forceRebuild
  ));

  // ── 5. FAQs ───────────────────────────────────────────
  results.push(_initSheet('FAQs',
    [['id','question','answer','order']],
    [
      ['f1', 'How does the online consultation work?',          'After booking and payment, you will receive a Google Meet link via email. At the scheduled time, simply click the link to join a private video call.',                                                                  1],
      ['f2', 'What information do I need for an astrology reading?', 'You will need your exact date of birth, time of birth (as precise as possible), and city/place of birth. You provide this after payment on our Welcome page.',                                              2],
      ['f3', 'What if I do not know my exact birth time?',     'An approximate time or even just the date can still yield a meaningful reading. Please mention this during the session and the practitioner will adjust the approach accordingly.',                                3],
      ['f4', 'Is my personal information kept confidential?',  'Absolutely. All consultation details are strictly private and never shared with third parties. Your birth details and personal information are used solely for your reading.',                                     4],
      ['f5', 'What is your refund policy?',                    'We offer a full refund if you cancel at least 24 hours before your scheduled session. Cancellations within 24 hours are non-refundable. Quick consultations are non-refundable once submitted.',                 5],
      ['f6', 'Can I book for someone else?',                   'Yes, you can book on behalf of a family member. Please provide their birth details (not yours) on the post-payment Welcome page, and mention this at the start of the session.',                                 6],
      ['f7', 'How long does a Quick Consultation take?',       'Quick consultations are answered in writing, typically within 24 hours of payment and submission. You will receive a detailed written response at your email address.',                                          7],
      ['f8', 'Do you offer sessions in languages other than English?', 'Yes, sessions can be conducted in Hindi and English. Please mention your language preference in the additional notes field during booking.',                                                              8],
    ],
    forceRebuild
  ));

  // ── 6. Slots ──────────────────────────────────────────
  results.push(_initSheet('Slots',
    [['id','serviceId','serviceName','startUtc','endUtc','durationMinutes','status','lockToken','lockExpiresAt','bookingId','meetLink','createdAt']],
    [], // Slots are created via adminCreateSlots; no sample data
    forceRebuild
  ));

  // ── 7. Bookings ───────────────────────────────────────
  results.push(_initSheet('Bookings',
    [['id','slotId','serviceId','name','email','phone','status','razorpayOrderId','razorpayPaymentId','razorpaySignature','meetLink','calendarEventId','dateOfBirth','timeOfBirth','cityOfBirth','additionalNotes','createdAt']],
    [],
    forceRebuild
  ));

  // ── 8. OTP_Tokens ─────────────────────────────────────
  results.push(_initSheet('OTP_Tokens',
    [['email','otp','expiresAt','used','attempts','lockedUntil']],
    [],
    forceRebuild
  ));

  // ── 9. QuickConsults ──────────────────────────────────
  results.push(_initSheet('QuickConsults',
    [['id','name','email','phone','question1','question2','question3','paymentId','status','createdAt']],
    [],
    forceRebuild
  ));

  // ── 9b. Addons ────────────────────────────────────────
  // Optional extras customers can add to any booking.
  // Columns: id | name | description | price (paise) | priceDisplay
  //        | isActive | serviceIds (comma-sep) | popularDefault | order
  results.push(_initSheet('Addons',
    [['id','name','description','price','priceDisplay','isActive','serviceIds','popularDefault','order']],
    [
      ['addon_transit', 'Transit Report', 'Detailed planetary transit forecast for the next 12 months', 19900, '₹199', 'TRUE', '', 'TRUE', 1],
      ['addon_compat',  'Compatibility Analysis', 'Relationship compatibility report with key insights', 29900, '₹299', 'TRUE', 'astrology', 'FALSE', 2],
    ],
    forceRebuild
  ));

  // ── 10. Content_Hero ──────────────────────────────────
  results.push(_initSheet('Content_Hero',
    [['key','value']],
    [
      ['headline',    'Unlock the Secrets\nof Your Stars'],
      ['subheadline', 'Book a private 1-on-1 consultation for astrology, numerology, or Vastu Shastra. Receive deep, personalised insights from an expert Vedic practitioner.'],
      ['ctaText',     'Book a Consultation'],
      ['ctaSubText',  'Secure · Private · Instant confirmation'],
    ],
    forceRebuild
  ));

  // ── 11. Content_About ─────────────────────────────────
  results.push(_initSheet('Content_About',
    [['key','value']],
    [
      ['title',           'About the Practitioner'],
      ['body',            'With over 10 years of dedicated practice in Vedic astrology, numerology, and Vastu Shastra, I have guided more than 2,500 individuals and families toward greater clarity, purpose, and harmony.\n\nMy approach is compassionate, practical, and deeply rooted in ancient tradition — delivered in a language that resonates with modern life.'],
      ['yearsExperience', '10'],
      ['clientsServed',   '2500'],
      ['credentials',     'Certified Vedic Astrologer,Vastu Expert,Numerology Practitioner,Member – Indian Council of Astrological Sciences'],
    ],
    forceRebuild
  ));

  // ── 12. Content_QuickConsult ──────────────────────────
  results.push(_initSheet('Content_QuickConsult',
    [['key','value']],
    [
      ['title',           'Quick Consultation'],
      ['description',     'Not ready for a live session? Ask up to 3 specific questions and receive a personalised, written response via email — usually within 24 hours.'],
      ['maxQuestions',    '3'],
      ['turnaroundHours', '24'],
      ['price',           '49900'],
      ['priceDisplay',    '₹499'],
      ['exampleQ1',       'What does my birth chart say about career growth this year?'],
      ['exampleQ2',       'Is 2025 a good year for marriage based on my numerology?'],
      ['exampleQ3',       'Which direction should my main door face for maximum prosperity?'],
    ],
    forceRebuild
  ));

  // ── 13. Format all sheets ─────────────────────────────
  _formatAllSheets();

  // ── Summary ───────────────────────────────────────────
  var created  = results.filter(function(r){ return r === 'created';  }).length;
  var skipped  = results.filter(function(r){ return r === 'skipped';  }).length;
  var rebuilt  = results.filter(function(r){ return r === 'rebuilt';  }).length;

  var msg = '✅  Sheet initialisation complete!\n\n'
    + '  Created : ' + created  + ' sheet(s)\n'
    + '  Rebuilt : ' + rebuilt  + ' sheet(s)\n'
    + '  Skipped : ' + skipped  + ' sheet(s) (already existed)\n\n'
    + 'NEXT STEPS:\n'
    + '1. Open Project Settings → Script Properties\n'
    + '2. Add: ADMIN_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET,\n'
    + '        FROM_EMAIL, CALENDAR_ID_DEFAULT\n'
    + '3. Enable Google Calendar API (Services menu)\n'
    + '4. Deploy as Web App\n'
    + '5. Set up a daily trigger for dailyCleanup()';

  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert('Jyotish Setup', msg, SpreadsheetApp.getUi().ButtonSet.OK); } catch(e) {}

  return { created: created, skipped: skipped, rebuilt: rebuilt };
}

/**
 * Internal helper — creates or rebuilds a single sheet.
 * Returns 'created', 'rebuilt', or 'skipped'.
 */
function _initSheet(name, headers, dataRows, forceRebuild) {
  var existing = SS.getSheetByName(name);

  if (existing && !forceRebuild) {
    Logger.log('  SKIP  ' + name + ' (already exists)');
    return 'skipped';
  }

  if (existing && forceRebuild) {
    SS.deleteSheet(existing);
    Logger.log('  WIPE  ' + name);
  }

  var s = SS.insertSheet(name);

  // Write headers
  if (headers && headers.length > 0) {
    var headerRow = headers[0];
    s.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);

    // Style header row
    var headerRange = s.getRange(1, 1, 1, headerRow.length);
    headerRange.setBackground('#1a3454')
               .setFontColor('#ffc107')
               .setFontWeight('bold')
               .setFontSize(10);
    s.setFrozenRows(1);
  }

  // Write data rows
  if (dataRows && dataRows.length > 0) {
    s.getRange(2, 1, dataRows.length, dataRows[0].length).setValues(dataRows);
  }

  // Auto-resize columns
  var colCount = (headers[0] || []).length || 1;
  s.autoResizeColumns(1, colCount);

  Logger.log('  OK    ' + name + ' (' + dataRows.length + ' data rows)');
  return existing ? 'rebuilt' : 'created';
}

/**
 * Apply light formatting to all sheets for readability.
 */
function _formatAllSheets() {
  var allSheets = SS.getSheets();
  allSheets.forEach(function(s) {
    // Alternate row colours on data rows
    var lastRow = s.getLastRow();
    if (lastRow > 1) {
      for (var i = 2; i <= lastRow; i++) {
        var bg = (i % 2 === 0) ? '#07111f' : '#0d1f36';
        s.getRange(i, 1, 1, s.getLastColumn()).setBackground(bg).setFontColor('#c8d8e8');
      }
    }
    // Tab colour
    s.setTabColor('#1a3454');
  });
}

/**
 * Validate that all required sheets exist and have headers.
 * Run this after initializeSheets() to confirm everything is OK.
 */
function validateSetup() {
  var required = [
    'Config','Services','Pricing','Testimonials','FAQs',
    'Slots','Bookings','OTP_Tokens','QuickConsults',
    'Content_Hero','Content_About','Content_QuickConsult','Addons'
  ];

  var missing  = [];
  var warnings = [];

  required.forEach(function(name) {
    var s = SS.getSheetByName(name);
    if (!s) {
      missing.push(name);
      return;
    }
    if (s.getLastRow() < 1) {
      warnings.push(name + ' has no header row');
    }
  });

  // Check Script Properties
  var props = PropertiesService.getScriptProperties().getProperties();
  var requiredProps = ['ADMIN_SECRET','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','FROM_EMAIL','CALENDAR_ID_DEFAULT'];
  var missingProps  = requiredProps.filter(function(p){ return !props[p]; });

  var report = '=== SETUP VALIDATION ===\n\n';
  report += 'Sheets\n';
  report += '  Missing  : ' + (missing.length  ? missing.join(', ')  : 'None ✓') + '\n';
  report += '  Warnings : ' + (warnings.length ? warnings.join(', ') : 'None ✓') + '\n\n';
  report += 'Script Properties\n';
  report += '  Missing  : ' + (missingProps.length ? missingProps.join(', ') : 'All set ✓') + '\n';

  Logger.log(report);
  try { SpreadsheetApp.getUi().alert('Validation Report', report, SpreadsheetApp.getUi().ButtonSet.OK); } catch(e) {}
  return { missing: missing, warnings: warnings, missingProps: missingProps };
}

// ============================================================
// ROUTER
// ============================================================
//
// CORS / Content-Type notes
// ─────────────────────────
// GAS Web Apps do NOT emit Access-Control-Allow-Origin headers
// for cross-origin requests.  The browser sends a preflight
// OPTIONS when Content-Type is "application/json", which GAS
// never handles → browser blocks the request before it arrives.
//
// Solution (applied in api.ts on the frontend):
//   POST bodies are sent as Content-Type: text/plain;charset=utf-8
//   "text/plain" is a CORS "simple request" — NO preflight, NO block.
//   GAS stores the body in e.postData.contents regardless of MIME type,
//   so JSON.parse(e.postData.contents) works exactly as before.
//
// doGet handles all read-only calls (boot, getSlots).
// doPost handles all writes and admin calls.
// Both functions add permissive CORS headers via the output object.
// ============================================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  var output = route(action, e ? e.parameter : {}, null);
  return output;
}

function doPost(e) {
  var body = {};
  try {
    // Works whether Content-Type is text/plain or application/json
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
  } catch (parseErr) {
    Logger.log('doPost JSON parse error: ' + parseErr.message);
    return err('Invalid JSON in request body: ' + parseErr.message);
  }
  var action = body.action || '';
  return route(action, body, body);
}

function route(action, params, body) {
  try {
    // Log action but NEVER log params — they may contain tokens or OTPs
    Logger.log('route: action=' + action);
    switch (action) {
      case 'boot':                 return ok(getBoot());
      case 'getSlots':             return ok(getSlots(params));
      case 'lockSlot':             return ok(lockSlot(body));
      case 'releaseSlot':          return ok(releaseSlot(body));
      case 'confirmBooking':       return ok(confirmBooking(body));
      case 'devConfirmBooking':    return ok(devConfirmBooking(body));  // SKIP_PAYMENT path
      case 'createPendingBooking': return ok(createPendingBooking(body));
      case 'saveBirthDetails':     return ok(saveBirthDetails(body));
      case 'requestOtp':           return ok(requestOtp(body));
      case 'verifyOtp':            return ok(verifyOtp(body));
      case 'quickConsult':         return ok(handleQuickConsult(body));
      case 'createRazorpayOrder':  return ok(createRazorpayOrder(body));
      case 'adminGetBookings':     return ok(adminGetBookings(body));
      case 'adminCreateSlots':     return ok(adminCreateSlots(body));
      case 'adminDeleteSlot':      return ok(adminDeleteSlot(body));
      case 'adminToggleSlot':      return ok(adminToggleSlot(body));
      case 'adminUpdateSheet':     return ok(adminUpdateSheet(body));
      case 'adminCancelBooking':   return ok(adminCancelBooking(body));
      case 'fixConfigBooleans':    return ok(fixConfigBooleans());  // repair boolean cells
      case 'adminRescheduleBooking': return ok(adminRescheduleBooking(body));
      case 'adminGetBookingBySlot': return ok(adminGetBookingBySlot(body));
      case 'checkSlot':            return ok(checkSlot(params));   // live availability check (GET)
      case 'adminGetQuickConsults':  return ok(adminGetQuickConsults(body));
      case 'adminAnswerQuickConsult': return ok(adminAnswerQuickConsult(body));
      default:
        Logger.log('Unknown action: ' + action);
        return err('Unknown action: ' + action);
    }
  } catch (routeErr) {
    Logger.log('ROUTE ERROR [' + action + ']: ' + routeErr.message + '\n' + routeErr.stack);
    return err(routeErr.message);
  }
}

// ── Response helpers ──────────────────────────────────────
// NOTE: GAS ContentService cannot add arbitrary HTTP headers,
// so CORS is handled by using text/plain on the client side
// (avoids the preflight entirely — see comment above).
function ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err(msg, code) {
  Logger.log('err(): ' + msg);
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: msg || 'Unknown error', code: code || 'ERROR' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SHEET HELPERS
// ============================================================
function sheet(name) {
  var s = SS.getSheetByName(name);
  if (!s) throw new Error('Sheet "' + name + '" not found. Run initializeSheets() first.');
  return s;
}

function sheetRows(name) {
  var s    = sheet(name);
  var data = s.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function generateId(prefix) {
  return (prefix || 'id') + '_' + Utilities.getUuid().replace(/-/g, '').substr(0, 12);
}

// ============================================================
// BOOT ENDPOINT
// Single request returning ALL static data.
// Client caches 24h with UTC midnight reset.
// ============================================================
function getBoot() {
  var config       = getConfig();
  var services     = sheetRows('Services').filter(function(r) {
    // cfgBool handles all forms: boolean true, 'TRUE', 'true', 'True', 1
    return cfgBool(r.isActive);
  });
  var pricing      = sheetRows('Pricing');
  var testimonials = sheetRows('Testimonials');
  var faqs         = sheetRows('FAQs');

  pricing = pricing.map(function(p) {
    try { p.features = JSON.parse(p.features); } catch (e) { p.features = []; }
    p.isPopular = (p.isPopular === 'TRUE' || p.isPopular === true);
    p.price = parseInt(p.price) || 0;
    return p;
  });

  var content = {
    hero:         getContentSection('Content_Hero'),
    about:        getContentSection('Content_About'),
    quickConsult: getContentSection('Content_QuickConsult'),
  };

  // Load add-ons (graceful — sheet may not exist on old installs)
  var addons = getAddons();

  return {
    v:            2,
    config:       config,
    services:     services,
    pricing:      pricing,
    testimonials: testimonials,
    faqs:         faqs.sort(function(a, b) {
      return (parseInt(a.order) || 0) - (parseInt(b.order) || 0);
    }),
    content: content,
    addons:  addons,
  };
}

// ── getAddons — load and normalise the Addons sheet ─────────
// Returns [] if the Addons sheet does not exist yet (backwards-
// compatible with installs that pre-date the add-on feature).
function getAddons() {
  try {
    var s = SS.getSheetByName('Addons');
    if (!s) return [];
    var rows = sheetRows('Addons');
    return rows
      .filter(function(a) { return cfgBool(a.isActive); })
      .map(function(a) {
        return {
          id:             String(a.id || ''),
          name:           String(a.name || ''),
          description:    String(a.description || ''),
          price:          parseInt(a.price) || 0,
          priceDisplay:   String(a.priceDisplay || ''),
          isActive:       cfgBool(a.isActive),
          serviceIds:     a.serviceIds
            ? String(a.serviceIds).split(',').map(function(s){return s.trim();}).filter(Boolean)
            : [],
          popularDefault: cfgBool(a.popularDefault),
          order:          parseInt(a.order) || 0,
        };
      })
      .sort(function(a, b) { return a.order - b.order; });
  } catch (e) {
    Logger.log('getAddons error (non-fatal): ' + e.message);
    return [];
  }
}

// ── fixConfigBooleans ────────────────────────────────────────
// Run this manually from the GAS editor if the Config sheet has
// boolean TRUE/FALSE cells (instead of string 'true'/'false').
// Google Sheets auto-converts string 'true' → boolean TRUE on setValue().
// This utility rewrites them as plain text with @-format.
function fixConfigBooleans(body) {
  if (!verifyAdmin(body && body.adminToken)) throw new Error('Unauthorized');
  var s       = sheet('Config');
  var data    = s.getDataRange().getValues();
  var headers = data[0];
  var keyCol  = headers.indexOf('key')   + 1;
  var valCol  = headers.indexOf('value') + 1;
  var boolKeys = ['waEnabled', 'urgencyEnabled'];
  var fixed   = 0;

  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][keyCol - 1]);
    if (boolKeys.indexOf(key) === -1) continue;
    var raw = data[i][valCol - 1];
    // If the cell contains a boolean, rewrite as text
    if (typeof raw === 'boolean') {
      var textVal = raw ? 'true' : 'false';
      var cell = s.getRange(i + 1, valCol);
      cell.setNumberFormat('@'); // force text format
      cell.setValue(textVal);
      Logger.log('fixConfigBooleans: fixed key=' + key + ' from boolean ' + raw + ' to string "' + textVal + '"');
      fixed++;
    }
  }
  Logger.log('fixConfigBooleans: fixed ' + fixed + ' cell(s)');
  return { fixed: fixed };
}

// ── cfgBool: tolerant boolean coercion ──────────────────────
// Google Sheets auto-converts string 'true' → boolean TRUE via setValue().
// getValues() then returns boolean true, NOT string 'true'.
// cfg.waEnabled === 'true' would FAIL (boolean true !== string 'true').
// This helper handles all truthy forms from Sheets:
//   boolean true | string 'true' | string 'TRUE' | string 'True' | number 1
function cfgBool(v) {
  if (v === true)  return true;
  if (v === false) return false;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return Boolean(v);
}

function getConfig() {
  var rows = sheetRows('Config');
  var cfg  = {};
  rows.forEach(function(r) { cfg[r.key] = r.value; });

  Logger.log('getConfig: waEnabled raw=' + JSON.stringify(cfg.waEnabled) +
    ' type=' + typeof cfg.waEnabled +
    ' urgencyEnabled raw=' + JSON.stringify(cfg.urgencyEnabled));

  return {
    siteName:       cfg.siteName       || 'Jyotish Consultations',
    tagline:        cfg.tagline        || '',
    adminEmail:     cfg.adminEmail     || '',
    timezone:       cfg.timezone       || 'Asia/Kolkata',
    currencySymbol: cfg.currencySymbol || '₹',
    currencyCode:   cfg.currencyCode   || 'INR',
    whatsapp: {
      enabled:        cfgBool(cfg.waEnabled),
      number:         cfg.waNumber        || '',
      buttonText:     cfg.waButtonText    || 'Chat with us',
      position:       cfg.waPosition      || 'bottom-right',
      defaultMessage: cfg.waMessage       || 'Hi, I would like to book a consultation.',
    },
    urgency: {
      enabled:           cfgBool(cfg.urgencyEnabled),
      slotsLeftText:     cfg.urgencySlotsText    || '',
      responseTimeHours: parseInt(cfg.urgencyResponseHours) || 3,
      promoText:         cfg.urgencyPromoText     || 'Limited spots this month',
      countdownEndTime:  cfg.urgencyCountdown     || '',
    },
    calendarMap: {},
  };
}

function getContentSection(sheetName) {
  try {
    var rows = sheetRows(sheetName);
    var obj  = {};
    rows.forEach(function(r) { obj[r.key] = r.value; });
    if (obj.yearsExperience) obj.yearsExperience = parseInt(obj.yearsExperience) || 0;
    if (obj.clientsServed)   obj.clientsServed   = parseInt(obj.clientsServed)   || 0;
    if (obj.maxQuestions)    obj.maxQuestions    = parseInt(obj.maxQuestions)    || 3;
    if (obj.turnaroundHours) obj.turnaroundHours = parseInt(obj.turnaroundHours) || 24;
    if (obj.price)           obj.price           = parseInt(obj.price)           || 0;
    if (obj.credentials)     obj.credentials     = obj.credentials.split(',').map(function(s) { return s.trim(); });
    return obj;
  } catch (e) {
    Logger.log('getContentSection failed for ' + sheetName + ': ' + e.message);
    return {};
  }
}

// ============================================================
// SLOTS
// ============================================================
function getSlots(params) {
  var serviceId = params.serviceId;
  var fromDate  = params.fromDate;
  var days      = parseInt(params.days) || 14;
  if (!serviceId) throw new Error('serviceId is required');

  var fromMs = new Date(fromDate + 'T00:00:00Z').getTime();
  var toMs   = fromMs + days * 86400000;

  // Normalise for comparison — trims whitespace and lowercases
  // so a serviceId stored as 'numerology ' still matches 'numerology'
  var normServiceId = String(serviceId).trim().toLowerCase();

  return sheetRows('Slots').filter(function(s) {
    if (String(s.serviceId || '').trim().toLowerCase() !== normServiceId) return false;
    var startMs = new Date(s.startUtc).getTime();
    return startMs >= fromMs && startMs < toMs;
  }).map(function(s) {
    return {
      id:              s.id,
      serviceId:       s.serviceId,
      serviceName:     s.serviceName     || '',
      startUtc:        s.startUtc,
      endUtc:          s.endUtc,
      durationMinutes: parseInt(s.durationMinutes) || 60,
      status:          s.status          || 'available',
      lockExpiresAt:   s.lockExpiresAt   || null,
    };
  });
}

// ============================================================
// LOCK / RELEASE  (atomic via LockService)
// ============================================================
// ── checkSlot — live read of a single slot's status ─────────
// Called by the frontend BEFORE lockSlot to give the user fast
// feedback without taking a lock. Uses LockService so it reads
// a consistent snapshot even if a concurrent lockSlot is running.
function checkSlot(params) {
  var slotId = params.slotId;
  if (!slotId) throw new Error('slotId required');

  // Use a read inside LockService to get a consistent view
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var slotsSheet = sheet('Slots');
    var data       = slotsSheet.getDataRange().getValues();
    var headers    = data[0];
    var idCol      = headers.indexOf('id');
    var statusCol  = headers.indexOf('status');
    var lockExpCol = headers.indexOf('lockExpiresAt');
    var lockTokCol = headers.indexOf('lockToken');

    for (var i = 1; i < data.length; i++) {
      if (data[i][idCol] !== slotId) continue;

      var rawStatus  = String(data[i][statusCol] || 'available');
      var lockExpiry = data[i][lockExpCol] ? String(data[i][lockExpCol]) : null;

      // Auto-expire stale locks for the response — does NOT write to sheet
      var effectiveStatus = rawStatus;
      if (rawStatus === 'locked' && lockExpiry && new Date(lockExpiry) < new Date()) {
        effectiveStatus = 'available';
        lockExpiry      = null;
      }

      Logger.log('checkSlot: slotId=' + slotId + ' rawStatus=' + rawStatus + ' effective=' + effectiveStatus);
      return {
        slotId:        slotId,
        status:        effectiveStatus,
        lockExpiresAt: lockExpiry || null,
      };
    }
    throw new Error('Slot not found: ' + slotId);
  } finally {
    lock.releaseLock();
  }
}

// ── lockSlot — atomically reserves a slot ────────────────
// FIX BUG 3: Called BEFORE the booking form opens, not inside
// the payment step.
// FIX RACE: Uses LockService.getScriptLock() so two concurrent
// requests cannot both succeed for the same slot.
// FIX EXPIRED LOCKS: Expired locks are cleaned up atomically
// inside the same LockService critical section — no separate
// cleanup pass needed.
function lockSlot(body) {
  var slotId    = body.slotId;
  var bookingId = body.bookingId;
  if (!slotId)    throw new Error('slotId required');
  if (!bookingId) throw new Error('bookingId required');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // wait up to 10s for the mutex

  try {
    var slotsSheet = sheet('Slots');
    var data       = slotsSheet.getDataRange().getValues();
    var headers    = data[0];
    var idCol      = headers.indexOf('id');
    var statusCol  = headers.indexOf('status');
    var lockCol    = headers.indexOf('lockExpiresAt');
    var lockTokCol = headers.indexOf('lockToken');
    var bookingCol = headers.indexOf('bookingId');

    for (var i = 1; i < data.length; i++) {
      if (data[i][idCol] !== slotId) continue;

      var currentStatus = String(data[i][statusCol] || '');
      var lockExpiry    = data[i][lockCol] ? String(data[i][lockCol]) : null;

      // Auto-expire stale locks atomically within the critical section
      if (currentStatus === 'locked' && lockExpiry) {
        var expiryTime = new Date(lockExpiry).getTime();
        if (!isNaN(expiryTime) && expiryTime < Date.now()) {
          Logger.log('lockSlot: expiring stale lock on slot ' + slotId + ' (expired at ' + lockExpiry + ')');
          currentStatus = 'available';
          // Write the cleanup immediately so other readers see it
          slotsSheet.getRange(i + 1, statusCol  + 1).setValue('available');
          slotsSheet.getRange(i + 1, lockCol    + 1).setValue('');
          slotsSheet.getRange(i + 1, lockTokCol + 1).setValue('');
        }
      }

      if (currentStatus === 'booked') {
        throw new Error('Slot is already booked and cannot be reserved.');
      }
      if (currentStatus === 'disabled') {
        throw new Error('Slot is not available for booking.');
      }
      if (currentStatus === 'locked') {
        // Still validly locked by another user
        throw new Error('Slot is temporarily held by another user. Please try a different time.');
      }
      if (currentStatus !== 'available') {
        throw new Error('Slot is no longer available (status: ' + currentStatus + ').');
      }

      // All checks passed — acquire the lock
      var lockToken   = generateId('lk');
      var lockExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

      slotsSheet.getRange(i + 1, statusCol  + 1).setValue('locked');
      slotsSheet.getRange(i + 1, lockCol    + 1).setValue(lockExpires);
      slotsSheet.getRange(i + 1, lockTokCol + 1).setValue(lockToken);
      if (bookingCol !== -1) {
        slotsSheet.getRange(i + 1, bookingCol + 1).setValue(bookingId);
      }

      Logger.log('lockSlot: acquired lock on ' + slotId + ' token=' + lockToken + ' expires=' + lockExpires);
      return { lockToken: lockToken, lockExpiresAt: lockExpires };
    }
    throw new Error('Slot not found: ' + slotId);
  } finally {
    lock.releaseLock();
  }
}

function releaseSlot(body) {
  var slotId    = body.slotId;
  var lockToken = body.lockToken;

  var slotsSheet = sheet('Slots');
  var data       = slotsSheet.getDataRange().getValues();
  var headers    = data[0];
  var idCol      = headers.indexOf('id');
  var statusCol  = headers.indexOf('status');
  var lockTokCol = headers.indexOf('lockToken');
  var lockCol    = headers.indexOf('lockExpiresAt');

  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] !== slotId) continue;
    if (data[i][statusCol] === 'booked')                         return { released: false };
    if (lockToken && data[i][lockTokCol] !== lockToken)          return { released: false };
    slotsSheet.getRange(i + 1, statusCol  + 1).setValue('available');
    slotsSheet.getRange(i + 1, lockTokCol + 1).setValue('');
    slotsSheet.getRange(i + 1, lockCol    + 1).setValue('');
    return { released: true };
  }
  return { released: false };
}

// ============================================================
// BOOKING CONFIRMATION
// ============================================================
// ── devConfirmBooking ─────────────────────────────────────
// Called when PUBLIC_SKIP_PAYMENT=true on the frontend.
// Performs ALL the same work as confirmBooking() — creates the
// Calendar event, generates the Meet link, marks the slot as
// booked, writes the Bookings row, sends the confirmation email —
// but skips the Razorpay HMAC signature verification since there
// is no real payment transaction.
//
// Security: This function still verifies the lockToken against the
// sheet, so it cannot be abused to confirm arbitrary slots.
// In production, PUBLIC_SKIP_PAYMENT must be false so this is
// never called from the live frontend.
function devConfirmBooking(body) {
  // SECURITY: devConfirmBooking MUST be gated by admin auth.
  // Without this, any caller with a lockToken can get a free booking.
  // On the frontend, SKIP_PAYMENT sends the GAS_ADMIN_SECRET env var
  // as body.adminToken — this is safe because SKIP_PAYMENT=true is
  // never set in production.
  if (!verifyAdmin(body.adminToken)) {
    Logger.log('devConfirmBooking: Unauthorized attempt');
    throw new Error('Unauthorized');
  }

  var bookingId = sanitiseString(body.bookingId, 100);
  var slotId    = sanitiseString(body.slotId, 100);
  var lockToken = sanitiseString(body.lockToken, 200);
  var name      = sanitiseString(body.name, 200);
  var email     = validateEmail(body.email);
  var phone     = sanitiseString(body.phone, 20);
  var serviceId = sanitiseString(body.serviceId, 100);

  Logger.log('devConfirmBooking: bookingId=' + bookingId + ' slotId=' + slotId);

  if (!bookingId) throw new Error('bookingId is required');
  if (!slotId)    throw new Error('slotId is required');
  if (!lockToken) throw new Error('lockToken is required');

  // ── Validate lockToken ownership (same as real confirmBooking) ──
  var slotRow    = null;
  var devLock    = LockService.getScriptLock();
  devLock.waitLock(10000);
  try {
    var slotData    = sheet('Slots').getDataRange().getValues();
    var slotHeaders = slotData[0];
    var sIdCol      = slotHeaders.indexOf('id');
    var sStatCol    = slotHeaders.indexOf('status');
    var sTokCol     = slotHeaders.indexOf('lockToken');
    var sExpCol     = slotHeaders.indexOf('lockExpiresAt');

    for (var sk = 1; sk < slotData.length; sk++) {
      if (slotData[sk][sIdCol] !== slotId) continue;

      var rowStatus = String(slotData[sk][sStatCol] || '');
      var rowToken  = String(slotData[sk][sTokCol]  || '');
      var rowExpiry = slotData[sk][sExpCol] ? String(slotData[sk][sExpCol]) : null;

      if (rowStatus === 'booked') {
        throw new Error('Slot is already booked.');
      }
      if (rowToken !== lockToken) {
        Logger.log('devConfirmBooking: TOKEN MISMATCH slot=' + slotId + ' expected=' + rowToken + ' got=' + lockToken);
        throw new Error('Slot reservation mismatch. Your hold may have expired. Please rebook.');
      }
      if (rowExpiry) {
        var expMs = new Date(rowExpiry).getTime();
        if (!isNaN(expMs) && expMs < Date.now()) {
          throw new Error('Slot reservation expired. Please select a new time.');
        }
      }

      // Build row object for email/calendar use
      var headers = slotData[0];
      var rowObj  = {};
      headers.forEach(function(h, idx) { rowObj[h] = slotData[sk][idx]; });
      slotRow = rowObj;
      break;
    }
  } finally {
    devLock.releaseLock();
  }

  if (!slotRow) throw new Error('Slot not found: ' + slotId);

  // ── Create Google Calendar event + Meet link ──────────────
  var calendarId = getCalendarForService(serviceId);
  var meetLink   = '';
  var calEventId = '';

  try {
    var startTime = new Date(slotRow.startUtc);
    var endTime   = new Date(slotRow.endUtc);

    var eventResource = {
      summary:     slotRow.serviceName + ' Consultation — ' + name,
      description: 'Booking ID: ' + bookingId + '[DEV MODE - no payment charged]Client: ' + name + 'Email: ' + email + 'Phone: ' + phone,
      start:  { dateTime: startTime.toISOString(), timeZone: 'UTC' },
      end:    { dateTime: endTime.toISOString(),   timeZone: 'UTC' },
      attendees: [
        { email: email,      displayName: name },
        { email: FROM_EMAIL, displayName: 'Jyotish Consultations' },
      ],
      conferenceData: {
        createRequest: {
          requestId:             bookingId + '_dev_meet',
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      guestsCanSeeOtherGuests: false,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 },
          { method: 'email', minutes: 60   },
          { method: 'popup', minutes: 10   },
        ],
      },
    };

    var calEvent = Calendar.Events.insert(eventResource, calendarId, { conferenceDataVersion: 1 });
    calEventId   = calEvent.id;
    meetLink     = calEvent.hangoutLink || '';

    if (!meetLink && calEvent.conferenceData && calEvent.conferenceData.entryPoints) {
      for (var ep = 0; ep < calEvent.conferenceData.entryPoints.length; ep++) {
        if (calEvent.conferenceData.entryPoints[ep].entryPointType === 'video') {
          meetLink = calEvent.conferenceData.entryPoints[ep].uri;
          break;
        }
      }
    }
    Logger.log('devConfirmBooking: meetLink=' + meetLink + ' calEventId=' + calEventId);
  } catch (calErr) {
    Logger.log('devConfirmBooking Calendar API error: ' + calErr.message);
    meetLink = '(Calendar error — contact admin)';
    sendAdminAlert('devConfirmBooking Calendar API failed for booking ' + bookingId + ': ' + calErr.message);
  }

  // ── Mark slot as booked ───────────────────────────────────
  var slotsSheet = sheet('Slots');
  var sd         = slotsSheet.getDataRange().getValues();
  var sh         = sd[0];
  for (var si = 1; si < sd.length; si++) {
    if (sd[si][sh.indexOf('id')] !== slotId) continue;
    slotsSheet.getRange(si + 1, sh.indexOf('status')    + 1).setValue('booked');
    slotsSheet.getRange(si + 1, sh.indexOf('meetLink')  + 1).setValue(meetLink);
    slotsSheet.getRange(si + 1, sh.indexOf('bookingId') + 1).setValue(bookingId);
    slotsSheet.getRange(si + 1, sh.indexOf('lockToken') + 1).setValue('');
    break;
  }

  // ── Write Bookings row ────────────────────────────────────
  var bookingsSheet = sheet('Bookings');
  var bData         = bookingsSheet.getDataRange().getValues();
  var bh            = bData[0];
  var rowUpdated    = false;

  for (var bi = 1; bi < bData.length; bi++) {
    if (bData[bi][bh.indexOf('id')] !== bookingId) continue;
    bookingsSheet.getRange(bi + 1, bh.indexOf('status')          + 1).setValue('confirmed');
    bookingsSheet.getRange(bi + 1, bh.indexOf('meetLink')        + 1).setValue(meetLink);
    bookingsSheet.getRange(bi + 1, bh.indexOf('calendarEventId') + 1).setValue(calEventId);
    rowUpdated = true;
    break;
  }

  if (!rowUpdated) {
    bookingsSheet.appendRow([
      bookingId, slotId, serviceId, name, email, phone,
      'confirmed', '', '', '',
      meetLink, calEventId, '', '', '', '', new Date().toISOString(),
    ]);
  }

  // ── Send confirmation email ───────────────────────────────
  sendConfirmationEmail({
    to: email, name: name, bookingId: bookingId,
    meetLink: meetLink, slotRow: slotRow,
  });

  Logger.log('devConfirmBooking: complete for bookingId=' + bookingId);
  return { bookingId: bookingId, meetLink: meetLink, calendarEventId: calEventId };
}

function confirmBooking(body) {
  var bookingId         = body.bookingId;
  var slotId            = body.slotId;
  var razorpayPaymentId = body.razorpayPaymentId;
  var razorpayOrderId   = body.razorpayOrderId;
  var razorpaySignature = body.razorpaySignature;
  var name              = body.name;
  var email             = body.email;
  var phone             = body.phone;
  var serviceId         = body.serviceId;
  var lockToken         = body.lockToken;
  // Add-ons: array of addon IDs selected by the client
  var addonIds          = Array.isArray(body.addonIds) ? body.addonIds : [];

  // 1. Verify Razorpay HMAC signature
  var expectedSig = computeHmacSha256(razorpayOrderId + '|' + razorpayPaymentId, RZP_SEC);
  if (expectedSig !== razorpaySignature) {
    throw new Error('Payment signature verification failed.');
  }

  // 2. Validate slot ownership with LockService (FIX BUG 4)
  // We must verify:
  //   a) Slot exists
  //   b) Slot is currently 'locked' (not available, booked, or disabled)
  //   c) The lockToken in the request matches the one in the sheet
  // This prevents a race where two users both get through payment
  // and the second one's confirmBooking overwrites the first.
  var slotRow = null;
  var confirmLock = LockService.getScriptLock();
  confirmLock.waitLock(10000);
  try {
    var slotData    = sheet('Slots').getDataRange().getValues();
    var slotHeaders = slotData[0];
    var sIdCol   = slotHeaders.indexOf('id');
    var sStatCol = slotHeaders.indexOf('status');
    var sTokCol  = slotHeaders.indexOf('lockToken');
    var sExpCol  = slotHeaders.indexOf('lockExpiresAt');

    for (var sk = 1; sk < slotData.length; sk++) {
      if (slotData[sk][sIdCol] !== slotId) continue;

      var rowStatus  = String(slotData[sk][sStatCol] || '');
      var rowToken   = String(slotData[sk][sTokCol]  || '');
      var rowExpiry  = slotData[sk][sExpCol] ? String(slotData[sk][sExpCol]) : null;

      Logger.log('confirmBooking: slot=' + slotId + ' status=' + rowStatus + ' token_match=' + (rowToken === lockToken));

      // Build a plain object matching what sheetRows() would return
      var headers = slotData[0];
      var rowObj  = {};
      headers.forEach(function(h, idx) { rowObj[h] = slotData[sk][idx]; });
      slotRow = rowObj;

      if (rowStatus === 'booked') {
        throw new Error('Slot is already booked. Duplicate payment? Contact support with booking ID: ' + bookingId);
      }

      // Verify token ownership — prevents cross-user confirmation
      if (!lockToken) {
        throw new Error('lockToken is required for booking confirmation.');
      }
      if (rowToken !== lockToken) {
        Logger.log('confirmBooking: TOKEN MISMATCH slot=' + slotId + ' expected=' + rowToken + ' got=' + lockToken);
        throw new Error('Slot reservation mismatch. Your hold may have expired. Please rebook.');
      }

      // Check lock has not expired
      if (rowExpiry) {
        var expMs = new Date(rowExpiry).getTime();
        if (!isNaN(expMs) && expMs < Date.now()) {
          throw new Error('Slot reservation expired. Please select a new time and complete payment.');
        }
      }

      // Token matches and lock is valid — proceed
      break;
    }
  } finally {
    confirmLock.releaseLock();
  }

  if (!slotRow) throw new Error('Slot not found: ' + slotId);

  // 3. Generate Google Meet link via Calendar API
  var calendarId = getCalendarForService(serviceId);
  var meetLink   = '';
  var calEventId = '';

  try {
    var startTime = new Date(slotRow.startUtc);
    var endTime   = new Date(slotRow.endUtc);

    var eventResource = {
      summary:     slotRow.serviceName + ' Consultation — ' + name,
      description: 'Booking ID: ' + bookingId + '\nClient: ' + name + '\nEmail: ' + email + '\nPhone: ' + phone,
      start:  { dateTime: startTime.toISOString(), timeZone: 'UTC' },
      end:    { dateTime: endTime.toISOString(),   timeZone: 'UTC' },
      attendees: [
        { email: email,      displayName: name },
        { email: FROM_EMAIL, displayName: 'Jyotish Consultations' },
      ],
      conferenceData: {
        createRequest: {
          requestId:             bookingId + '_meet',
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      guestsCanSeeOtherGuests: false,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 },
          { method: 'email', minutes: 60   },
          { method: 'popup', minutes: 10   },
        ],
      },
    };

    // conferenceDataVersion:1 is REQUIRED for Meet link generation
    var calEvent = Calendar.Events.insert(eventResource, calendarId, { conferenceDataVersion: 1 });
    calEventId   = calEvent.id;
    meetLink     = calEvent.hangoutLink || '';

    if (!meetLink && calEvent.conferenceData && calEvent.conferenceData.entryPoints) {
      for (var ep = 0; ep < calEvent.conferenceData.entryPoints.length; ep++) {
        if (calEvent.conferenceData.entryPoints[ep].entryPointType === 'video') {
          meetLink = calEvent.conferenceData.entryPoints[ep].uri;
          break;
        }
      }
    }
  } catch (calErr) {
    Logger.log('Calendar API error: ' + calErr.message);
    meetLink = '(Calendar error — contact admin)';
    sendAdminAlert('Calendar API failed for booking ' + bookingId + ': ' + calErr.message);
  }

  // 4. Mark slot as booked
  var slotsSheet = sheet('Slots');
  var slotData   = slotsSheet.getDataRange().getValues();
  var sh         = slotData[0];
  for (var si = 1; si < slotData.length; si++) {
    if (slotData[si][sh.indexOf('id')] !== slotId) continue;
    slotsSheet.getRange(si + 1, sh.indexOf('status')    + 1).setValue('booked');
    slotsSheet.getRange(si + 1, sh.indexOf('meetLink')  + 1).setValue(meetLink);
    slotsSheet.getRange(si + 1, sh.indexOf('bookingId') + 1).setValue(bookingId);
    break;
  }

  // 5. Update or create booking record
  var bookingsSheet = sheet('Bookings');
  var bData         = bookingsSheet.getDataRange().getValues();
  var bh            = bData[0];
  var rowUpdated    = false;

  for (var bi = 1; bi < bData.length; bi++) {
    if (bData[bi][bh.indexOf('id')] !== bookingId) continue;
    bookingsSheet.getRange(bi + 1, bh.indexOf('status')            + 1).setValue('confirmed');
    bookingsSheet.getRange(bi + 1, bh.indexOf('meetLink')          + 1).setValue(meetLink);
    bookingsSheet.getRange(bi + 1, bh.indexOf('razorpayPaymentId') + 1).setValue(razorpayPaymentId);
    bookingsSheet.getRange(bi + 1, bh.indexOf('calendarEventId')   + 1).setValue(calEventId);
    rowUpdated = true;
    break;
  }

  if (!rowUpdated) {
    bookingsSheet.appendRow([
      bookingId, slotId, serviceId, name, email, phone,
      'confirmed', razorpayOrderId, razorpayPaymentId, razorpaySignature,
      meetLink, calEventId, '', '', '', '', new Date().toISOString(),
    ]);
  }

  // 6. Send confirmation email
  sendConfirmationEmail({ to: email, name: name, bookingId: bookingId, meetLink: meetLink, slotRow: slotRow });

  return { bookingId: bookingId, meetLink: meetLink, calendarEventId: calEventId };
}

function createPendingBooking(body) {
  var id = generateId('bkg');
  sheet('Bookings').appendRow([
    id, body.slotId, body.serviceId, body.name, body.email, body.phone,
    'pending-payment', body.razorpayOrderId, '', '',
    '', '', '', '', '', '', new Date().toISOString(),
  ]);
  return { bookingId: id };
}

function saveBirthDetails(body) {
  var bookingId = body.bookingId;
  if (!bookingId) throw new Error('bookingId is required');

  Logger.log('saveBirthDetails: bookingId=' + bookingId);

  var s       = sheet('Bookings');
  var data    = s.getDataRange().getValues();
  var headers = data[0];
  var idCol   = headers.indexOf('id');

  // ── Try to update existing row ────────────────────────────
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) !== String(bookingId)) continue;

    s.getRange(i + 1, headers.indexOf('dateOfBirth')     + 1).setValue(body.dateOfBirth     || '');
    s.getRange(i + 1, headers.indexOf('timeOfBirth')     + 1).setValue(body.timeOfBirth     || '');
    s.getRange(i + 1, headers.indexOf('cityOfBirth')     + 1).setValue(body.cityOfBirth     || '');
    s.getRange(i + 1, headers.indexOf('additionalNotes') + 1).setValue(body.additionalNotes || '');
    Logger.log('saveBirthDetails: updated existing row for ' + bookingId);
    return { saved: true };
  }

  // ── Row not found: UPSERT — create a stub row ─────────────
  // This handles the dev-bypass path (no confirmBooking GAS call)
  // and any edge case where the booking row was not yet created.
  Logger.log('saveBirthDetails: row not found for ' + bookingId + ' — creating stub row');

  // Build a row that fills all header columns with defaults
  var newRow = [];
  headers.forEach(function(h) {
    switch (h) {
      case 'id':              newRow.push(bookingId); break;
      case 'status':          newRow.push('confirmed'); break;
      case 'dateOfBirth':     newRow.push(body.dateOfBirth     || ''); break;
      case 'timeOfBirth':     newRow.push(body.timeOfBirth     || ''); break;
      case 'cityOfBirth':     newRow.push(body.cityOfBirth     || ''); break;
      case 'additionalNotes': newRow.push(body.additionalNotes || ''); break;
      case 'createdAt':       newRow.push(new Date().toISOString()); break;
      default:                newRow.push(''); break;
    }
  });
  s.appendRow(newRow);
  Logger.log('saveBirthDetails: stub row created for ' + bookingId);
  return { saved: true };
}

// ============================================================
// OTP
// ============================================================
// ── ensureOtpTokensSchema ────────────────────────────────────
// Self-healing migration: adds 'attempts' and 'lockedUntil' columns
// to the OTP_Tokens sheet if they don't already exist.
// Safe to call multiple times — skips columns that already exist.
// This allows the new security code to work even when the sheet was
// created with the old 4-column schema (email|otp|expiresAt|used).
function ensureOtpTokensSchema(s) {
  var data    = s.getDataRange().getValues();
  var headers = data[0];
  var changed = false;

  if (headers.indexOf('attempts') === -1) {
    var nextCol = headers.length + 1;
    s.getRange(1, nextCol).setValue('attempts');
    // Back-fill existing rows with 0
    if (data.length > 1) {
      for (var i = 2; i <= data.length; i++) {
        s.getRange(i, nextCol).setValue(0);
      }
    }
    headers.push('attempts');
    Logger.log('ensureOtpTokensSchema: added attempts column at col ' + nextCol);
    changed = true;
  }

  if (headers.indexOf('lockedUntil') === -1) {
    var nextCol2 = headers.length + 1;
    s.getRange(1, nextCol2).setValue('lockedUntil');
    // Back-fill existing rows with empty string
    if (data.length > 1) {
      for (var i = 2; i <= data.length; i++) {
        s.getRange(i, nextCol2).setValue('');
      }
    }
    headers.push('lockedUntil');
    Logger.log('ensureOtpTokensSchema: added lockedUntil column at col ' + nextCol2);
    changed = true;
  }

  if (changed) {
    // Apply header styling to the new columns
    var lastCol = headers.length;
    s.getRange(1, lastCol - (changed ? 1 : 0), 1, 2)
     .setBackground('#1a3454').setFontColor('#ffc107').setFontWeight('bold');
  }
}

function requestOtp(body) {
  var email = validateEmail(body.email); // validates format, lowercases

  var s       = sheet('OTP_Tokens');
  var data    = s.getDataRange().getValues();
  var headers = data[0];
  var now     = Date.now();

  // ── Rate limiting: max 1 OTP per OTP_RATE_LIMIT_SECONDS per email ──
  // Also enforce lockout after too many failed attempts.
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][headers.indexOf('email')]).toLowerCase() !== email) continue;
    var lastSent = data[i][headers.indexOf('expiresAt')];
    var attempts = parseInt(data[i][headers.indexOf('attempts')] || '0') || 0;

    // Check lockout
    var lockedUntilCol = headers.indexOf('lockedUntil');
    if (lockedUntilCol !== -1 && data[i][lockedUntilCol]) {
      var lockedUntil = new Date(data[i][lockedUntilCol]).getTime();
      if (now < lockedUntil) {
        var secsLeft = Math.ceil((lockedUntil - now) / 1000);
        throw new Error('Too many OTP requests. Try again in ' + secsLeft + ' seconds.');
      }
    }

    // Check send rate limit (re-send window)
    if (lastSent) {
      var sentAt = new Date(lastSent).getTime() - (10 * 60 * 1000); // expiresAt = sentAt + 10min
      var elapsed = (now - sentAt) / 1000;
      if (elapsed < OTP_RATE_LIMIT_SECONDS) {
        var wait = Math.ceil(OTP_RATE_LIMIT_SECONDS - elapsed);
        throw new Error('Please wait ' + wait + ' seconds before requesting another OTP.');
      }
    }
    break;
  }

  // Generate OTP with CSPRNG (not Math.random)
  var otp     = generateSecureOtp();
  var expires = new Date(now + 10 * 60 * 1000).toISOString();

  // ── Ensure OTP_Tokens has the new columns before writing ──
  // Self-healing: if the sheet was created with the old 4-col schema
  // (email|otp|expiresAt|used), add 'attempts' and 'lockedUntil' now.
  // This runs in-place so no existing rows are lost.
  ensureOtpTokensSchema(s);

  // Write — do NOT log the OTP value
  var updated = false;
  // Reload data after potential schema migration
  data    = s.getDataRange().getValues();
  headers = data[0];
  for (var j = 1; j < data.length; j++) {
    if (String(data[j][headers.indexOf('email')]).toLowerCase() !== email) continue;
    s.getRange(j + 1, headers.indexOf('otp')       + 1).setValue(otp);
    s.getRange(j + 1, headers.indexOf('expiresAt') + 1).setValue(expires);
    s.getRange(j + 1, headers.indexOf('used')      + 1).setValue('false');
    var attCol = headers.indexOf('attempts');
    var lukCol = headers.indexOf('lockedUntil');
    if (attCol !== -1) s.getRange(j + 1, attCol + 1).setValue(0);
    if (lukCol !== -1) s.getRange(j + 1, lukCol + 1).setValue('');
    updated = true;
    break;
  }
  if (!updated) {
    s.appendRow([email, otp, expires, 'false', 0, '']);
  }

  Logger.log('requestOtp: sent OTP to ' + email + ' (expires ' + expires + ')'); // no OTP value in log
  sendOtpEmail(email, otp);
  return { sent: true, expiresAt: expires };
}

function verifyOtp(body) {
  var email = validateEmail(body.email);
  var otp   = sanitiseString(String(body.otp || ''), 10);

  var s       = sheet('OTP_Tokens');
  var data    = s.getDataRange().getValues();
  var headers = data[0];
  var now     = Date.now();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][headers.indexOf('email')]).toLowerCase() !== email) continue;

    // Check lockout
    var lockedUntilCol = headers.indexOf('lockedUntil');
    if (lockedUntilCol !== -1 && data[i][lockedUntilCol]) {
      var lockedUntil = new Date(data[i][lockedUntilCol]).getTime();
      if (now < lockedUntil) {
        var secsLeft = Math.ceil((lockedUntil - now) / 1000);
        throw new Error('Account locked. Try again in ' + secsLeft + ' seconds.');
      }
    }

    // Already used
    if (String(data[i][headers.indexOf('used')]) === 'true') {
      return { verified: false, token: '' };
    }

    // Expired
    if (now > new Date(data[i][headers.indexOf('expiresAt')]).getTime()) {
      return { verified: false, token: '' };
    }

    // Timing-safe OTP comparison (OTP is a string, not a secret key, but still good practice)
    var storedOtp   = String(data[i][headers.indexOf('otp')] || '');
    var otpMatches  = safeEqual(otp, storedOtp);
    var attemptsCol = headers.indexOf('attempts');
    var attempts    = parseInt(data[i][attemptsCol] || '0') || 0;

    if (!otpMatches) {
      // Increment attempt counter (only if column exists)
      attempts++;
      if (attemptsCol !== -1) {
        s.getRange(i + 1, attemptsCol + 1).setValue(attempts);
      }
      // Lock after too many failed attempts
      if (attempts >= OTP_MAX_ATTEMPTS && lockedUntilCol !== -1) {
        var lockUntil = new Date(now + OTP_LOCKOUT_SECONDS * 1000).toISOString();
        s.getRange(i + 1, lockedUntilCol + 1).setValue(lockUntil);
        Logger.log('verifyOtp: locked ' + email + ' after ' + attempts + ' failed attempts');
        throw new Error('Too many incorrect codes. Try again in ' +
          Math.ceil(OTP_LOCKOUT_SECONDS / 60) + ' minutes.');
      }
      Logger.log('verifyOtp: wrong OTP for ' + email + ' (attempt ' + attempts + ')');
      return { verified: false, token: '' };
    }

    // Correct — mark used, reset attempt counter
    s.getRange(i + 1, headers.indexOf('used') + 1).setValue('true');
    if (attemptsCol !== -1) s.getRange(i + 1, attemptsCol + 1).setValue(0);
    if (lockedUntilCol !== -1) s.getRange(i + 1, lockedUntilCol + 1).setValue('');

    Logger.log('verifyOtp: verified OK for ' + email);
    return { verified: true, token: generateId('otp') };
  }

  // Email not found — return generic response (don't reveal existence)
  return { verified: false, token: '' };
}

// ============================================================
// RAZORPAY ORDER
// ============================================================
function createRazorpayOrder(body) {
  // SECURITY: NEVER trust the amount from the client.
  // Look up the canonical price from the Pricing sheet using serviceId.
  // Add-on prices are also looked up server-side from the Addons sheet.
  // This prevents attackers from sending ₹1 orders for any service.
  var serviceId = sanitiseString(body.serviceId, 100);
  var email     = validateEmail(body.email);
  var currency  = 'INR'; // hardcoded — do not accept from client
  var receipt   = generateId('rcpt');
  // Add-ons: array of addon IDs — prices resolved server-side
  var addonIds  = Array.isArray(body.addonIds) ? body.addonIds : [];

  // Look up canonical base price server-side
  var baseAmount = getCanonicalPrice(serviceId);
  if (!baseAmount || baseAmount <= 0) {
    throw new Error('Cannot determine price for service: ' + serviceId);
  }

  // Add up addon prices from the Addons sheet (never trust client-sent prices)
  var addonTotal = 0;
  if (addonIds.length > 0) {
    var addonRows = [];
    try { addonRows = sheetRows('Addons'); } catch(e) {}
    addonIds.forEach(function(id) {
      var addon = null;
      for (var i = 0; i < addonRows.length; i++) {
        if (String(addonRows[i].id) === String(id) && cfgBool(addonRows[i].isActive)) {
          addon = addonRows[i];
          break;
        }
      }
      if (addon) {
        addonTotal += parseInt(addon.price) || 0;
        Logger.log('createRazorpayOrder: addon ' + id + ' price=' + addon.price);
      } else {
        Logger.log('createRazorpayOrder: addon not found or inactive: ' + id);
      }
    });
  }

  var amount = baseAmount + addonTotal;
  Logger.log('createRazorpayOrder: serviceId=' + serviceId + ' base=' + baseAmount +
    ' addons=' + addonTotal + ' total=' + amount + ' email=' + email);

  var credentials = Utilities.base64Encode(RZP_KEY + ':' + RZP_SEC);
  var response    = UrlFetchApp.fetch('https://api.razorpay.com/v1/orders', {
    method: 'post',
    headers: { 'Authorization': 'Basic ' + credentials, 'Content-Type': 'application/json' },
    payload: JSON.stringify({
      amount: amount, currency: currency, receipt: receipt,
      notes: { serviceId: serviceId, email: email },
    }),
    muteHttpExceptions: true,
  });
  var order = JSON.parse(response.getContentText());
  if (!order.id) throw new Error('Razorpay order creation failed: ' + JSON.stringify(order));
  return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: RZP_KEY };
}

// Look up the canonical price (in paise) for a service or 'quick_consult'.
function getCanonicalPrice(serviceId) {
  if (serviceId === 'quick_consult') {
    // Read from Config sheet
    var rows = sheetRows('Config');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === 'quickConsultPrice') return parseInt(rows[i].value) || 0;
    }
    return 49900; // fallback default
  }
  // Read from Pricing sheet
  var pricingRows = sheetRows('Pricing');
  for (var j = 0; j < pricingRows.length; j++) {
    if (pricingRows[j].serviceId === serviceId) {
      return parseInt(pricingRows[j].price) || 0;
    }
  }
  return 0;
}

// ============================================================
// QUICK CONSULT
// ============================================================
function handleQuickConsult(body) {
  // SECURITY: Require proof of payment (or dev bypass marker).
  // Without this, anyone can submit questions for free.
  var paymentId = sanitiseString(body.razorpayPaymentId || '', 200);
  var orderId   = sanitiseString(body.razorpayOrderId   || '', 200);
  var isDev     = (paymentId === 'dev_bypass' && orderId === 'dev_bypass');

  if (!paymentId) {
    throw new Error('Payment reference is required for Quick Consultation.');
  }

  // For real payments, verify with Razorpay (non-blocking — best-effort)
  if (!isDev && RZP_KEY && RZP_SEC) {
    try {
      var credentials = Utilities.base64Encode(RZP_KEY + ':' + RZP_SEC);
      var resp = UrlFetchApp.fetch(
        'https://api.razorpay.com/v1/payments/' + encodeURIComponent(paymentId),
        { headers: { 'Authorization': 'Basic ' + credentials }, muteHttpExceptions: true }
      );
      var payment = JSON.parse(resp.getContentText());
      if (!payment.id || payment.status !== 'captured') {
        Logger.log('handleQuickConsult: payment verification failed for ' + paymentId + ' status=' + payment.status);
        throw new Error('Payment not completed. Please complete payment before submitting questions.');
      }
      Logger.log('handleQuickConsult: payment verified paymentId=' + paymentId + ' amount=' + payment.amount);
    } catch (verifyErr) {
      if (verifyErr.message.indexOf('Payment not completed') !== -1) throw verifyErr;
      // Network/API error — log but don't block (Razorpay unavailability shouldn't lose submissions)
      Logger.log('handleQuickConsult: payment verification network error (non-blocking): ' + verifyErr.message);
    }
  }

  var name  = sanitiseString(body.name,  200);
  var email = validateEmail(body.email);
  var phone = sanitiseString(body.phone,  20);
  var q1    = sanitiseString((body.questions && body.questions[0]) || '', 2000);
  var q2    = sanitiseString((body.questions && body.questions[1]) || '', 2000);
  var q3    = sanitiseString((body.questions && body.questions[2]) || '', 2000);

  var consultId = generateId('qc');
  try {
    var s = SS.getSheetByName('QuickConsults') || SS.insertSheet('QuickConsults');

    // ── Schema migration: ensure headers exist in correct order ──
    // Handles sheets created before paymentId / answer columns were added.
    var existingData = s.getDataRange().getValues();
    if (existingData.length === 0 || existingData[0].length === 0) {
      // Sheet is empty — write the full header row
      s.appendRow(['id','name','email','phone','question1','question2','question3','paymentId','status','createdAt']);
    } else {
      var existingHeaders = existingData[0];
      // Add paymentId column if missing (old 9-column schema)
      if (existingHeaders.indexOf('paymentId') === -1) {
        var paymentIdCol = existingHeaders.length + 1;
        s.getRange(1, paymentIdCol).setValue('paymentId');
        existingHeaders.push('paymentId');
        Logger.log('handleQuickConsult: migrated paymentId column at position ' + paymentIdCol);
      }
      // Add answer columns if missing (will be added by ensureQuickConsultsAnswerSchema when answering)
    }

    // Append row — columns: id | name | email | phone | q1 | q2 | q3 | paymentId | status | createdAt
    s.appendRow([
      consultId, name, email, phone,
      q1, q2, q3,
      paymentId,
      'received',
      new Date().toISOString(),
    ]);
  } catch (e) { Logger.log('QuickConsult sheet error: ' + e.message); }

  sendAdminAlert(
    'New Quick Consultation\nFrom: ' + body.name + ' <' + body.email + '>\n\n' +
    'Q1: ' + ((body.questions && body.questions[0]) || '—') + '\n' +
    'Q2: ' + ((body.questions && body.questions[1]) || '—') + '\n' +
    'Q3: ' + ((body.questions && body.questions[2]) || '—') + '\n\nRef: ' + consultId
  );
  return { consultId: consultId };
}

// ============================================================
// ADMIN — SLOT MANAGEMENT
// ============================================================
/**
 * Recurring slot creation — ALL date math is server-side.
 * Uses Utilities.parseDate() in the configured timezone to
 * avoid frontend timezone/DST bugs completely.
 */
function adminCreateSlots(body) {
  // ── Auth ──────────────────────────────────────────────────
  Logger.log('adminCreateSlots body keys: ' + Object.keys(body).join(', '));
  if (!verifyAdmin(body.adminToken)) {
    Logger.log('adminCreateSlots: Unauthorized attempt.');
    throw new Error('Unauthorized');
  }

  var serviceId       = body.serviceId;
  var startDate       = body.startDate;
  var endDate         = body.endDate;
  var startTime       = body.startTime;
  var durationMinutes = parseInt(body.durationMinutes) || 60;

  // weekdays may arrive as a JSON array (from text/plain POST) — handle both array and string
  var weekdays = body.weekdays;
  if (typeof weekdays === 'string') {
    try { weekdays = JSON.parse(weekdays); } catch(e) {
      // comma-separated fallback: "1,2,3" -> [1,2,3]
      weekdays = weekdays.split(',').map(function(n){ return parseInt(n.trim()); }).filter(function(n){ return !isNaN(n); });
    }
  }

  Logger.log('adminCreateSlots params: serviceId=' + serviceId + ' startDate=' + startDate +
    ' endDate=' + endDate + ' startTime=' + startTime + ' duration=' + durationMinutes +
    ' weekdays=' + JSON.stringify(weekdays));

  if (!serviceId) throw new Error('Missing: serviceId');
  if (!startDate) throw new Error('Missing: startDate');
  if (!endDate)   throw new Error('Missing: endDate');
  if (!startTime) throw new Error('Missing: startTime');
  if (!weekdays || !Array.isArray(weekdays) || weekdays.length === 0) {
    throw new Error('Missing or empty: weekdays (must be array of day numbers 0-6)');
  }

  var tz          = getConfig().timezone || 'Asia/Kolkata';
  var slotsSheet  = sheet('Slots');
  var services    = sheetRows('Services');
  var serviceRow  = null;

  // Log every service row for diagnosis
  Logger.log('adminCreateSlots: received serviceId=' + JSON.stringify(serviceId) +
    ' type=' + typeof serviceId + ' length=' + String(serviceId).length);
  Logger.log('adminCreateSlots: Services sheet has ' + services.length + ' rows');
  for (var di = 0; di < services.length; di++) {
    Logger.log('  row[' + di + '] id=' + JSON.stringify(services[di].id) +
      ' type=' + typeof services[di].id +
      ' len=' + String(services[di].id).length +
      ' isActive=' + services[di].isActive);
  }

  // Tolerant match: trim whitespace, compare lowercase
  for (var si = 0; si < services.length; si++) {
    var sheetId = String(services[si].id || '').trim().toLowerCase();
    var bodyId  = String(serviceId || '').trim().toLowerCase();
    if (sheetId === bodyId) {
      serviceRow = services[si];
      Logger.log('adminCreateSlots: MATCH found at row ' + si + ' serviceName=' + serviceRow.name);
      break;
    }
  }

  if (!serviceRow) {
    Logger.log('adminCreateSlots: WARNING — serviceId "' + serviceId + '" not matched in Services sheet. ' +
      'Using serviceId as serviceName fallback.');
  }

  // Use the original casing from the body (not lowercased) for the stored serviceId
  var serviceName = serviceRow ? serviceRow.name : serviceId;
  Logger.log('adminCreateSlots: serviceName="' + serviceName + '" tz="' + tz + '"');

  var created = 0;
  var slotIds = [];
  var cursor  = new Date(startDate + 'T12:00:00Z');
  var end     = new Date(endDate   + 'T12:00:00Z');

  while (cursor <= end) {
    var dow = cursor.getUTCDay();
    if (weekdays.indexOf(dow) !== -1) {
      var dateStr    = Utilities.formatDate(cursor, 'UTC', 'yyyy-MM-dd');
      var localStr   = dateStr + ' ' + startTime + ':00';
      var startLocal = Utilities.parseDate(localStr, tz, 'yyyy-MM-dd HH:mm:ss');
      var endLocal   = new Date(startLocal.getTime() + durationMinutes * 60000);
      var slotId     = generateId('slot');

      slotsSheet.appendRow([
        slotId, serviceId, serviceName,
        startLocal.toISOString(), endLocal.toISOString(),
        durationMinutes, 'available', '', '', '', '', new Date().toISOString(),
      ]);
      slotIds.push(slotId);
      created++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { created: created, slotIds: slotIds };
}

function adminDeleteSlot(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var s    = sheet('Slots');
  var data = s.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] !== body.slotId) continue;
    if (data[i][6] === 'booked') throw new Error('Cannot delete a booked slot.');
    s.deleteRow(i + 1);
    return { deleted: true };
  }
  return { deleted: false };
}

function adminToggleSlot(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var s    = sheet('Slots');
  var data = s.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] !== body.slotId) continue;
    s.getRange(i + 1, 7).setValue(body.enabled ? 'available' : 'disabled');
    return { updated: true };
  }
  return { updated: false };
}

function adminGetBookings(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var rows = sheetRows('Bookings');
  if (body.status) rows = rows.filter(function(r) { return r.status === body.status; });
  return rows;
}

// Boolean keys in the Config sheet — values must be stored as plain text
// to prevent Google Sheets from auto-converting 'true'/'false' → boolean TRUE/FALSE.
var CONFIG_BOOL_KEYS = ['waEnabled', 'urgencyEnabled'];

function adminUpdateSheet(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var s = SS.getSheetByName(body.sheetName);
  if (!s) throw new Error('Sheet not found: ' + body.sheetName);

  var data    = s.getDataRange().getValues();
  var headers = data[0];
  var valCol  = headers.indexOf('value') + 1; // 1-indexed for getRange

  body.rows.forEach(function(kv) {
    var key   = String(kv[0]);
    var value = kv[1];
    var found = false;

    // Normalise boolean values to lowercase string before writing
    // so cfgBool() can reliably parse them back.
    var isBoolKey = CONFIG_BOOL_KEYS.indexOf(key) !== -1;
    if (isBoolKey) {
      // Coerce to canonical lowercase string 'true' or 'false'
      value = (value === true || String(value).toLowerCase() === 'true') ? 'true' : 'false';
    }

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][headers.indexOf('key')]) !== key) continue;
      var cell = s.getRange(i + 1, valCol);
      if (isBoolKey) {
        // Force text number format BEFORE writing to prevent auto-conversion
        // '@' tells Sheets to treat the cell as plain text.
        cell.setNumberFormat('@');
        cell.setValue(value);
      } else {
        cell.setValue(value);
      }
      found = true;
      Logger.log('adminUpdateSheet: updated key=' + key + ' value=' + value);
      break;
    }
    if (!found) {
      if (isBoolKey) {
        // Append with explicit text format
        var newRow = s.appendRow([key, value]);
        // Format the value cell of the new row as text
        var lastRow = s.getLastRow();
        s.getRange(lastRow, valCol).setNumberFormat('@');
      } else {
        s.appendRow([key, value]);
      }
      Logger.log('adminUpdateSheet: inserted key=' + key + ' value=' + value);
    }
  });
  return { updated: true };
}

// ============================================================
// UTILITIES
// ============================================================
function verifyAdmin(token) {
  if (!ADMIN_SEC) {
    Logger.log('SECURITY: ADMIN_SECRET is not configured in Script Properties!');
    return false;
  }
  return safeEqual(String(token || ''), ADMIN_SEC);
}

function getCalendarForService(serviceId) {
  var rows = sheetRows('Config');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === 'calendarId_' + serviceId && rows[i].value) return rows[i].value;
  }
  return DEFAULT_CAL_ID;
}

function computeHmacSha256(message, secret) {
  var sig = Utilities.computeHmacSha256Signature(message, secret);
  return sig.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// ============================================================
// EMAIL SENDERS
// ============================================================
function sendOtpEmail(to, otp) {
  var html = '<div style="font-family:Georgia,serif;max-width:500px;margin:auto;padding:32px;'
    + 'background:#07111f;color:#c8d8e8;border-radius:12px;">'
    + '<h2 style="color:#ffc107;letter-spacing:0.05em;">☽ Jyotish Consultations</h2>'
    + '<p>Your email verification code is:</p>'
    + '<div style="font-size:2.5rem;font-weight:700;color:#ffc107;letter-spacing:0.3em;'
    + 'text-align:center;padding:16px 0;border:1px solid rgba(255,193,7,0.3);'
    + 'border-radius:8px;margin:24px 0;">' + otp + '</div>'
    + '<p style="font-size:0.85rem;opacity:0.6;">Expires in 10 minutes. Do not share this code.</p>'
    + '</div>';
  GmailApp.sendEmail(to, 'Your OTP — Jyotish Consultation Booking', 'Your OTP: ' + otp,
    { htmlBody: html, name: 'Jyotish Consultations' });
}

function sendConfirmationEmail(params) {
  var to        = params.to;
  var name      = params.name;
  var bookingId = params.bookingId;
  var meetLink  = params.meetLink;
  var slotRow   = params.slotRow;

  var tz       = getConfig().timezone || 'Asia/Kolkata';
  var startStr = Utilities.formatDate(new Date(slotRow.startUtc), tz, 'EEEE, d MMMM yyyy \'at\' HH:mm');

  var html = '<div style="font-family:Georgia,serif;max-width:560px;margin:auto;padding:32px;'
    + 'background:#07111f;color:#c8d8e8;border-radius:12px;">'
    + '<h2 style="color:#ffc107;">✨ Booking Confirmed!</h2>'
    + '<p>Dear ' + name + ',</p>'
    + '<p>Your consultation is confirmed. Details below:</p>'
    + '<table style="width:100%;border-collapse:collapse;margin:20px 0;">'
    + '<tr><td style="padding:8px;opacity:0.6;width:40%;">Service</td>'
    + '    <td style="padding:8px;color:#e8f0f8;">' + slotRow.serviceName + '</td></tr>'
    + '<tr><td style="padding:8px;opacity:0.6;">Date & Time</td>'
    + '    <td style="padding:8px;color:#e8f0f8;">' + startStr + ' (' + tz + ')</td></tr>'
    + '<tr><td style="padding:8px;opacity:0.6;">Duration</td>'
    + '    <td style="padding:8px;color:#e8f0f8;">' + slotRow.durationMinutes + ' minutes</td></tr>'
    + '<tr><td style="padding:8px;opacity:0.6;">Booking ID</td>'
    + '    <td style="padding:8px;color:#e8f0f8;font-size:0.85rem;">' + bookingId + '</td></tr>'
    + '</table>'
    + (meetLink && meetLink.indexOf('http') === 0
       ? '<div style="text-align:center;margin:28px 0;">'
         + '<a href="' + meetLink + '" style="background:#f9a825;color:#030712;padding:14px 32px;'
         + 'border-radius:100px;text-decoration:none;font-weight:700;display:inline-block;'
         + 'font-size:1rem;">▶ Join Google Meet</a></div>'
       : '')
    + '<p style="font-size:0.85rem;opacity:0.6;margin-top:24px;">'
    + 'A Google Calendar invite with the Meet link has been sent separately. '
    + 'Please share your birth details via the welcome link in your booking confirmation.</p>'
    + '<hr style="border-color:rgba(255,255,255,0.1);margin:20px 0;">'
    + '<p style="font-size:0.75rem;opacity:0.4;">Jyotish Consultations · '
    + 'For support reply to this email.</p>'
    + '</div>';

  GmailApp.sendEmail(
    to,
    'Booking Confirmed — ' + slotRow.serviceName + ' Consultation',
    'Your consultation is confirmed. Meet: ' + meetLink,
    { htmlBody: html, name: 'Jyotish Consultations' }
  );
}

function sendAdminAlert(message) {
  var adminEmail = getConfig().adminEmail;
  if (adminEmail) {
    GmailApp.sendEmail(adminEmail, '[Jyotish Admin]', message, { name: 'Jyotish Bot' });
  }
}

// ============================================================
// ADMIN — CANCEL & RESCHEDULE BOOKINGS
// ============================================================

/**
 * Get the booking record associated with a specific slotId.
 * Used by the admin slot manager to find the booking before cancel/reschedule.
 */
function adminGetBookingBySlot(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var slotId = body.slotId;
  if (!slotId) throw new Error('slotId required');

  var rows = sheetRows('Bookings');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].slotId) === String(slotId) && rows[i].status === 'confirmed') {
      return rows[i];
    }
  }
  return null; // slot exists but may not have a confirmed booking yet
}

/**
 * Cancel a confirmed booking:
 *  1. Update Bookings row: status = 'cancelled'
 *  2. Free the Slot: status = 'available', clear bookingId/meetLink/lockToken
 *  3. Delete the Google Calendar event (if calendarEventId is stored)
 *  4. Send cancellation email to the client
 *  5. Notify admin
 */
function adminCancelBooking(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var bookingId = body.bookingId;
  var reason    = body.reason || 'Cancelled by admin';
  if (!bookingId) throw new Error('bookingId required');

  Logger.log('adminCancelBooking: bookingId=' + bookingId + ' reason=' + reason);

  // ── Find booking row ──────────────────────────────────────
  var bookingsSheet = sheet('Bookings');
  var bData         = bookingsSheet.getDataRange().getValues();
  var bHeaders      = bData[0];
  var bookingRow    = null;
  var bookingRowIdx = -1;

  for (var bi = 1; bi < bData.length; bi++) {
    if (String(bData[bi][bHeaders.indexOf('id')]) === String(bookingId)) {
      bookingRow    = {};
      bHeaders.forEach(function(h, idx) { bookingRow[h] = bData[bi][idx]; });
      bookingRowIdx = bi;
      break;
    }
  }
  if (!bookingRow) throw new Error('Booking not found: ' + bookingId);
  if (bookingRow.status === 'cancelled') throw new Error('Booking is already cancelled.');

  // ── Update booking status ─────────────────────────────────
  bookingsSheet.getRange(bookingRowIdx + 1, bHeaders.indexOf('status') + 1).setValue('cancelled');
  Logger.log('adminCancelBooking: marked booking as cancelled');

  // ── Free the slot ─────────────────────────────────────────
  var slotId     = String(bookingRow.slotId || '');
  var calEventId = String(bookingRow.calendarEventId || '');

  if (slotId) {
    var slotsSheet = sheet('Slots');
    var sData      = slotsSheet.getDataRange().getValues();
    var sHeaders   = sData[0];
    for (var si = 1; si < sData.length; si++) {
      if (String(sData[si][sHeaders.indexOf('id')]) === slotId) {
        slotsSheet.getRange(si + 1, sHeaders.indexOf('status')    + 1).setValue('available');
        slotsSheet.getRange(si + 1, sHeaders.indexOf('bookingId') + 1).setValue('');
        slotsSheet.getRange(si + 1, sHeaders.indexOf('meetLink')  + 1).setValue('');
        slotsSheet.getRange(si + 1, sHeaders.indexOf('lockToken') + 1).setValue('');
        Logger.log('adminCancelBooking: slot ' + slotId + ' freed');
        break;
      }
    }
  }

  // ── Delete Google Calendar event ──────────────────────────
  if (calEventId && calEventId !== '') {
    try {
      var calId = getCalendarForService(String(bookingRow.serviceId || ''));
      Calendar.Events.remove(calId, calEventId, { sendUpdates: 'all' });
      Logger.log('adminCancelBooking: calendar event ' + calEventId + ' deleted, invites sent');
    } catch (calErr) {
      Logger.log('adminCancelBooking: calendar delete failed (non-fatal): ' + calErr.message);
    }
  }

  // ── Send cancellation email ───────────────────────────────
  try {
    var tz       = getConfig().timezone || 'Asia/Kolkata';
    var slotRows = sheetRows('Slots');
    var slotRow  = null;
    for (var sk = 0; sk < slotRows.length; sk++) {
      if (String(slotRows[sk].id) === slotId) { slotRow = slotRows[sk]; break; }
    }
    var timeStr = slotRow
      ? Utilities.formatDate(new Date(slotRow.startUtc), tz, "EEEE, d MMMM yyyy 'at' HH:mm")
      : 'your scheduled time';

    var html = '<div style="font-family:Georgia,serif;max-width:560px;margin:auto;padding:32px;background:#07111f;color:#c8d8e8;border-radius:12px;">'
      + '<h2 style="color:#ef4444;">Booking Cancelled</h2>'
      + '<p>Dear ' + (bookingRow.name || 'Client') + ',</p>'
      + '<p>Your <strong>' + (bookingRow.serviceId || 'consultation') + '</strong> booking scheduled for <strong>' + timeStr + '</strong> has been cancelled.</p>'
      + (reason ? '<p><strong>Reason:</strong> ' + reason + '</p>' : '')
      + '<p>If you believe this is an error or would like to reschedule, please contact us.</p>'
      + '<p style="font-size:0.85rem;opacity:0.6;margin-top:24px;">Booking ID: ' + bookingId + '</p>'
      + '</div>';

    GmailApp.sendEmail(
      bookingRow.email,
      'Booking Cancelled — ' + (bookingRow.serviceId || 'Consultation'),
      'Your booking has been cancelled. Reason: ' + reason,
      { htmlBody: html, name: 'Jyotish Consultations' }
    );
    Logger.log('adminCancelBooking: cancellation email sent to ' + bookingRow.email);
  } catch (emailErr) {
    Logger.log('adminCancelBooking: email failed (non-fatal): ' + emailErr.message);
  }

  // ── Notify admin ──────────────────────────────────────────
  sendAdminAlert('Booking cancelled: ' + bookingId + ' | Client: ' + bookingRow.name + ' | Reason: ' + reason);

  return { cancelled: true, bookingId: bookingId };
}

/**
 * Reschedule a confirmed booking to a different (available) slot:
 *  1. Validate new slot is available
 *  2. Lock new slot
 *  3. Free old slot (available)
 *  4. Update Bookings row: slotId = newSlotId
 *  5. Delete old Calendar event
 *  6. Create new Calendar event on new slot + new Meet link
 *  7. Update meetLink in Bookings row
 *  8. Send rescheduling confirmation email to client
 *  9. Notify admin
 */
function adminRescheduleBooking(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var bookingId  = body.bookingId;
  var newSlotId  = body.newSlotId;
  var reason     = body.reason || 'Rescheduled by admin';
  if (!bookingId) throw new Error('bookingId required');
  if (!newSlotId) throw new Error('newSlotId required');

  Logger.log('adminRescheduleBooking: bookingId=' + bookingId + ' newSlotId=' + newSlotId);

  // ── Find booking ──────────────────────────────────────────
  var bookingsSheet = sheet('Bookings');
  var bData         = bookingsSheet.getDataRange().getValues();
  var bHeaders      = bData[0];
  var bookingRow    = null;
  var bookingRowIdx = -1;

  for (var bi = 1; bi < bData.length; bi++) {
    if (String(bData[bi][bHeaders.indexOf('id')]) === String(bookingId)) {
      bookingRow    = {};
      bHeaders.forEach(function(h, idx) { bookingRow[h] = bData[bi][idx]; });
      bookingRowIdx = bi;
      break;
    }
  }
  if (!bookingRow)                     throw new Error('Booking not found: ' + bookingId);
  if (bookingRow.status === 'cancelled') throw new Error('Cannot reschedule a cancelled booking.');

  // ── Validate + lock new slot (inside LockService) ─────────
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  var newSlotRow    = null;
  var newSlotRowIdx = -1;

  try {
    var slotsSheet = sheet('Slots');
    var sData      = slotsSheet.getDataRange().getValues();
    var sHeaders   = sData[0];

    // Validate new slot
    for (var si = 1; si < sData.length; si++) {
      if (String(sData[si][sHeaders.indexOf('id')]) === newSlotId) {
        var newStatus = String(sData[si][sHeaders.indexOf('status')] || '');
        if (newStatus !== 'available') {
          throw new Error('New slot is not available (status: ' + newStatus + ').');
        }
        newSlotRow    = {};
        sHeaders.forEach(function(h, idx) { newSlotRow[h] = sData[si][idx]; });
        newSlotRowIdx = si;
        break;
      }
    }
    if (!newSlotRow) throw new Error('New slot not found: ' + newSlotId);

    // Lock new slot immediately (admin reschedule bypasses the 15-min client lock)
    slotsSheet.getRange(newSlotRowIdx + 1, sHeaders.indexOf('status')    + 1).setValue('booked');
    slotsSheet.getRange(newSlotRowIdx + 1, sHeaders.indexOf('bookingId') + 1).setValue(bookingId);

    // Free old slot
    var oldSlotId = String(bookingRow.slotId || '');
    if (oldSlotId && oldSlotId !== newSlotId) {
      for (var oi = 1; oi < sData.length; oi++) {
        if (String(sData[oi][sHeaders.indexOf('id')]) === oldSlotId) {
          slotsSheet.getRange(oi + 1, sHeaders.indexOf('status')    + 1).setValue('available');
          slotsSheet.getRange(oi + 1, sHeaders.indexOf('bookingId') + 1).setValue('');
          slotsSheet.getRange(oi + 1, sHeaders.indexOf('meetLink')  + 1).setValue('');
          Logger.log('adminRescheduleBooking: old slot ' + oldSlotId + ' freed');
          break;
        }
      }
    }
  } finally {
    lock.releaseLock();
  }

  // ── Delete old Calendar event ─────────────────────────────
  var oldCalEventId = String(bookingRow.calendarEventId || '');
  var calId         = getCalendarForService(String(bookingRow.serviceId || ''));

  if (oldCalEventId) {
    try {
      Calendar.Events.remove(calId, oldCalEventId, { sendUpdates: 'none' });
      Logger.log('adminRescheduleBooking: old calendar event ' + oldCalEventId + ' deleted');
    } catch (delErr) {
      Logger.log('adminRescheduleBooking: old event delete failed (non-fatal): ' + delErr.message);
    }
  }

  // ── Create new Calendar event + Meet link ─────────────────
  var newMeetLink   = '';
  var newCalEventId = '';

  try {
    var startTime = new Date(newSlotRow.startUtc);
    var endTime   = new Date(newSlotRow.endUtc);
    var newEventResource = {
      summary:     (newSlotRow.serviceName || bookingRow.serviceId) + ' Consultation — ' + bookingRow.name,
      description: 'Booking ID: ' + bookingId + ' (Rescheduled)Client: ' + bookingRow.name + 'Email: ' + bookingRow.email,
      start:  { dateTime: startTime.toISOString(), timeZone: 'UTC' },
      end:    { dateTime: endTime.toISOString(),   timeZone: 'UTC' },
      attendees: [
        { email: bookingRow.email,  displayName: bookingRow.name },
        { email: FROM_EMAIL,        displayName: 'Jyotish Consultations' },
      ],
      conferenceData: {
        createRequest: {
          requestId:             bookingId + '_reschedule_' + Date.now(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      guestsCanSeeOtherGuests: false,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 1440 },
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 10 },
        ],
      },
    };
    var newCalEvent = Calendar.Events.insert(newEventResource, calId, { conferenceDataVersion: 1 });
    newCalEventId   = newCalEvent.id;
    newMeetLink     = newCalEvent.hangoutLink || '';
    if (!newMeetLink && newCalEvent.conferenceData && newCalEvent.conferenceData.entryPoints) {
      for (var ep = 0; ep < newCalEvent.conferenceData.entryPoints.length; ep++) {
        if (newCalEvent.conferenceData.entryPoints[ep].entryPointType === 'video') {
          newMeetLink = newCalEvent.conferenceData.entryPoints[ep].uri;
          break;
        }
      }
    }
    // Update new slot with meetLink
    var slotsSheet2 = sheet('Slots');
    var sData2      = slotsSheet2.getDataRange().getValues();
    var sH2         = sData2[0];
    for (var su = 1; su < sData2.length; su++) {
      if (String(sData2[su][sH2.indexOf('id')]) === newSlotId) {
        slotsSheet2.getRange(su + 1, sH2.indexOf('meetLink') + 1).setValue(newMeetLink);
        break;
      }
    }
    Logger.log('adminRescheduleBooking: new meetLink=' + newMeetLink);
  } catch (calErr) {
    Logger.log('adminRescheduleBooking: Calendar API failed (non-fatal): ' + calErr.message);
    newMeetLink = '(Calendar error — contact admin)';
  }

  // ── Update Bookings row ───────────────────────────────────
  bookingsSheet.getRange(bookingRowIdx + 1, bHeaders.indexOf('slotId')          + 1).setValue(newSlotId);
  bookingsSheet.getRange(bookingRowIdx + 1, bHeaders.indexOf('meetLink')         + 1).setValue(newMeetLink);
  bookingsSheet.getRange(bookingRowIdx + 1, bHeaders.indexOf('calendarEventId')  + 1).setValue(newCalEventId);

  // ── Send rescheduling email ───────────────────────────────
  try {
    var tz2      = getConfig().timezone || 'Asia/Kolkata';
    var newTime  = Utilities.formatDate(new Date(newSlotRow.startUtc), tz2, "EEEE, d MMMM yyyy 'at' HH:mm");
    var html2    = '<div style="font-family:Georgia,serif;max-width:560px;margin:auto;padding:32px;background:#07111f;color:#c8d8e8;border-radius:12px;">'
      + '<h2 style="color:#ffc107;">📅 Booking Rescheduled</h2>'
      + '<p>Dear ' + bookingRow.name + ',</p>'
      + '<p>Your consultation has been rescheduled. Your new details:</p>'
      + '<table style="width:100%;border-collapse:collapse;margin:20px 0;">'
      + '<tr><td style="padding:8px;opacity:0.6;">New Date & Time</td><td style="padding:8px;color:#e8f0f8;">' + newTime + ' (' + tz2 + ')</td></tr>'
      + '<tr><td style="padding:8px;opacity:0.6;">Duration</td><td style="padding:8px;color:#e8f0f8;">' + (newSlotRow.durationMinutes || 60) + ' minutes</td></tr>'
      + '<tr><td style="padding:8px;opacity:0.6;">Booking ID</td><td style="padding:8px;color:#e8f0f8;font-size:0.85rem;">' + bookingId + '</td></tr>'
      + (reason ? '<tr><td style="padding:8px;opacity:0.6;">Reason</td><td style="padding:8px;color:#e8f0f8;">' + reason + '</td></tr>' : '')
      + '</table>'
      + (newMeetLink && newMeetLink.indexOf('http') === 0
          ? '<div style="text-align:center;margin:28px 0;"><a href="' + newMeetLink + '" style="background:#f9a825;color:#030712;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:700;display:inline-block;">▶ Join New Google Meet</a></div>'
          : '')
      + '<p style="font-size:0.85rem;opacity:0.6;">A new Google Calendar invite has been sent. The previous invite has been removed.</p>'
      + '</div>';

    GmailApp.sendEmail(
      bookingRow.email,
      'Booking Rescheduled — ' + (newSlotRow.serviceName || bookingRow.serviceId),
      'Your booking has been rescheduled to ' + newTime + '. New Meet: ' + newMeetLink,
      { htmlBody: html2, name: 'Jyotish Consultations' }
    );
    Logger.log('adminRescheduleBooking: rescheduling email sent to ' + bookingRow.email);
  } catch (emailErr) {
    Logger.log('adminRescheduleBooking: email failed (non-fatal): ' + emailErr.message);
  }

  sendAdminAlert('Booking rescheduled: ' + bookingId + ' → new slot: ' + newSlotId + ' | Client: ' + bookingRow.name);

  return {
    rescheduled:      true,
    bookingId:        bookingId,
    newSlotId:        newSlotId,
    newMeetLink:      newMeetLink,
    newCalendarEventId: newCalEventId,
  };
}

// ============================================================
// ADMIN — QUICK CONSULTS
// ============================================================
function adminGetQuickConsults(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');

  var s = SS.getSheetByName('QuickConsults');
  if (!s) return [];

  // Ensure answer columns exist before reading
  var data = s.getDataRange().getValues();
  if (data.length < 1) return [];
  var headers = data[0].map(String);
  ensureQuickConsultsAnswerSchema(s, headers);

  // Re-read after potential schema migration
  data    = s.getDataRange().getValues();
  headers = data[0].map(String);

  if (data.length < 2) return [];

  var rows = data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });

  // Normalise: coerce status to 'received' | 'answered', createdAt to ISO string.
  // This handles old rows where status/createdAt were written into wrong columns.
  var normalised = rows.map(function(r) {
    var status = String(r.status || '');
    // If status doesn't look like a valid status value, it's likely a paymentId
    // that got written into the wrong column — fix by reading paymentId separately
    if (status !== 'received' && status !== 'answered') {
      // Treat as missing status — default to 'received'
      r.paymentId = r.paymentId || status;
      r.status    = 'received';
    }
    var createdAt = String(r.createdAt || '');
    // If createdAt looks like a status string, it was misaligned too
    if (createdAt === 'received' || createdAt === 'answered' || createdAt === '') {
      r.createdAt = new Date().toISOString();
    }
    return {
      id:         String(r.id || ''),
      name:       String(r.name || ''),
      email:      String(r.email || ''),
      phone:      String(r.phone || ''),
      question1:  String(r.question1 || ''),
      question2:  String(r.question2 || '') || undefined,
      question3:  String(r.question3 || '') || undefined,
      paymentId:  String(r.paymentId || ''),
      status:     String(r.status || 'received'),
      createdAt:  String(r.createdAt || new Date().toISOString()),
      answer1:    String(r.answer1 || '') || undefined,
      answer2:    String(r.answer2 || '') || undefined,
      answer3:    String(r.answer3 || '') || undefined,
      answeredAt: String(r.answeredAt || '') || undefined,
    };
  });

  // Filter out completely empty rows (e.g. blank sheet rows)
  normalised = normalised.filter(function(r) { return r.id && r.name; });

  // Return newest first
  return normalised.sort(function(a, b) {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function adminAnswerQuickConsult(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var consultId = body.consultId;
  var answers   = body.answers; // array [answer1, answer2?, answer3?]
  if (!consultId) throw new Error('consultId required');
  if (!answers || !answers[0]) throw new Error('At least one answer is required');

  var s       = sheet('QuickConsults');
  var data    = s.getDataRange().getValues();
  var headers = data[0];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][headers.indexOf('id')]) !== String(consultId)) continue;

    // Write answers — add answer columns if missing
    ensureQuickConsultsAnswerSchema(s, headers);
    // Reload after potential schema migration
    data    = s.getDataRange().getValues();
    headers = data[0];

    var now = new Date().toISOString();
    if (headers.indexOf('answer1') !== -1)
      s.getRange(i + 1, headers.indexOf('answer1') + 1).setValue(answers[0] || '');
    if (headers.indexOf('answer2') !== -1)
      s.getRange(i + 1, headers.indexOf('answer2') + 1).setValue(answers[1] || '');
    if (headers.indexOf('answer3') !== -1)
      s.getRange(i + 1, headers.indexOf('answer3') + 1).setValue(answers[2] || '');
    if (headers.indexOf('status') !== -1)
      s.getRange(i + 1, headers.indexOf('status') + 1).setValue('answered');
    if (headers.indexOf('answeredAt') !== -1)
      s.getRange(i + 1, headers.indexOf('answeredAt') + 1).setValue(now);

    // Send answer email to client
    var row = {};
    headers.forEach(function(h, idx) { row[h] = data[i][idx]; });
    try {
      sendQuickConsultAnswerEmail(row, answers);
    } catch (emailErr) {
      Logger.log('adminAnswerQuickConsult: email failed (non-fatal): ' + emailErr.message);
    }

    return { answered: true, consultId: consultId };
  }
  throw new Error('Quick consult not found: ' + consultId);
}

// Self-healing: add answer columns to QuickConsults sheet if missing
function ensureQuickConsultsAnswerSchema(s, headers) {
  var needed = ['answer1', 'answer2', 'answer3', 'answeredAt'];
  var added  = 0;
  needed.forEach(function(col) {
    if (headers.indexOf(col) === -1) {
      var nextCol = headers.length + 1 + added;
      s.getRange(1, nextCol).setValue(col);
      s.getRange(1, nextCol)
       .setBackground('#1a3454').setFontColor('#ffc107').setFontWeight('bold');
      headers.push(col);
      added++;
      Logger.log('ensureQuickConsultsAnswerSchema: added column ' + col);
    }
  });
}

function sendQuickConsultAnswerEmail(row, answers) {
  var html = '<div style="font-family:Georgia,serif;max-width:560px;margin:auto;padding:32px;'
    + 'background:#07111f;color:#c8d8e8;border-radius:12px;">'
    + '<h2 style="color:#ffc107;">✨ Your Consultation Answers</h2>'
    + '<p>Dear ' + (row.name || 'Client') + ',</p>'
    + '<p>Here are the personalised answers to your questions:</p>';

  [row.question1, row.question2, row.question3].forEach(function(q, idx) {
    if (!q || !answers[idx]) return;
    html += '<div style="margin:20px 0;padding:16px;border:1px solid rgba(255,193,7,0.2);border-radius:8px;">'
      + '<p style="opacity:0.6;font-size:0.85rem;margin-bottom:8px;">Question ' + (idx + 1) + '</p>'
      + '<p style="color:#ffc107;margin-bottom:12px;">' + q + '</p>'
      + '<p style="opacity:0.6;font-size:0.85rem;margin-bottom:8px;">Answer</p>'
      + '<p>' + answers[idx] + '</p>'
      + '</div>';
  });

  html += '<p style="font-size:0.85rem;opacity:0.6;margin-top:24px;">Reference: ' + row.id + '</p>'
    + '</div>';

  GmailApp.sendEmail(
    row.email,
    'Your Quick Consultation Answers — Jyotish Consultations',
    'Your consultation answers are ready. Please view this email in HTML format.',
    { htmlBody: html, name: 'Jyotish Consultations' }
  );
}

// ============================================================
// DAILY CLEANUP TRIGGER
// Set up: GAS editor → Triggers → dailyCleanup → Time-driven
//         → Day timer → Midnight to 1am
// ============================================================
function dailyCleanup() {
  var now = new Date();
  Logger.log('dailyCleanup running at ' + now.toISOString());

  // 1. Release expired slot locks
  var s       = sheet('Slots');
  var data    = s.getDataRange().getValues();
  var headers = data[0];
  var statusCol  = headers.indexOf('status');
  var lockExpCol = headers.indexOf('lockExpiresAt');
  var lockTokCol = headers.indexOf('lockToken');
  var released   = 0;

  for (var i = 1; i < data.length; i++) {
    if (data[i][statusCol] !== 'locked') continue;
    var exp = data[i][lockExpCol] ? new Date(data[i][lockExpCol]) : null;
    if (!exp || now > exp) {
      s.getRange(i + 1, statusCol  + 1).setValue('available');
      s.getRange(i + 1, lockTokCol + 1).setValue('');
      s.getRange(i + 1, lockExpCol + 1).setValue('');
      released++;
    }
  }

  // 2. Delete expired OTP rows (iterate backwards to preserve indices)
  var otpSheet   = sheet('OTP_Tokens');
  var otpData    = otpSheet.getDataRange().getValues();
  var otpHeaders = otpData[0];
  var expIdx     = otpHeaders.indexOf('expiresAt');
  var deleted    = 0;

  for (var j = otpData.length - 1; j >= 1; j--) {
    if (now > new Date(otpData[j][expIdx])) {
      otpSheet.deleteRow(j + 1);
      deleted++;
    }
  }

  Logger.log('dailyCleanup done. Locks released: ' + released + ' | OTPs deleted: ' + deleted);
}