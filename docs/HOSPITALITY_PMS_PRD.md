# Servv Stay — Hospitality Property Management System
## Product Requirements Document & User Stories
**Version:** 1.0  
**Date:** 2026-04-18  
**Status:** Draft

---

## 1. Executive Summary

Servv Stay is a cloud-based Property Management System (PMS) for hotels, guesthouses, lodges, and serviced apartments. It centralises multi-platform booking management (Booking.com, Airbnb, Expedia, Triply, etc.) with a full-stack operational layer covering front desk, housekeeping, staff, orders, guest requests, and revenue analytics — all in one system.

---

## 2. Problem Statement

Independent and mid-scale properties currently juggle:
- Multiple OTA extranets (Booking.com, Airbnb, Expedia) with no single source of truth
- Manual availability updates causing double bookings
- Paper-based or WhatsApp-driven guest requests and housekeeping
- No visibility into real-time occupancy, RevPAR, or channel performance
- Staff management disconnected from operations

Servv Stay solves this with a unified platform that syncs in real time across all channels and manages every operational touchpoint.

---

## 3. Target Users / Personas

| Persona | Role | Primary Needs |
|---|---|---|
| **Property Owner** | Business owner / investor | Revenue reports, occupancy trends, profitability |
| **General Manager** | Oversees all operations | Full system visibility, approvals, staff management |
| **Front Desk Agent** | Check-in/out, reservations | Fast check-in, guest profiles, room assignment |
| **Housekeeping Staff** | Room cleaning & inspection | Task list, room status updates |
| **Maintenance Staff** | Repairs & maintenance | Issue tickets, work orders |
| **Restaurant/Bar Staff** | In-property F&B | Room service orders, POS |
| **Revenue Manager** | Pricing & distribution | Rate management, channel parity, forecasting |
| **Guest** | Traveller staying at property | Self-service requests, digital check-in, communication |

---

## 4. Core Modules

### 4.1 Channel Manager
Real-time 2-way sync of availability, rates, and restrictions across all connected OTAs.

**Supported Channels (Phase 1):**
- Booking.com
- Airbnb
- Expedia / Hotels.com
- Triply
- Agoda
- Direct booking engine (property website)

**Features:**
- Unified availability calendar (all channels, all room types)
- Rate plans: standard, non-refundable, early bird, last-minute
- Minimum stay, stop-sell, close-out controls per channel
- Automatic inventory deduction on new booking from any channel
- Overbooking protection with configurable buffer

---

### 4.2 Reservation Management
Central inbox for all bookings regardless of source.

**Features:**
- Unified reservation list with source tag (OTA logo/badge)
- New, modified, cancelled booking notifications in real time
- Reservation detail: guest info, room type, dates, rate, extras, special requests
- Manual reservation creation (phone/walk-in/corporate)
- Group bookings with room block management
- Waitlist management
- Cancellation & modification workflow with policy enforcement
- Deposit & payment tracking
- Reservation timeline / Gantt view per room type

---

### 4.3 Front Desk
Day-to-day check-in/out and guest management.

**Features:**
- Arrivals & departures dashboard (today, tomorrow, next 7 days)
- One-click check-in with room assignment
- Early check-in / late check-out with fee automation
- Digital registration card (guest signs on tablet/mobile)
- Room upgrade offer at check-in
- Guest profile with stay history, preferences, notes
- Group check-in (bulk)
- No-show management
- Folio management — add charges, adjustments, discounts
- Bill splitting (multiple folios per reservation)
- Payment processing: cash, card, mobile money, bank transfer
- Invoice & receipt generation (PDF)
- Key card integration (Phase 2)

---

### 4.4 Room & Property Management
Define and manage the physical property.

**Features:**
- Room types: define name, bed type, capacity, amenities, photos
- Individual room setup: number/name, floor, type, connecting rooms
- Room status: Available, Occupied, Dirty, Clean, Inspected, Out of Order, Out of Service
- Maintenance flag per room with reason and expected resolution
- Room amenities checklist
- Room notes (visible to housekeeping & front desk)
- Multi-property support (property group management)

---

### 4.5 Housekeeping
Task management for cleaning teams.

**Features:**
- Housekeeping dashboard: room status board (colour-coded grid)
- Auto-generate cleaning tasks on checkout
- Assign rooms to housekeepers by floor/zone or manually
- Task status: Pending → In Progress → Cleaned → Inspected
- Housekeeper mobile view (phone-friendly task list)
- Supervisor inspection workflow — mark room inspected before it can be assigned
- Minibar restock checklist per room
- Lost & found logging
- Linen tracking (optional)
- Priority flag for early arrivals

