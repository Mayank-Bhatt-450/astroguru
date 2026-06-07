# Google Sheets Schema
# Run this setup manually or adapt as a GAS setup script

## Sheet: Config
# key | value
siteName | Jyotish Consultations
tagline | Ancient Wisdom for the Modern Seeker
adminEmail | admin@yourdomain.com
timezone | Asia/Kolkata
currencySymbol | ₹
currencyCode | INR
waEnabled | true
waNumber | 919876543210
waButtonText | Chat with us
waPosition | bottom-right
waMessage | Hi, I'd like to book a consultation.
urgencyEnabled | true
urgencySlotsText | Only {n} slot(s) left this week
urgencyResponseHours | 3
urgencyPromoText | Limited spots this month
urgencyCountdown |

## Sheet: Services
# id | slug | name | shortDescription | fullDescription | durationMinutes | iconEmoji | imageUrl | isActive | order
astrology | astrology | Vedic Astrology | Personalised birth chart analysis and life guidance. | ... | 60 | ☽ | | TRUE | 1
numerology | numerology | Numerology | Discover your life path through the power of numbers. | ... | 45 | 🔢 | | TRUE | 2
vastu | vastu | Vastu Shastra | Harmonise your space for prosperity and wellbeing. | ... | 60 | 🏠 | | TRUE | 3

## Sheet: Pricing
# id | serviceId | label | price | priceDisplay | isPopular | features | ctaText
p1 | astrology | Birth Chart Reading | 150000 | ₹1,500 | FALSE | ["Birth chart analysis","Planetary positions","1-year forecast","PDF report"] | Book Now
p2 | astrology | Detailed Life Reading | 250000 | ₹2,500 | TRUE | ["Everything in Basic","Dasha analysis","Marriage & career guidance","Follow-up questions"] | Book Now
p3 | numerology | Numerology Reading | 99900 | ₹999 | FALSE | ["Life path number","Personality analysis","Lucky dates","Name correction guidance"] | Book Now
p4 | vastu | Home Vastu Consultation | 199900 | ₹1,999 | FALSE | ["Floor plan analysis","5 remedies","Wealth & health zones","Follow-up call"] | Book Now

## Sheet: Testimonials
# id | name | city | service | rating | body | avatarInitials | createdAt
t1 | Priya Sharma | Mumbai | Astrology | 5 | The reading was incredibly accurate... | PS | 2025-01-10

## Sheet: FAQs
# id | question | answer | order
f1 | How does the online consultation work? | After booking, you'll receive a Google Meet link... | 1
f2 | What should I prepare before the session? | Please have your birth date, time, and place ready... | 2

## Sheet: Slots
# id | serviceId | serviceName | startUtc | endUtc | durationMinutes | status | lockToken | lockExpiresAt | bookingId | meetLink | createdAt
(populated by adminCreateSlots)

## Sheet: Bookings
# id | slotId | serviceId | name | email | phone | status | razorpayOrderId | razorpayPaymentId | razorpaySignature | meetLink | calendarEventId | dateOfBirth | timeOfBirth | cityOfBirth | additionalNotes | createdAt

## Sheet: OTP_Tokens
# email | otp | expiresAt | used

## Sheet: Content_Hero
# key | value
headline | Unlock the Secrets of Your Stars
subheadline | Book a private 1-on-1 consultation for astrology, numerology, or Vastu Shastra.
ctaText | Book a Consultation
ctaSubText | Secure · Private · Instant confirmation

## Sheet: Content_About
# key | value
title | About the Practitioner
body | With over 10 years of practice in Vedic astrology...
yearsExperience | 10
clientsServed | 2500
credentials | Certified Vedic Astrologer,Vastu Expert,Numerology Practitioner

## Sheet: Content_QuickConsult
# key | value
title | Quick Consultation
description | Ask up to 3 questions...
maxQuestions | 3
turnaroundHours | 24
price | 49900
priceDisplay | ₹499
