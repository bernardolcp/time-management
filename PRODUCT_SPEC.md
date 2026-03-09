# Prompt: Transform Productivity App into Public Mobile Product

## Context
I have an existing Next.js productivity app (SQLite, Tailwind, NextAuth) built as a personal tool. I'm taking this codebase as the **logic reference** and rebuilding it as a **public-facing mobile app** (React Native). The app is a productivity OS that combines calendar-aware time blocking, quarterly goal tracking, daily habit rituals, and an AI coach that uses real data to call out overcommitment and avoidance patterns.

**What exists today (reference repo):**
- 5-step Daily Entry wizard (energy level, focus word, habit toggles, task planning, review)
- Overcommitment engine: calculates `net_available = work_hours - calendar_events - smart_buffers(lunch, commute, reactive, transitions)`
- Quarterly goals by life area (Saude, Familia, Espiritual, Criativo, Carreira, Financas) with targets/actuals
- Behaviors (recurring habits) linked to goals, with streak tracking and 7-day dot matrix
- Tasks with deep/shallow types, frog flags, estimated minutes, goal/project links
- AI coach (Claude) with 3 modes: daily plan review, accountability check, weekly reflection — brutally honest, math-based, no cheerleading
- Google Calendar sync for real-time capacity calculation
- Daily/weekly AI-generated reviews with scores and pattern detection
- Settings: chronotype, work window, deep work window, configurable buffers

---

## Product Vision

**One-liner:** The app that makes you honest about your time.

**Core insight:** People plan 12 hours of work into 6 available hours, then feel guilty. This app shows them the math — and an AI coach that won't let them lie to themselves.

**Target user:** Ambitious professionals (25-40) who track goals but still feel unproductive because they chronically overcommit.

---

## Technical Architecture

### Stack
- **Mobile:** React Native (Expo) — iOS first, Android second
- **Backend:** Supabase (Postgres + Auth + Edge Functions) OR a Node.js API on Railway/Fly.io
- **Auth:** Supabase Auth (Google, Apple Sign-In) — Apple required for iOS App Store
- **Database:** Postgres (Supabase) — multi-tenant with `user_id` on every table
- **AI:** Anthropic Claude API via backend edge functions (never expose API key to client)
- **Calendar:** Google Calendar API via OAuth2 (refresh tokens stored server-side)
- **Push notifications:** Expo Notifications for daily reminders

### Database Migration from SQLite
Every table gets a `user_id UUID REFERENCES auth.users(id)` column. Add Row Level Security (RLS) policies: `USING (auth.uid() = user_id)`. Key tables to migrate:
- `goals`, `behaviors`, `behavior_logs`, `tasks`, `daily_entries`, `calendar_events`, `projects`, `settings`, `daily_reviews`, `weekly_reviews`

### API Design
- RESTful endpoints behind auth middleware (Supabase JWT or custom)
- All existing API logic (overcommitment calc, streak calc, score calc, AI coach prompts) ports directly — the algorithms are sound
- Rate-limit AI coach calls per user (freemium: 3/day, premium: unlimited)

---

## Onboarding Flow (Progressive Disclosure)

**Principle:** Get the user to their FIRST daily entry in under 3 minutes. Teach everything else through usage, not setup.

### Day 0: Sign Up + Minimal Setup (3 screens max)

**Screen 1 — Welcome**
- "The app that makes you honest about your time"
- Sign in with Google / Sign in with Apple
- (No email/password — reduce friction)

**Screen 2 — Quick Profile**
- "When does your day start?" — morning/afternoon/night (maps to chronotype)
- "Work hours?" — simple slider for start/end (default 8am-6pm)
- That's it. No goals, no habits, no deep configuration.

**Screen 3 — Calendar Connect (optional)**
- "Connect Google Calendar to see your real available time"
- Big button: "Connect Google Calendar"
- Skip link: "I'll do this later" (app works without it, just uses full work window as available)
- Show a preview of what they'll get: "Today you have 4h 20m of actual free time" vs "You think you have 8 hours"

**-> Land on first Daily Entry wizard**
- Guided walkthrough of Step 1 (energy) and Step 2 (focus word) only
- Steps 3-5 are visible but coach tooltips explain each on first visit

### Week 1: Introduce Features Gradually

**Day 1-2:** Daily Entry + simple task creation (no goals, no behaviors)
- After first completed day -> push notification: "Your first day score: 7.2/10. Want the AI coach's take?" -> introduces AI coach

**Day 3:** Nudge to add first behavior
- "You've been tracking tasks for 3 days. Want to add a daily habit to track?" -> opens simple habit creator (just title + frequency)
- Max 3 habits suggested to start