---

### 4.6 Maintenance
Issue tracking and work orders.

**Features:**
- Maintenance request: raised by any staff or guest
- Categories: Electrical, Plumbing, HVAC, Furniture, Tech, Other
- Priority: Low, Medium, High, Urgent
- Assign to maintenance staff
- Status: Open → In Progress → Resolved → Closed
- Photo attachment (before/after)
- Cost tracking per issue
- Recurring maintenance schedules (preventive maintenance)
- Out-of-Order room lock when critical issue is open

---

### 4.7 Guest Services & Requests
Digital concierge and guest communication.

**Features:**
- Guest portal (web link sent via SMS/email on check-in)
- Guest can submit: room service order, extra pillow/towel, wake-up call, taxi request, laundry, general inquiry
- Request inbox for front desk / relevant department
- Request assignment to staff member
- Status tracking: Received → In Progress → Fulfilled
- Estimated fulfilment time per category
- Guest satisfaction rating per request (1–5 stars)
- Push notification / SMS update to guest on status change
- Pre-arrival messaging: "Your room is ready", arrival instructions
- Post-stay review request automation

---

### 4.8 Orders & Point of Sale (F&B)
Room service and in-property food & beverage.

**Features:**
- Menu management per outlet (restaurant, bar, room service, pool bar)
- Order creation: linked to room/guest or walk-in
- Order types: Dine-in, Room Service, Takeaway
- Kitchen Display System (KDS) integration
- Charge to room (post to guest folio) or pay directly
- Minibar consumption logging — auto-charge on checkout
- Table management for restaurant outlet
- Daily F&B revenue report

---

### 4.9 Staff Management
People operations for the property.

**Features:**
- Staff profiles: name, role, contact, department, hire date
- Roles: Manager, Front Desk, Housekeeping, Maintenance, F&B, Security, Concierge
- Shift scheduling (weekly planner)
- On-duty / off-duty status toggle
- Task assignment and completion tracking
- Staff performance metrics: requests handled, check-ins processed, rooms cleaned
- Attendance log (clock-in/out)
- Salary & payroll summary (export to CSV)

---

### 4.10 Revenue Management & Analytics
Data-driven pricing and business intelligence.

**Features:**
- **Key Metrics Dashboard:** Occupancy %, ADR (Average Daily Rate), RevPAR, Total Revenue
- Revenue by channel breakdown (Booking.com vs Airbnb vs Direct, etc.)
- Pickup report (bookings made today for future dates)
- Pace report (bookings vs same period last year)
- Dynamic pricing suggestions based on occupancy and demand
- Rate parity checker (ensure same rate across channels)
- Forecasting (next 30/60/90 days occupancy projection)
- Custom date range reports
- Export to Excel/PDF

---

### 4.11 Invoicing & Accounting
Financial management.

**Features:**
- Guest folio (itemised bill per stay)
- Corporate billing (invoice to company)
- City ledger (credit accounts for corporates/agents)
- Daily revenue summary
- Night audit report
- Tax configuration (VAT, tourism levy, service charge)
- Integration hooks for accounting software (QuickBooks, Xero) — Phase 2

---

## 5. User Stories

### 5.1 Channel Manager

**US-CM-01**  
*As a Revenue Manager, I want all my OTA channels to update automatically when I close availability for a date, so that I never get a double booking.*

**US-CM-02**  
*As a General Manager, I want to see which channel generated the most bookings this month, so that I can focus marketing spend on the best-performing platform.*

**US-CM-03**  
*As a Revenue Manager, I want to set a different rate for Booking.com and direct bookings, so that I can incentivise direct bookings with a lower price.*

**US-CM-04**  
*As a Front Desk Agent, I want new OTA bookings to appear in the reservation list automatically within seconds, so that I don't miss any arrival.*

**US-CM-05**  
*As a General Manager, I want a notification when a booking is cancelled on any channel, so that I can re-open the room and try to resell it.*

---

### 5.2 Reservation Management

**US-RM-01**  
*As a Front Desk Agent, I want to create a manual reservation for a walk-in guest in under 2 minutes, so that I don't keep the guest waiting.*

**US-RM-02**  
*As a Front Desk Agent, I want to see all arrivals for today and tomorrow in a single view, so that I can plan staffing and room readiness.*

**US-RM-03**  
*As a General Manager, I want to manage group bookings with a room block, so that I can hold inventory for corporate clients without exposing it on OTAs.*

**US-RM-04**  
*As a Front Desk Agent, I want to see the guest's special requests (e.g. "high floor, twin beds") on the reservation detail, so that I can prepare the room accordingly.*

