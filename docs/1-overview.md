# Aahira Home Kitchen - Overview & Quick Start

Aahira Home Kitchen is an **Open Agentic Website** developed for **The Open Agentic Web Challenge**.

The website presents a home kitchen in Carmel, Indiana serving authentic Punjabi, Tamil, Bengali, and Indo-Chinese regional dishes.

## Highlights
- **100% Client-Side AI**: The AI assistant runs directly in the visitor's browser using the hackathon's `agentify-website` runtime.
- **BYOK (Bring Your Own Key)**: Visitors can provide their own LLM API key (Otari, OpenRouter, OpenAI, etc.). The kitchen incurs $0 server or AI operating cost.
- **Privacy Guardrail (PiiGuard)**: Captures and sanitizes phone numbers, emails, card numbers, SSNs, and addresses before text reaches the LLM. The AI never places orders or stores PII.
- **Owner-Friendly Excel Menu Pipeline**: The kitchen owner can update dishes, prices, and availability directly in `data/menu.xlsx`, validated and compiled to `data/menu.json` via `npm run build:menu`.
- **Multilingual Support**: Fully localized in English (`en`), Hindi (`hi`), Spanish (`es`), Chinese (`zh`), and Bengali (`bn`).
- **Google Sheets & Apps Script Order Backend**: Free, serverless order and meal subscription logging with automated email confirmations, status tracking, and demo mode fallback via `localStorage`.