**Day 5-7:** Introduce Goals
- "You've built a streak! Ready to set a quarterly goal?" -> guided goal creation
- Link existing behaviors to the goal
- Show the dot-matrix visualization as motivation

### Week 2+: Full Features Unlocked
- Weekly review prompt (Sunday evening notification)
- Plan page for advanced task planning
- Overcommitment warnings become more aggressive as the app learns patterns
- AI coach tone adjusts based on user's actual performance data

### Settings (Accessible Anytime, Not Required)
Deep work window, lunch break, commute buffer, reactive buffer — all have smart defaults. Power users can tweak. Surface this via "Customize your time calculation" in settings, never in onboarding.

---

## Freemium Model

### Free Tier
- Daily Entry wizard (unlimited)
- Up to 3 goals
- Up to 5 behaviors
- Task planning with overcommitment bar
- Google Calendar sync (1 calendar)
- AI coach: 3 interactions/day
- Daily score + 7-day history
- Basic weekly review (manual only)

### Premium ($7.99/month or $59.99/year)
- Unlimited goals & behaviors
- AI coach: unlimited + weekly AI-generated review
- Multiple calendar sync
- Advanced analytics (monthly trends, goal velocity charts, pattern detection)
- Custom AI coach personality (intensity level slider)
- Export data (CSV/PDF)
- Priority support

### Upgrade Triggers (Soft Paywalls)
- User hits 3 goals -> "Upgrade to add more goals"
- User asks AI coach 4th time -> "You've used today's free coaching. Upgrade for unlimited."
- After 2 weeks of usage -> "Unlock your Weekly AI Review — see patterns across your whole week"

---

## Key UX Decisions

1. **Daily Entry is the core loop.** Every session starts here. Make it feel like a 60-second ritual, not a chore.
2. **The overcommitment bar is the hook.** First-time "wow" moment: "I thought I had 8 hours but I only have 3.5." Show this prominently.
3. **AI coach is the retention engine.** It remembers context across days. "Last Monday you said you'd do X. You didn't. What happened?" — this is what keeps people coming back.
4. **No empty states.** New users see example data / guided prompts, never blank screens.
5. **Mobile-native interactions:** Swipe to complete tasks, haptic feedback on habit toggles, pull-to-refresh scores.
6. **Dark mode from day 1** — the Tempo warm palette adapts well (cream -> dark charcoal).

---

## What to Port vs. Rebuild

### Port Directly (Logic is Proven)
- Overcommitment engine algorithm (`/api/overcommitment/route.ts`) — clamp events to work boundaries, smart buffer detection, deep block counting
- AI coach system prompts (all 3 modes) — the brutal honesty tone is the differentiator
- Streak calculation logic (`/api/behaviors/today/route.ts`)
- Daily score calculation (`/api/scores/route.ts`)
- Smart buffer settings (lunch detection, configurable commute/reactive)
- Goal area taxonomy (Saude, Familia, Espiritual, Criativo, Carreira, Financas) — localize but keep structure

### Rebuild for Mobile
- All UI — React Native components with the Tempo design language (warm editorial feel)
- Navigation — tab bar (Today, Plan, Goals, Review, Settings) instead of sidebar
- Daily Entry wizard — swipeable cards instead of stepped form
- Database — Postgres with RLS instead of SQLite
- Auth — Supabase Auth instead of NextAuth
- Calendar sync — server-side OAuth flow with refresh token rotation
- Push notifications for daily reminders, streak warnings, weekly review prompts

### New for Public Version
- User onboarding flow (described above)
- Freemium gating logic
- Multi-language support (Portuguese + English at minimum)
- Privacy policy, terms of service
- App Store / Play Store metadata
- Analytics (Mixpanel/PostHog) for retention tracking
- Error monitoring (Sentry)
- Offline support with local-first sync (optimistic UI)

---

## Implementation Order

1. **Foundation:** Expo project, Supabase setup, auth (Google + Apple), DB schema with RLS
2. **Core Loop:** Daily Entry wizard (mobile-native), task CRUD, overcommitment engine
3. **Calendar:** Google Calendar OAuth flow + sync + capacity bar
4. **Habits:** Behaviors with streak tracking + dot matrix
5. **AI Coach:** Edge function for Claude API, 3 coaching modes
6. **Goals:** Goal CRUD + quarterly targets + progress visualization
7. **Reviews:** Daily score, weekly AI review
8. **Onboarding:** Progressive disclosure flow described above
9. **Freemium:** Paywall logic, RevenueCat/Stripe integration
10. **Polish:** Push notifications, dark mode, offline support, analytics