**US-RM-05**  
*As a Revenue Manager, I want to see the cancellation reason when a guest cancels, so that I can identify patterns and reduce cancellations.*

**US-RM-06**  
*As a Front Desk Agent, I want to process a refund for a cancelled reservation and automatically update the folio balance.*

---

### 5.3 Front Desk

**US-FD-01**  
*As a Front Desk Agent, I want to check in a guest with one click once I've verified their ID, so that check-in takes under 60 seconds.*

**US-FD-02**  
*As a Front Desk Agent, I want to assign a specific room to a guest based on their room type booking and current availability, so that I never assign a dirty or occupied room.*

**US-FD-03**  
*As a Front Desk Agent, I want to offer a room upgrade at check-in if a better room is available, so that I can upsell and improve the guest experience.*

**US-FD-04**  
*As a Front Desk Agent, I want to add charges (room service, laundry, minibar) to a guest's folio, so that everything is settled at checkout.*

**US-FD-05**  
*As a Front Desk Agent, I want to generate a PDF invoice on checkout, so that the guest has a record of their stay.*

**US-FD-06**  
*As a General Manager, I want to see all no-shows at the end of the day, so that I can charge no-show fees and update availability.*

---

### 5.4 Housekeeping

**US-HK-01**  
*As a Housekeeper, I want to see my assigned rooms for today on my phone, so that I know exactly where to go without asking the supervisor.*

**US-HK-02**  
*As a Housekeeper, I want to update a room status to "Cleaned" from my phone when I finish, so that front desk can assign it to arriving guests immediately.*

**US-HK-03**  
*As a Housekeeping Supervisor, I want to inspect a room and mark it "Inspected" before it's released for check-in, so that quality is maintained.*

**US-HK-04**  
*As a Housekeeping Supervisor, I want to see a colour-coded room grid showing every room's current status, so that I can prioritise urgent arrivals.*

**US-HK-05**  
*As a Housekeeper, I want to log items found in a guest's room under lost & found, so that the property has a record and can return items.*

**US-HK-06**  
*As a Housekeeping Supervisor, I want to set a room to "Out of Order" with a reason, so that front desk cannot assign it to guests.*

---

### 5.5 Maintenance

**US-MT-01**  
*As a Front Desk Agent, I want to raise a maintenance request for a guest complaint (e.g. broken AC) directly from the reservation, so that it's resolved quickly.*

**US-MT-02**  
*As a Maintenance Staff member, I want to see my assigned work orders on my phone with photos of the issue, so that I can fix it without needing a briefing.*

**US-MT-03**  
*As a General Manager, I want to see all open maintenance issues with their priority and age, so that I can ensure nothing is left unresolved.*

**US-MT-04**  
*As a Maintenance Staff member, I want to mark an issue as resolved and attach a photo, so that the supervisor can verify without visiting.*

**US-MT-05**  
*As a General Manager, I want recurring maintenance tasks (e.g. monthly fire extinguisher check) to be auto-generated, so that preventive maintenance is never missed.*

---

### 5.6 Guest Services

**US-GS-01**  
*As a Guest, I want to request extra towels from my phone without calling reception, so that I get what I need quickly and conveniently.*

**US-GS-02**  
*As a Guest, I want to track the status of my request (e.g. "your towels are on the way"), so that I know when to expect delivery.*

**US-GS-03**  
*As a Front Desk Agent, I want all guest requests to appear in a shared inbox with their room number and priority, so that no request falls through the cracks.*

**US-GS-04**  
*As a General Manager, I want to see average request fulfilment time per category, so that I can identify service bottlenecks.*

**US-GS-05**  
*As a Guest, I want to receive a pre-arrival message with check-in instructions and a link to my digital registration, so that check-in is fast when I arrive.*

**US-GS-06**  
*As a General Manager, I want the system to automatically send a review request to guests 24 hours after checkout, so that we collect more online reviews.*

---

### 5.7 Orders & F&B

**US-OD-01**  
*As a Guest, I want to order room service from my phone via the guest portal, so that I don't need to call reception.*

**US-OD-02**  
*As F&B Staff, I want room service orders to appear on the kitchen display instantly, so that preparation starts without delay.*

**US-OD-03**  
*As a Front Desk Agent, I want room service charges to be automatically posted to the guest's folio, so that the guest settles everything at checkout.*

**US-OD-04**  
*As a General Manager, I want to see daily F&B revenue broken down by outlet (restaurant, bar, room service), so that I can track each outlet's performance.*

**US-OD-05**  
*As a Housekeeper, I want to log minibar items consumed during a guest's stay, so that they are automatically charged at checkout.*

---

### 5.8 Staff Management

