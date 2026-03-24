# AI Manager Insights - Feature Specification

## Overview
An AI-powered chat assistant for managers to get real-time insights and recommendations based on restaurant data.

---

## Option A: Rule-Based Insights Panel (Recommended)

### Features
1. **Quick Insight Cards** - Pre-defined clickable cards with common queries
2. **Insight Categories**:
   - Inventory & Stock
   - Sales & Revenue
   - Staff Performance
   - Waste & Efficiency

### Data Sources
- Inventory levels & forecasts
- Order history & trends
- Staff KPIs
- Waste analytics
- Seasonal patterns

### UI Components
- Sidebar panel accessible from Manager Dashboard
- Chat-like interface with insight cards
- Quick action buttons

---

## Option B: LLM-Powered Chat

### Features
1. **Natural Language Queries**
   - Free-text input
   - Context-aware responses
   
2. **Data Context Provided to LLM**
   - Current inventory levels
   - Recent sales (7/30/90 days)
   - Staff performance metrics
   - Seasonal patterns

### Technical Requirements
- OpenAI GPT-4 API or Gemini API
- Message history storage
- Token optimization

---

## Comparison

| Feature | Option A | Option B |
|---------|----------|----------|
| Implementation Time | 1-2 days | 3-5 days |
| External APIs | None | OpenAI/Gemini |
| Cost | Free | $50-200/month |
| Reliability | High | Depends on API |
| Customization | Limited | Unlimited |

---

## Recommended Implementation Plan

### Phase 1: Quick Insights Panel
1. Create insights service with rule-based queries
2. Build UI component with category tabs
3. Add "Ask AI" button to Manager Dashboard

### Phase 2: Enhanced Analytics
1. Add trend analysis algorithms
2. Implement anomaly detection
3. Add recommendation engine

### Phase 3 (Future): LLM Integration
1. Add OpenAI API integration
2. Implement chat memory
3. Add voice input option

---

## Sample Insights (Option A)

1. **"Top selling items today"** → Shows top 5 items by revenue
2. **"Items running low"** → Lists items below reorder threshold
3. **"Staff performance this week"** → Shows KPI completion rates
4. **"Waste trends"** → Displays waste by category
5. **"Revenue forecast"** → Based on historical patterns
6. **"Peak hours today"** → Shows busiest times
7. **"Slow-moving inventory"** → Items with low turnover

---

## UI Mockup

```
┌─────────────────────────────────────┐
│  🤖 AI Manager Insights        [X]  │
├─────────────────────────────────────┤
│  Categories:                        │
│  [Inventory] [Sales] [Staff] [All]  │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │ 📦 Reorder Suggestions     │    │
│  │ 3 items need attention     │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 💰 Today's Revenue          │    │
│  │ $2,450 (+12% vs avg)      │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ 👥 Staff on Duty           │    │
│  │ 5 active / 8 total         │    │
│  └─────────────────────────────┘    │
│                                     │
│  [Ask a question...]           [→] │
└─────────────────────────────────────┘
```

---

## Technical Notes

- Use existing API endpoints (no new backend needed initially)
- Cache insights for 5 minutes to reduce DB load
- Add to Manager Dashboard as collapsible sidebar
- Follow dark theme design system (slate-800/700)