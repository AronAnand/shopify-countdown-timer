# Shopify Countdown Timer App

A production-ready Shopify app that displays customizable countdown timers on product pages to create urgency and boost conversions. Built with the MERN stack (MongoDB, Express, React, Node.js) and integrates with Shopify's ecosystem.

![Countdown Timer Preview](https://via.placeholder.com/800x400?text=Countdown+Timer+Preview)

## Features

- **Two Timer Types**
  - **Fixed Timer**: Same countdown for all visitors (ends at specific date/time)
  - **Evergreen Timer**: Per-visitor countdown that starts when they first see it (uses localStorage)

- **Smart Targeting**
  - Apply timers to all products
  - Target specific products by ID
  - Target product collections

- **Full Customization**
  - Custom colors (background & text)
  - Custom headline and supporting text
  - Multiple position options

- **AI-Powered Generation** ✨
  - Describe your goal in plain English
  - AI suggests optimal timer configuration
  - Uses OpenAI GPT-4o-mini

- **Analytics**
  - Impression tracking per timer
  - View performance in dashboard

- **Theme Integration**
  - Theme App Extension for Online Store 2.0
  - Easy setup via theme customizer

## Tech Stack & Why

| Technology | Purpose | Why |
|------------|---------|-----|
| **Node.js + Express** | Backend API | Battle-tested, excellent Shopify SDK support |
| **MongoDB + Mongoose** | Database | Flexible schema for timer configs, great for multi-tenant |
| **React + Polaris** | Admin UI | Consistent with Shopify admin, fast development |
| **Preact** | Storefront Widget | Tiny bundle size (<10KB), React-compatible |
| **OpenAI** | AI Generation | Best-in-class for natural language understanding |
| **React Query** | Data Fetching | Excellent caching, optimistic updates |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SHOPIFY STORE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐        ┌────────────────────────────┐    │
│  │   Embedded App   │        │     Theme Extension        │    │
│  │  (Admin Panel)   │        │   (Product Page Widget)    │    │
│  │                  │        │                            │    │
│  │  ┌────────────┐  │        │  ┌──────────────────────┐  │    │
│  │  │  Dashboard │  │        │  │  Preact Countdown    │  │    │
│  │  │  (Polaris) │  │        │  │     Component        │  │    │
│  │  └────────────┘  │        │  └──────────────────────┘  │    │
│  │        ↓         │        │            ↓               │    │
│  └──────────────────┘        └────────────────────────────┘    │
│           │                              │                      │
└───────────┼──────────────────────────────┼──────────────────────┘
            │                              │
            ▼                              ▼
    ┌───────────────────────────────────────────────────┐
    │              EXPRESS SERVER (API)                  │
    ├───────────────────────────────────────────────────┤
    │                                                    │
    │  /api/timers/*     (Authenticated - CRUD)         │
    │  /api/storefront/* (Public - Timer fetch)          │
    │  /api/timers/ai-generate (AI suggestions)          │
    │                                                    │
    └──────────────────────┬────────────────────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   MongoDB    │
                    │  (Atlas)     │
                    └──────────────┘
```

## Setup Instructions

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (free tier works)
- Shopify Partner account
- OpenAI API key (optional, for AI features)

### 1. Clone & Install

```bash
cd countdown-timer
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
SCOPES=write_products,read_products
HOST=https://your-ngrok-url.ngrok.io
MONGODB_URI=mongodb+srv://...
OPENAI_API_KEY=sk-...  # Optional
```

### 3. Start Development Server

```bash
npm run dev
```

### 4. Connect to Shopify

1. Create app in Shopify Partner Dashboard
2. Set App URL to your ngrok URL
3. Install on development store

## API Endpoints

### Protected Routes (Require Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/timers` | List all timers for shop |
| POST | `/api/timers` | Create new timer |
| GET | `/api/timers/:id` | Get single timer |
| PUT | `/api/timers/:id` | Update timer |
| DELETE | `/api/timers/:id` | Delete timer |
| PATCH | `/api/timers/:id/toggle` | Toggle active status |
| POST | `/api/timers/ai-generate` | Generate AI suggestion |

### Public Routes (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/storefront/timer` | Get active timer for product |
| POST | `/api/storefront/timer/:id/impression` | Track impression |
| GET | `/api/health` | Health check |

### Request/Response Examples

<details>
<summary><b>Create Timer</b></summary>

```bash
POST /api/timers
Content-Type: application/json
Authorization: Bearer <session_token>

{
  "name": "Flash Sale Timer",
  "type": "evergreen",
  "durationMinutes": 120,
  "targeting": {
    "scope": "all"
  },
  "appearance": {
    "backgroundColor": "#FF5733",
    "textColor": "#FFFFFF",
    "headline": "Limited Time Offer!",
    "position": "above-cart"
  }
}
```

Response:
```json
{
  "success": true,
  "data": {
    "_id": "...",
    "name": "Flash Sale Timer",
    "type": "evergreen",
    "status": "active",
    ...
  }
}
```
</details>

<details>
<summary><b>Get Storefront Timer</b></summary>

```bash
GET /api/storefront/timer?shop=mystore.myshopify.com&productId=gid://shopify/Product/123
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "...",
    "type": "evergreen",
    "durationMinutes": 120,
    "appearance": {
      "backgroundColor": "#FF5733",
      "textColor": "#FFFFFF",
      "headline": "Limited Time Offer!",
      "position": "above-cart"
    }
  }
}
```
</details>

## Performance Optimizations

1. **Widget Bundle**: ~8KB minified, ~3KB gzipped (well under 30KB target)
2. **API Caching**: 60-second Cache-Control headers on storefront API
3. **Database Indexes**: Compound indexes on shop + targeting fields
4. **Atomic Updates**: Impression tracking uses `$inc` for thread safety
5. **Lazy Loading**: Widget script loaded with `defer` attribute

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

Test coverage includes:
- Timer expiry calculation
- Targeting logic (products/collections)
- Evergreen localStorage handling
- Status determination
- AI input sanitization

## AI Implementation

The AI generation feature uses OpenAI's GPT-4o-mini model with:

- **Structured Output**: Uses `response_format: { type: 'json_object' }`
- **Safety Rails**: 
  - Never invents specific prices/discounts
  - Validates all AI output before use
  - Input sanitization prevents injection
- **Cost Optimization**: 
  - Temperature: 0.7
  - Max tokens: 200
  - Cheapest capable model

## Future Improvements

Given more time, I would add:

1. **A/B Testing**: Compare timer variants
2. **Scheduling**: Queue timers to start automatically
3. **Templates**: Pre-built timer designs
4. **Webhooks**: Notify when timers expire
5. **Redis Caching**: For higher-traffic stores
6. **Analytics Dashboard**: Charts and trends
7. **Bulk Operations**: Create/edit multiple timers
8. **Multi-language**: i18n for global stores

## Project Structure

```
countdown-timer/
├── app/
│   ├── components/       # React/Polaris components
│   │   ├── Dashboard.jsx
│   │   └── CreateTimer.jsx
│   ├── hooks/           # Custom React hooks
│   ├── middleware/      # Express middleware
│   │   └── auth.js
│   ├── models/          # Mongoose schemas
│   │   ├── Timer.js
│   │   └── Shop.js
│   ├── routes/          # API routes
│   │   ├── timers.js
│   │   └── storefront.js
│   └── server.js        # Express app
├── extensions/
│   └── theme-app-extension/
│       ├── assets/
│       │   └── timer-widget.js
│       └── blocks/
│           └── countdown-timer.liquid
├── __tests__/           # Jest tests
├── .env.example
├── package.json
└── README.md
```

## License

MIT License - see LICENSE file for details.

---

Built with ❤️ for Shopify merchants
