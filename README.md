# Nobody Left Behind (کوئی پیچھے نہ رہے)
### Resilient Disaster Triage, Vulnerability-First Warning & Resource Dispatch System
**CODE // CONNECT '26 Hackathon Submission**

---

## 1. Team Details

* **Team Name:** Nobody Left Behind / UBIT Cohort
* **Team Members:**
  * **Muhammad Feras Malik**
  * **Muhammad Ahmed Khan**
  * *(Additional team members can be added here)*

---

## 2. Live Product Link

* **Deployed Web Application:** [https://nooneleftbehind-self.vercel.app/](https://nooneleftbehind-self.vercel.app/)
* **Demo Coordinator Access:** `zara.khan@emergency.sindh.gov.pk` (or one-click Quick Demo login on `/login`)
* **Organisation Staff Invite Code:** `SINDH-2026`

---

## 3. GitHub Repository Link

* **Primary Repository:** [https://github.com/Supl3x/UBIT-](https://github.com/Supl3x/UBIT-)
* **Upstream / Collaborative Source:** [https://github.com/MuhammadAhmedKhan2006/UBIT](https://github.com/MuhammadAhmedKhan2006/UBIT)

---

## 4. Project Description

### The Problem
During catastrophic climate emergencies in urban Pakistan—such as the monsoon urban flooding in Karachi (Lyari, Malir, Korangi, Keamari) or extreme heatwave spells in Sindh—standard early-warning systems and emergency relief mechanisms repeatedly experience two critical systemic failures:

1. **The Communication Gap (Missing the Most Vulnerable):** Broadcast alerts (broadcast SMS, smartphone push notifications, sirens) consistently fail to reach the demographic groups at highest risk: bedridden individuals, patients dependent on power (e.g., oxygen concentrators or dialysis), solitary elderly citizens, women and children alone, and households without basic mobile phones. A resident who does not reply to a blast SMS is often treated as "not found" or ignored, whereas in reality, **silence is a signal of distress**.
2. **The Resource Allocation Dilemma (Competing Priorities):** In an emergency where there are only 5 rescue boats and 3 ambulances against 40+ distress requests, manual dispatchers face severe cognitive overload. Without transparent, explainable triage ranking, relief assets are misallocated on a "first-come, first-served" basis rather than being prioritized according to harm reduced, vulnerability severity, and geographic travel time.

### The Solution: Nobody Left Behind
**Nobody Left Behind** is an offline-resilient, human-in-the-loop disaster coordination platform designed specifically for high-density, low-signal urban environments. 

The core philosophy of the system is:
* **The system recommends; a human decides and remains accountable.**
* **Missing or noisy data is never marked "safe":** Unknown records are automatically classified as *High Exposure / Welfare Check Required*.
* **Silence is an escalation signal:** A check-in that receives no reply triggers an automated ladder: Reminder $\rightarrow$ Voice Call $\rightarrow$ Buddy Volunteer dispatch $\rightarrow$ Emergency Rescue Boat.
* **Vulnerability-adjusted warning lead time:** Vulnerable residents (the elderly, bedridden, and disabled) require more time to evacuate than able-bodied residents, so the system alerts them earlier based on personal mobility profiles.
* **Dual-Language & Dialect Resilience:** Fully bilingual (Urdu RTL and English LTR) with support for Roman Urdu disaster intake messages.

---

## 5. Key Features & Architectural Capabilities

### Layer 1: Know Who is Vulnerable (Dynamic Risk Scoring & Registry)
* **Explainable Triage Scoring Engine:** Every case is assigned a transparent risk score calculated as:
  $$\text{Risk Score} = \text{Hazard Exposure} \times \text{Vulnerability Factor} \times \text{Time Urgency Pressure}$$
  Weights automatically adjust if the emergency mode shifts from **Flood** to **Heatwave** or **Cyclone**.
* **Confidence Metric & Uncertainty Safeguard:** Every score includes an explicit confidence score ($0\text{--}100\%$). If a household lacks verified GPS coordinates or recent telemetry, the confidence score drops, and the map visually flags the case with a hatched warning boundary. Missing data triggers action rather than neglect.
* **Community Registrar Portal (`/register`):** Local community registrars (lady health workers, mosque and school committees, UC councillors) register households door-to-door. A database trigger (`registration_to_case`) instantly converts these registrations into scored cases on the coordinator's live queue.

### Layer 2: Reach People the Alerts Miss (Multi-Channel Router & Silence Ladder)
* **Intelligent Channel Router:** Residents do not log in. The system routes alerts based on individual access capabilities:
  * *Smartphones* $\rightarrow$ Telegram Bot with interactive two-way buttons.
  * *Feature / Basic Phones* $\rightarrow$ Low-bandwidth SMS and automated IVR voice calls.
  * *No Phone* $\rightarrow$ Proximity-matched local **Buddy Volunteer** walking the last mile.
* **Two-Way Check-in Protocol (1 / 2 / 3):**
  Residents or their caregivers reply with simple keypad digits:
  * `1` = **Safe / محفوظ** (resolves case, closes escalation ladder).
  * `2` = **Need Help / مدد درکار** (assigns nearby ground volunteer).
  * `3` = **Evacuate Now / فوری انخلاء** (escalates immediately to Tier 1 life threat; dispatches emergency boat).
* **Automated Silence Escalation Ladder:** If a resident does not acknowledge a check-in within designated thresholds (10m, 20m, 30m, 45m), the backend automatically escalates through communication channels and alerts the command team.

### Layer 3: Send Help to the Neediest First (Hungarian Dispatch Optimizer)
* **Three Strict Priority Tiers:**
  * **Tier 1 (Critical Life-Threat):** Bedridden patients, oxygen/dialysis dependency, infants, or children alone trapped in flood water. Life threats are mathematically protected and can never be outranked.
  * **Tier 2 (Urgent Assistance):** Solitary elderly individuals, mobility/visually impaired persons, pregnant women.
  * **Tier 3 (Standard / Monitored):** General households with self-evacuation ability.
* **Hungarian Matching Algorithm on Road & Waterway Graphs:** Optimizes assignments of rescue boats, ambulances, and scout squads against cases by balancing harm reduction against travel time.
* **Plain-Language Trade-Off Explainers:** The dispatcher sees the exact reasoning behind each suggested assignment (e.g., *"Boat Unit 04 to Fatima Bibi: cannot self-evacuate, oxygen-dependent, ranks 1st of 41. Trade-off: Delays welfare check on Bilal Ahmed by 6 mins."*).
* **Accountability & Mandatory Override Reasons:** Coordinators can override any algorithm suggestion, but must provide an auditable justification which is permanently recorded in the immutable audit log.

### Layer 4: Act Early & Cope with Failure (Offline-First & Simulation)
* **Progressive Web App (PWA) with Offline Outbox (`/field`):** Field volunteers can operate completely severed from the internet. Welfare checks, doorstep status updates, and GPS pins are saved locally in IndexedDB / local cache and automatically synchronized to the cloud when cell or LoRa mesh connectivity is restored.
* **What-If Fault Injection Simulator (`/simulate` & `/admin/demo`):** Built-in controls allow coordinators and judges to stress-test the system:
  * Simulating heavy storm rainfall (+220mm) and accelerated water arrival.
  * Toggling cellular network blackouts.
  * Marking bridges/roads impassable (forcing the routing engine to redirect land ambulances to boats).
  * Simulating engine breakdown on rescue assets.
* **Disaster Report Intake Parsing (`/intake`):** Accepts raw, unformatted Roman Urdu, Urdu, and English emergency reports (e.g., *"Lyari gali 4 aslam bhai 6 log ammi bedridden koi phone nahi"*). The edge parser extracts names, landmarks, souls count, and medical flags, identifying duplicates and flagging contradictions for human review.

### Layer 5: Trust, Privacy & Ethics
* **Strict Row-Level Security (RLS) by 5 Real-World Roles:**
  * **Coordinator (`/command`, `/dispatch`, `/simulate`, `/quality`, `/admin`):** Full operational oversight and override authority.
  * **Field Volunteer (`/field`):** Access restricted strictly to assigned tasks and assigned buddy households.
  * **Community Registrar (`/register`):** Access scoped to registrations submitted by their union council.
  * **Shelter Manager (`/shelter`):** Access scoped to capacity, admissions, and supply needs of their designated shelter.
  * **Viewer / Auditor (`/quality/audit`):** Read-only, anonymised access where sensitive names, phone numbers, and exact coordinates are masked at the database level.
* **Fairness & Low-Signal Correction Panel (`/quality/fairness`):** Low-income or flooded areas often report fewer incidents due to total power blackouts. The fairness module detects reporting disparity gaps and allows coordinators to apply equity multipliers so silent areas are not de-prioritized.

---

## 6. Tools and Technologies Used

### Frontend & Client Architecture
* **React 18 & TypeScript:** Strict type-safe UI component architecture.
* **Vite:** High-performance production bundler with optimized asset compression.
* **Tailwind CSS & Custom Design System:** Telemetry and dark-mode glassmorphism interface adhering to international emergency operations center ergonomic standards (high contrast, WCAG 2.1 compliance).
* **Zustand with LocalStorage Persistence:** High-speed reactive state management with client-side offline storage.
* **MapLibre GL & PostGIS:** Spatial rendering of flood elevation contours, hazard sensors, and rescue route waypoints.
* **Bilingual RTL/LTR Engine:** Dynamic bidirectional DOM controller supporting English (LTR) and Nastaliq-styled Urdu (RTL).

### Backend & Cloud Infrastructure
* **Supabase (PostgreSQL 15):** Relational database hosting core schemas, views, and automated SQL triggers.
* **PostGIS Extension:** Spatial queries for radius matching, haversine distance computation, and geographic zone filtering.
* **Supabase Row Level Security (RLS):** Database-enforced role isolation preventing data leakage of vulnerable populations.
* **Supabase Realtime (WebSockets):** Live pub/sub synchronization broadcasting case updates, dispatches, and hazard clock ticks to all active operator consoles.
* **Supabase Edge Functions (Deno / TypeScript):**
  * `tick`: 60-second heartbeat driving escalation, check-in timeouts, and hazard clock decrements.
  * `recompute`: Scoring engine and Hungarian resource optimization.
  * `send-message`: Multi-channel communication router.
  * `telegram-webhook`: Telegram Bot API integration for resident responses.
  * `intake-parse`: NLP parser for Roman Urdu emergency text extraction.
  * `seed-reset-demo`: Administrative snapshotting, scenario loading, and state reset.
* **Open-Meteo API:** Live meteorological forecasts and real-time precipitation monitoring.
* **Vercel:** High-availability edge hosting with continuous deployment from GitHub.

---

## 7. AI Usage Disclosure

In compliance with hackathon regulations, AI tools were utilized transparently during the development lifecycle:

1. **AI-Assisted Pair Programming (Google Antigravity / Gemini):**
   * Accelerated the implementation of the rectangular Hungarian matching algorithm in TypeScript and PostGIS spatial queries.
   * Assisted in drafting comprehensive SQL migrations for Row-Level Security policies and table schema validation.
2. **Roman Urdu NLP Pattern Extraction:**
   * AI assisted in synthesizing regex patterns and training token maps for extracting disaster terminology from colloquial Roman Urdu and Urdu phrases (e.g., recognizing *"bachay chat par"* as stranded minors on a rooftop, *"pani kamar tak"* as waist-deep water exposure, and *"ammi bedridden"* as a Tier 1 life threat).
3. **Synthetic Disaster Dataset Generation:**
   * Used generative techniques to formulate 40+ realistic synthetic resident dossiers across Karachi union councils (Lyari, Malir, Korangi, Keamari), ensuring realistic medical vulnerabilities (dialysis schedules, insulin storage loss during power outages, elderly solitary living) without using real private citizen data.
4. **All algorithmic business logic, emergency escalation rules, safety thresholds, and architectural decisions were designed, evaluated, and verified by human team members.**