**US-SM-01**  
*As a General Manager, I want to create staff accounts with specific roles so that each person only sees what's relevant to their job.*

**US-SM-02**  
*As a General Manager, I want to see who is on duty right now across all departments, so that I know coverage at a glance.*

**US-SM-03**  
*As a General Manager, I want to build a weekly shift schedule and publish it to staff, so that everyone knows their working hours in advance.*

**US-SM-04**  
*As a General Manager, I want to see staff performance metrics (rooms cleaned, requests handled, check-ins processed), so that I can identify top performers and those needing support.*

---

### 5.9 Revenue & Analytics

**US-RA-01**  
*As a General Manager, I want to see today's occupancy %, ADR, and RevPAR on the dashboard as soon as I log in, so that I have an immediate pulse on the business.*

**US-RA-02**  
*As a Revenue Manager, I want to compare this month's revenue by channel vs last month, so that I can see which channels are growing or declining.*

**US-RA-03**  
*As a Property Owner, I want a monthly profit summary report emailed to me automatically, so that I can monitor performance without logging in daily.*

**US-RA-04**  
*As a Revenue Manager, I want to see the booking pace for the next 90 days vs the same period last year, so that I can adjust pricing proactively.*

**US-RA-05**  
*As a General Manager, I want to export any report to Excel or PDF, so that I can share it with stakeholders.*

---

## 6. Integration Requirements

| Integration | Type | Priority |
|---|---|---|
| Booking.com Connectivity API | 2-way channel sync | P0 |
| Airbnb API | 2-way channel sync | P0 |
| Expedia EQC API | 2-way channel sync | P0 |
| Triply | 2-way channel sync | P0 |
| Agoda YCS API | 2-way channel sync | P1 |
| Stripe / Paystack | Payment processing | P0 |
| Twilio / Africa's Talking | SMS notifications | P0 |
| SendGrid | Email notifications | P0 |
| Google Maps | Property location display | P1 |
| QuickBooks / Xero | Accounting export | P2 |
| Key card systems (Salto, ASSA ABLOY) | Door lock integration | P2 |
| WhatsApp Business API | Guest messaging | P1 |

---

## 7. Technical Architecture

- **Frontend:** React + TypeScript + Tailwind CSS (same stack as Servv)
- **Backend:** Supabase (PostgreSQL + Edge Functions + Realtime)
- **Auth:** Custom staff auth (same pattern as Servv) + Guest magic link
- **Channel Manager:** Webhook receiver per OTA + outbound sync queue
- **Real-time:** Supabase Realtime for room status, request inbox, housekeeping board
- **Notifications:** Supabase Edge Function → Twilio (SMS) + SendGrid (email)
- **Hosting:** Vercel (frontend) + Supabase (backend)

---

## 8. Key Database Entities

| Entity | Description |
|---|---|
| `properties` | Hotel/guesthouse properties |
| `room_types` | Categories (Deluxe, Suite, Standard) |
| `rooms` | Individual rooms |
| `reservations` | Bookings from all channels |
| `guests` | Guest profiles with stay history |
| `folios` | Guest billing account per stay |
| `folio_charges` | Line items (room rate, F&B, extras) |
| `channel_connections` | OTA credentials & sync config |
| `availability_calendar` | Daily availability per room type per channel |
| `rate_plans` | Pricing rules per room type |
| `housekeeping_tasks` | Cleaning assignments |
| `maintenance_tickets` | Issue reports & work orders |
| `guest_requests` | Service requests from guests |
| `orders` | F&B orders (room service, restaurant) |
| `staff` | Staff profiles |
| `shifts` | Shift schedules |

---

## 9. Success Metrics

| Metric | Target |
|---|---|
| Double booking rate | < 0.1% |
| Channel sync latency | < 30 seconds |
| Check-in time (with system) | < 2 minutes |
| Guest request fulfilment time | < 15 minutes average |
| Housekeeping room turnaround | Visible in real-time |
| OTA channel connections at launch | Minimum 4 (Booking.com, Airbnb, Expedia, Triply) |
| System uptime | 99.9% |

---

## 10. Phased Rollout

### Phase 1 — Core PMS (MVP)
Reservations, Front Desk, Rooms, Housekeeping, Staff, Basic Reporting

### Phase 2 — Channel Manager
Booking.com, Airbnb, Expedia, Triply live sync

### Phase 3 — Guest Experience
Guest portal, digital check-in, request management, automated messaging

### Phase 4 — F&B & Revenue
Orders/POS, minibar, revenue management, dynamic pricing, advanced analytics

### Phase 5 — Integrations
Key cards, accounting software, WhatsApp Business, additional OTAs
