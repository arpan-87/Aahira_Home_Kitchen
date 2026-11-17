# Aahira Home Kitchen

> An Open Agentic Website built for **The Open Agentic Web Challenge**.
> Status: Demo Website

Aahira Home Kitchen offers fresh, homestyle Indian regional dishes celebrating culinary traditions from Punjab, Tamil Nadu, Bengal, and Indo-Chinese street fare.

## Architecture & Hackathon Compliance

This project satisfies all rules of an Open Agentic Website:
1. **Machine-Readable Agent Network**: Published at `aahira_kitchen.network.json` and `agent-manifest.json`.
2. **Browser Runtime**: Runs client-side using the `agentify-website` runtime (`runtime/`), incurring $0 server AI costs.
3. **Bring Your Own Key (BYOK)**: Supports Otari, OpenAI, and OpenRouter via browser-local encrypted key storage.
4. **Website Tools**: Exposes 9 browser-level `website_*` tools with schema validation in `site-actions.js` wrapping `script.js`.
5. **Two-Agent Network**:
   - `aahira_assistant`: Front coordinator for menu navigation, cart management, checkout preparation, order tracking, and language switching.
   - `nutrition_advisor`: Specialist providing recommendations for nut allergies, lactose intolerance, gluten-free, diabetes-friendly, and high-protein workout nutrition.
6. **Privacy Guard (PiiGuard)**: Client-side capture-phase interceptor in `site.js` that scrubs emails, phone numbers, card numbers, SSNs, and street addresses before any text reaches the AI provider.
7. **Excel Menu Pipeline**: `data/menu.xlsx` converts to `data/menu.json` using `npm run build:menu`.
8. **Multi-language Support**: English, Hindi, Spanish, Chinese, and Bengali.

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Build menu from Excel
npm run build:menu

# Compile agent network from HOCON
npm run build:network

# Serve website locally
npm run serve
# Open http://127.0.0.1:8080/
```

## Testing Checklist

| # | Test | Expected Result |
|---|------|-----------------|
| 1 | Open page & switch languages | All sections translate, dish names translate |
| 2 | Menu filters (Nut-free + Dairy-free + Dinner) | Shows only matching dishes |
| 3 | Add items to cart & toggle fulfillment | Totals and $4.99 delivery fee (free over $50) correct |
| 4 | Checkout validation | Clear errors on invalid/missing fields |
| 5 | Checkout submission | Order confirmation with AHK ID shown |
| 6 | Alcoholic drink in cart | 21+ verification checkbox appears and is required |
| 7 | Subscriptions | Weekly (5% off) / Monthly (10% off) live price estimate & AHS ID |
| 8 | Order status lookup | Returns status for AHK / AHS IDs |
| 9 | Chat nutrition queries | Delegates to `nutrition_advisor` with nut/dairy-free recommendations |
| 10 | Chat cart updates | Natural language adds items to visible cart |
| 11 | Credit card query | Polite decline: cash, cheque, or Zelle only |
| 12 | PII in chat | PiiGuard strips sensitive data before sending |
| 13 | Build scripts | Both `build:menu` and `build:network` succeed with 0 errors |
