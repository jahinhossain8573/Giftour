# Giftour — AI Ideathon 2026 Final Pitch

**Travel planning, tuned to you.**

---

## Pitch Structure (4 min + 3 min Q&A)

| Section | Time | Weight |
|---|---|---|
| 1. Problem & Impact | 40–45s | 25% |
| 2. Solution & Innovation | 40–45s | 20% |
| 3. Product Demo | 60–75s | 15% |
| 4. Technical Implementation | 35–45s | 20% |
| 5. Product Potential & Closing | 35–45s | 20% |

---

## Full Script

### [1. Problem & Impact — ~45 seconds]

> Travel is one of life's greatest experiences — but for autistic and neurodivergent people, it can be overwhelming to the point of avoidance.
>
> The problem isn't the destination. It's the *unknowns*: How loud will that museum be at noon? How crowded is that market on a Saturday? Will I have enough quiet time to recover between activities?
>
> Standard travel apps treat everyone the same — they show you popular attractions sorted by rating, with zero consideration for your sensory needs. For someone with noise sensitivity or crowd anxiety, blindly following a generic itinerary isn't just uncomfortable — it can lead to shutdowns, meltdowns, and ruined days.
>
> Globally, over 1 in 100 people are autistic. Millions more have sensory sensitivities. Yet no mainstream travel planner accounts for *how your brain processes the world*.
>
> That's the gap Giftour fills.

### [2. Solution & Innovation — ~45 seconds]

> Giftour is a sensory-aware AI travel planner. You tell it where you're going, and it builds a day that respects your nervous system.
>
> Here's what makes it different:
>
> First, it starts with a profile — not your age or budget, but your sensory tolerances across four axes: noise, crowds, light, and unpredictability. Are you comfortable in busy spaces? Do bright lights bother you? The AI learns your answers.
>
> Then it ranks every attraction not by popularity, but by *suitability for you*. The British Museum might be the top-rated attraction in London — but if crowds are hard for you, Giftour will suggest a quieter park instead, and schedule the museum at its least crowded hour.
>
> It tracks a **sensory budget** for your day — just like a financial budget — so you never accidentally overload yourself.
>
> And crucially, it **learns**. Each time you mark an activity as comfortable or overwhelming, the profile adjusts. The AI gets better at predicting what works for you with every day you plan.
>
> AI is essential here because no human planner can hold four dimensions of sensory tolerance, fifteen-plus candidate attractions, crowd curves, climate data, and time constraints in their head simultaneously — and adjust them in real time as the user gives feedback.

### [3. Product Demo — ~70 seconds]

> Let me show you a real user journey.
>
> **[Screen: Role Select]**
> The app opens. The user picks "I'm a Traveller."
>
> **[Screen: Onboarding Quiz]**
> A short quiz asks: How do you feel about noise? Crowds? Bright lights? Unexpected changes? Each answer tunes a sensory tolerance score from 1 to 5. The user sets their name and picks interests — museums, parks, food, quiet spaces.
>
> **[Screen: Calendar → Trip Setup]**
> They pick a date on the calendar — say next Saturday. They type a destination: "Central London." They tap Continue.
>
> **[Screen: AI Itinerary Page — candidate cards]**
> Giftour queries its place database and returns real attractions. Each one is scored for sensory fit. You see the British Museum at 68% fit. Hyde Park at 82% fit. The user taps the ones that appeal.
>
> A time meter and a sensory budget meter show whether their selections fit the day. Green means go.
>
> **[Screen: Generated Itinerary]**
> They tap "Apply plan." Now they see a full timeline: breakfast at 8, Hyde Park at 9, a cafe break, lunch, the British Museum at 2pm when crowds are lowest, then a gentle wind-down. Each slot shows the predicted crowd level, the fit percentage, and a note on *why* it was recommended.
>
> **[Screen: AI Chat Panel]**
> But what if they want changes? They type: "Make it quieter." The AI regenerates, swapping high-stimulus activities for lower-load alternatives. "Add a rest break." Done. This is real iteration — not a static plan.
>
> **[Screen: Companion View — if time permits]**
> And for those who travel with support, a unique code lets a companion — a family member or carer — monitor the itinerary in real time, check the sensory budget, and see what's been completed.
>
> **[Summary]**
> One user journey: answer a quiz → pick a destination → get an AI-generated day that fits your sensory needs → refine with natural language → share with a companion. All in under two minutes.

### [4. Technical Implementation — ~40 seconds]

> The architecture is straightforward:
>
> **User → React Frontend → AI Engine → Places Data → Personalized Itinerary**
>
> The frontend is a React single-page app built with Vite. No backend server — the entire app runs client-side using localStorage for persistence, making it instantly deployable and privacy-friendly.
>
> The AI system is a **scoring engine** built on a sensory model. It takes the user's four-axis sensory profile and scores every candidate attraction against it. If noise tolerance is 2 out of 5, a noisy event like a market gets a heavy penalty. If light sensitivity is low, a bright outdoor park scores well.
>
> The **sensory model** uses weighted axes — noise and crowds are weighted higher because they're more fatiguing. Daily load has a cap derived from the user's tolerance, and the AI inserts scheduled recovery breaks between high-stimulus activities.
>
> For places, it tries the **Google Places API** first — real attractions, real ratings, real addresses. Failing that, it falls back to **curated data for 15 cities** including London, Tokyo, New York, Dhaka, and Sydney. For unknown destinations, it uses a generic calm catalogue.
>
> The **profile refinement** uses a decay algorithm: newer feedback has more weight than older feedback, so the profile evolves naturally as the user explores more.
>
> Climate data biases recommendations toward indoor or outdoor activities based on the current month. And accessibility information flags venues with known neurodivergent-friendly programs.

