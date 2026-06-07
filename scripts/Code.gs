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
  var ui = SpreadsheetApp.getUi();

  // Confirm destructive rebuild
  if (forceRebuild === true) {
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
    [['email','otp','expiresAt','used']],
    [],
    forceRebuild
  ));

  // ── 9. QuickConsults ──────────────────────────────────
  results.push(_initSheet('QuickConsults',
    [['id','name','email','phone','question1','question2','question3','status','createdAt']],
    [],
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
    'Content_Hero','Content_About','Content_QuickConsult'
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
    Logger.log('route: action=' + action);
    switch (action) {
      case 'boot':                 return ok(getBoot());
      case 'getSlots':             return ok(getSlots(params));
      case 'lockSlot':             return ok(lockSlot(body));
      case 'releaseSlot':          return ok(releaseSlot(body));
      case 'confirmBooking':       return ok(confirmBooking(body));
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
    return r.isActive === true || r.isActive === 'TRUE';
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
  };
}

function getConfig() {
  var rows = sheetRows('Config');
  var cfg  = {};
  rows.forEach(function(r) { cfg[r.key] = r.value; });

  return {
    siteName:       cfg.siteName       || 'Jyotish Consultations',
    tagline:        cfg.tagline        || '',
    adminEmail:     cfg.adminEmail     || '',
    timezone:       cfg.timezone       || 'Asia/Kolkata',
    currencySymbol: cfg.currencySymbol || '₹',
    currencyCode:   cfg.currencyCode   || 'INR',
    whatsapp: {
      enabled:        cfg.waEnabled === 'true',
      number:         cfg.waNumber        || '',
      buttonText:     cfg.waButtonText    || 'Chat with us',
      position:       cfg.waPosition      || 'bottom-right',
      defaultMessage: cfg.waMessage       || 'Hi, I would like to book a consultation.',
    },
    urgency: {
      enabled:           cfg.urgencyEnabled === 'true',
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

  return sheetRows('Slots').filter(function(s) {
    if (s.serviceId !== serviceId) return false;
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
function lockSlot(body) {
  var slotId    = body.slotId;
  var bookingId = body.bookingId;
  if (!slotId) throw new Error('slotId required');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var slotsSheet = sheet('Slots');
    var data       = slotsSheet.getDataRange().getValues();
    var headers    = data[0];
    var idCol      = headers.indexOf('id');
    var statusCol  = headers.indexOf('status');
    var lockCol    = headers.indexOf('lockExpiresAt');
    var lockTokCol = headers.indexOf('lockToken');

    for (var i = 1; i < data.length; i++) {
      if (data[i][idCol] !== slotId) continue;

      var currentStatus = data[i][statusCol];
      var lockExpiry    = data[i][lockCol];

      // Auto-expire stale lock
      if (currentStatus === 'locked' && lockExpiry && new Date(lockExpiry) < new Date()) {
        currentStatus = 'available';
      }

      if (currentStatus !== 'available') {
        throw new Error('Slot is no longer available.');
      }

      var lockToken   = generateId('lk');
      var lockExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      slotsSheet.getRange(i + 1, statusCol  + 1).setValue('locked');
      slotsSheet.getRange(i + 1, lockCol    + 1).setValue(lockExpires);
      slotsSheet.getRange(i + 1, lockTokCol + 1).setValue(lockToken);

      return { lockToken: lockToken, lockExpiresAt: lockExpires };
    }
    throw new Error('Slot not found.');
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

  // 1. Verify Razorpay HMAC signature
  var expectedSig = computeHmacSha256(razorpayOrderId + '|' + razorpayPaymentId, RZP_SEC);
  if (expectedSig !== razorpaySignature) {
    throw new Error('Payment signature verification failed.');
  }

  // 2. Get slot row
  var slots   = sheetRows('Slots');
  var slotRow = null;
  for (var k = 0; k < slots.length; k++) {
    if (slots[k].id === slotId) { slotRow = slots[k]; break; }
  }
  if (!slotRow)                    throw new Error('Slot not found: '     + slotId);
  if (slotRow.status === 'booked') throw new Error('Slot already booked.');

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
  var data    = sheet('Bookings').getDataRange().getValues();
  var headers = data[0];

  for (var i = 1; i < data.length; i++) {
    if (data[i][headers.indexOf('id')] !== body.bookingId) continue;
    var s = sheet('Bookings');
    s.getRange(i + 1, headers.indexOf('dateOfBirth')     + 1).setValue(body.dateOfBirth     || '');
    s.getRange(i + 1, headers.indexOf('timeOfBirth')     + 1).setValue(body.timeOfBirth     || '');
    s.getRange(i + 1, headers.indexOf('cityOfBirth')     + 1).setValue(body.cityOfBirth     || '');
    s.getRange(i + 1, headers.indexOf('additionalNotes') + 1).setValue(body.additionalNotes || '');
    return { saved: true };
  }
  throw new Error('Booking not found: ' + body.bookingId);
}

// ============================================================
// OTP
// ============================================================
function requestOtp(body) {
  var email = body.email;
  if (!email) throw new Error('email required');

  var otp     = Math.floor(100000 + Math.random() * 900000).toString();
  var expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  var s       = sheet('OTP_Tokens');
  var data    = s.getDataRange().getValues();
  var headers = data[0];
  var updated = false;

  for (var i = 1; i < data.length; i++) {
    if (data[i][headers.indexOf('email')] !== email) continue;
    s.getRange(i + 1, headers.indexOf('otp')       + 1).setValue(otp);
    s.getRange(i + 1, headers.indexOf('expiresAt') + 1).setValue(expires);
    s.getRange(i + 1, headers.indexOf('used')      + 1).setValue('false');
    updated = true;
    break;
  }
  if (!updated) s.appendRow([email, otp, expires, 'false']);

  sendOtpEmail(email, otp);
  return { sent: true, expiresAt: expires };
}

function verifyOtp(body) {
  var email   = body.email;
  var otp     = body.otp;
  var s       = sheet('OTP_Tokens');
  var data    = s.getDataRange().getValues();
  var headers = data[0];

  for (var i = 1; i < data.length; i++) {
    if (data[i][headers.indexOf('email')] !== email) continue;
    if (data[i][headers.indexOf('used')]  === 'true') return { verified: false, token: '' };
    if (new Date() > new Date(data[i][headers.indexOf('expiresAt')])) return { verified: false, token: '' };
    if (data[i][headers.indexOf('otp')].toString() !== otp.toString()) return { verified: false, token: '' };
    s.getRange(i + 1, headers.indexOf('used') + 1).setValue('true');
    return { verified: true, token: generateId('otp') };
  }
  return { verified: false, token: '' };
}

// ============================================================
// RAZORPAY ORDER
// ============================================================
function createRazorpayOrder(body) {
  var amount   = parseInt(body.amount);
  var currency = body.currency || 'INR';
  var receipt  = body.receipt  || generateId('rcpt');

  var credentials = Utilities.base64Encode(RZP_KEY + ':' + RZP_SEC);
  var response    = UrlFetchApp.fetch('https://api.razorpay.com/v1/orders', {
    method: 'post',
    headers: { 'Authorization': 'Basic ' + credentials, 'Content-Type': 'application/json' },
    payload: JSON.stringify({ amount: amount, currency: currency, receipt: receipt,
                              notes: { serviceId: body.serviceId, email: body.email } }),
    muteHttpExceptions: true,
  });
  var order = JSON.parse(response.getContentText());
  if (!order.id) throw new Error('Razorpay order creation failed: ' + JSON.stringify(order));
  return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: RZP_KEY };
}

// ============================================================
// QUICK CONSULT
// ============================================================
function handleQuickConsult(body) {
  var consultId = generateId('qc');
  try {
    var s = SS.getSheetByName('QuickConsults') || SS.insertSheet('QuickConsults');
    s.appendRow([
      consultId, body.name, body.email, body.phone,
      (body.questions && body.questions[0]) || '',
      (body.questions && body.questions[1]) || '',
      (body.questions && body.questions[2]) || '',
      'received', new Date().toISOString(),
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
    Logger.log('adminCreateSlots: Unauthorized. Token received: "' + body.adminToken + '" Expected length: ' + (ADMIN_SEC ? ADMIN_SEC.length : 0));
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
  for (var si = 0; si < services.length; si++) {
    if (services[si].id === serviceId) { serviceRow = services[si]; break; }
  }
  var serviceName = serviceRow ? serviceRow.name : serviceId;

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

function adminUpdateSheet(body) {
  if (!verifyAdmin(body.adminToken)) throw new Error('Unauthorized');
  var s = SS.getSheetByName(body.sheetName);
  if (!s) throw new Error('Sheet not found: ' + body.sheetName);

  var data    = s.getDataRange().getValues();
  var headers = data[0];

  body.rows.forEach(function(kv) {
    var key   = kv[0];
    var value = kv[1];
    var found = false;
    for (var i = 1; i < data.length; i++) {
      if (data[i][headers.indexOf('key')] !== key) continue;
      s.getRange(i + 1, headers.indexOf('value') + 1).setValue(value);
      found = true;
      break;
    }
    if (!found) s.appendRow([key, value]);
  });
  return { updated: true };
}

// ============================================================
// UTILITIES
// ============================================================
function verifyAdmin(token) {
  return ADMIN_SEC && token === ADMIN_SEC;
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