### [5. Product Potential & Closing — ~40 seconds]

> Where does this go next?
>
> **Target users:** The primary audience is the estimated 75 million autistic people worldwide, plus anyone with sensory sensitivities — that includes people with ADHD, anxiety disorders, PTSD, and chronic migraines. Secondary users are caregivers, travel agencies specializing in accessible travel, and hospitality businesses wanting to advertise their sensory-friendly features.
>
> **Scalability:** The architecture is ready. The AI engine is designed as a drop-in replacement — connect it to a large language model like Claude, and the quality of natural-language itinerary refinement jumps dramatically. Add a proper backend with user accounts, and you enable multi-day trip planning, saved destinations, and real-time companion sync.
>
> **Business model:** Partnerships with tourism boards — cities like London, Tokyo, and Copenhagen already have accessibility programs. Premium features for detailed accessibility reports. B2B licensing for travel agencies and tour operators serving the accessible travel market — valued at over **100 billion dollars annually**.
>
> **Why this matters:** Travel shouldn't be a privilege reserved for people whose nervous systems fit the default. Giftour proves that with thoughtful AI design — not complicated, not expensive — we can make the world more accessible, one itinerary at a time.
>
> Giftour: Travel planning, tuned to you. Thank you.

---

## Suggested Architecture Diagram (for slide)

```
  ┌─────────────────────────────────────────────────────────┐
  │                     Giftour Architecture                  │
  └─────────────────────────────────────────────────────────┘

   Onboarding Quiz ──> Sensory Profile (4 axes + tolerance)
                              │
  Destination ──> Places API / Curated City Data ──> Candidate Attractions
                              │
         AI Scoring Engine (suitability × load × climate × crowd)
                              │
            Personalized Itinerary + Sensory Budget Meter
                              │
        User Feedback ──> Profile Refinement (learning loop)
                              │
        Companion Share <──> Real-time Sync (optional)
```

---

## Judging Criteria Coverage

| Judging Area | Weight | How Giftour Hits It |
|---|---|---|
| **Problem Fit & Real World Impact** | 25% | Solves a genuine gap for autistic travellers; 75M+ people affected globally |
| **Innovation & Idea Quality** | 20% | First sensory-aware travel planner; AI that learns tolerances over time |
| **Technical Implementation** | 20% | Clean React SPA, weighted sensory model, Google Places API, profile refinement |
| **Product Potential & Scalability** | 20% | $100B accessible travel market; B2B licensing + B2C paths |
| **Demo & Presentation** | 15% | Clear user journey with visible AI output and iteration loop |

---

## Q&A Prep

### Anticipated Questions & Answers

**Q: Why did you select this problem?**
A: Travel planning is broken for neurodivergent people. Existing tools recommend by popularity, not by sensory fit. We saw a gap where AI could make a real difference in quality of life — not just convenience.

**Q: How is your solution different from Google Maps or TripIt?**
A: Those tools are popularity-driven. Giftour is profile-driven. It doesn't ask "what's popular?" — it asks "what's right for you?" and quantifies the invisible factors (noise, crowds, light) that standard tools ignore.

**Q: Is the prototype functional?**
A: Yes. It runs as a complete React app in the browser. You can take the quiz, pick a destination, get ranked candidates, generate a full itinerary with timing and rest breaks, refine it with natural language, and share it with a companion.

**Q: How does the AI actually work?**
A: The core innovation is the sensory model — a weighted scoring system across four axes. Each attraction is rated 0–5 on noise, crowds, light, and unpredictability. The user's profile sets maximum comfortable levels for each. The scoring engine ranks candidates by fit, enforces a daily sensory cap, and schedules activities at their least crowded hours.

**Q: What are the limitations?**
A: The current AI engine is deterministic, not a true LLM. Natural language understanding is regex-based — it handles common patterns like "make it quieter" or "add a park" but isn't as flexible as a real language model. The engine is designed for drop-in replacement with a real LLM.

**Q: Who are your target users?**
A: Primary: autistic travellers and anyone with sensory sensitivities. Secondary: companions/caregivers, accessible travel agencies, and hospitality businesses serving this market.

**Q: How do you scale this?**
A: The app is fully client-side — no backend needed to start. Scaling means adding user accounts, multi-day planning, and replacing the mock AI with a real LLM. The architecture is designed for this progression.

**Q: How would you make money?**
A: Freemium model — free single-day planning, premium for multi-day trips and detailed accessibility reports. B2B licensing to travel agencies. Partnerships with tourism boards and hotel chains.

---

## Timing Notes

- **Practice the transitions** between speakers (if multiple team members) — each handoff costs 2–3 seconds.
- **The demo is the longest section** — rehearse it with the actual app open. Know exactly which clicks you're making and what the screen shows at each step.
- **Leave 5 seconds of buffer** in each section so you're not rushing.
- **Have one team member time the full run** with a stopwatch.