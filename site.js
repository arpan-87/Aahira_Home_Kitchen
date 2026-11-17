/**
 * Aahira Home Kitchen - Assistant Integration & PII Guard
 * Mounts the hackathon agentify-website runtime and enforces strict client-side PII filtering.
 */

import { App } from "./script.js";

export class PiiGuard {
  static RULES = [
    // Emails
    {
      name: "email",
      regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi,
      replacement: "[email removed]"
    },
    // Credit / Debit Card numbers (13-19 digits, allowing spaces/dashes)
    {
      name: "card",
      regex: /\b(?:\d[ -]*?){13,19}\b/g,
      replacement: "[card number removed]"
    },
    // US SSN-style IDs
    {
      name: "ssn",
      regex: /\b\d{3}-\d{2}-\d{4}\b/g,
      replacement: "[id removed]"
    },
    // Phone numbers (10 to 15 digits with optional country code, brackets, dots, hyphens)
    {
      name: "phone",
      regex: /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?/gi,
      replacement: "[phone removed]"
    },
    // Street Addresses (e.g. 3017 Warren Way, 123 Main Street)
    {
      name: "address",
      regex: /\b\d{1,5}\s+[A-Za-z0-9\s.,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Circle|Cir)\b/gi,
      replacement: "[address removed]"
    }
  ];

  static scrub(text) {
    if (!text || typeof text !== "string") return { text, wasScrubbed: false };
    let cleaned = text;
    let wasScrubbed = false;

    for (const rule of PiiGuard.RULES) {
      if (rule.regex.test(cleaned)) {
        cleaned = cleaned.replace(rule.regex, rule.replacement);
        wasScrubbed = true;
      }
    }

    return { text: cleaned, wasScrubbed };
  }

  static install(engine, agentAppEl) {
    const noticeEl = document.querySelector("#pii-notice");

    // 1. Capture-phase input and enter/send event listener on the agent-app container
    if (agentAppEl) {
      const handleClean = (e) => {
        const inputEl = agentAppEl.querySelector("textarea, input[type='text']");
        if (inputEl && inputEl.value) {
          const { text, wasScrubbed } = PiiGuard.scrub(inputEl.value);
          if (wasScrubbed) {
            inputEl.value = text;
            if (noticeEl) {
              noticeEl.classList.remove("hidden");
              if (App.page) {
                noticeEl.textContent = App.page.t("pii_notice_text");
              }
              setTimeout(() => noticeEl.classList.add("hidden"), 7000);
            }
          }
        }
      };

      // Listen on capture phase for keydown (Enter) and click (send button)
      agentAppEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleClean(e);
      }, true);

      agentAppEl.addEventListener("click", (e) => {
        const btn = e.target.closest("button[type='submit'], .ns-send-btn, button");
        if (btn) handleClean(e);
      }, true);
    }

    // 2. Wrap engine.streamTurn as a second safety net (synchronous to preserve AsyncIterable stream)
    if (engine && typeof engine.streamTurn === "function") {
      const originalStreamTurn = engine.streamTurn.bind(engine);
      engine.streamTurn = function(input, ...args) {
        let cleanInput = input;
        if (typeof input === "string") {
          const res = PiiGuard.scrub(input);
          cleanInput = res.text;
          if (res.wasScrubbed && noticeEl) {
            noticeEl.classList.remove("hidden");
            if (App.page) noticeEl.textContent = App.page.t("pii_notice_text");
            setTimeout(() => noticeEl.classList.add("hidden"), 7000);
          }
        } else if (input && typeof input.text === "string") {
          const res = PiiGuard.scrub(input.text);
          input.text = res.text;
        }
        return originalStreamTurn(cleanInput, ...args);
      };
    }
  }
}

export class AssistantMount {
  static GREETING = "Namaste & Welcome to Aahira Home Kitchen! I am Aahira, your culinary AI assistant. I can answer questions about our authentic regional dishes, allergens, and dietary recommendations, manage your cart, and prepare your checkout or meal subscription. How can I help you today?";

  static DIALOGS = {
    // Write actions change the page without irreversible consequences.
    // If any irreversible action is added in the future, dialogs are declared here.
  };

  static async start() {
    const status = document.querySelector("#assistant-status");
    const appEl = document.querySelector("#agent-app");
    const siteBase = new URL("./", import.meta.url).href;

    try {
      if (status) {
        status.textContent = "Loading assistant runtime...";
      }

      const { boot } = await import("./runtime/index.js");
      const booted = await boot("#agent-app", {
        originUrl: siteBase,
        sandboxWorkerUrl: new URL("runtime/sandbox-worker.js", siteBase).href
      });

      AssistantMount.engine = booted.engine;

      // Install PII Guard
      PiiGuard.install(booted.engine, appEl);

      // Customize confirmation & consent callbacks
      if (booted.engine.onActionConfirm) {
        const defaultConfirm = booted.engine.onActionConfirm;
        booted.engine.onActionConfirm = items => defaultConfirm(items);
      }

      // Check BYOK key state
      const needsKey = !booted.engine.mockLLM &&
        (!booted.engine.byokKey || booted.engine.byokKey === "demo");

      if (status) {
        if (needsKey) {
          status.textContent = "⚙ Assistant needs your AI provider key. Open AI model settings below to begin.";
        } else {
          status.textContent = "● Assistant connected & ready.";
          AssistantMount.greet();
        }
      }

      return booted.engine;
    } catch (error) {
      if (status) {
        status.textContent = "The assistant could not load. You can still order and explore the menu directly above.";
      }
      console.warn("Assistant startup failed (static site functions normally):", error);
      return null;
    }
  }

  static greet() {
    const engine = AssistantMount.engine;
    if (!engine) return;
    try {
      const chat = document.querySelector("#agent-app .ns-chat, #agent-app [data-ns-slot='chat']");
      if (chat && !chat.querySelector(".ns-greeting")) {
        const greetDiv = document.createElement("div");
        greetDiv.className = "ns-message ns-greeting ns-agent";
        greetDiv.textContent = AssistantMount.GREETING;
        chat.prepend(greetDiv);
      }
    } catch (e) {
      console.warn("Could not prepend greeting:", e);
    }
  }
}

// Auto-start assistant mount after DOM is ready
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    // Delay slightly to let page script initialize App.page
    setTimeout(() => {
      AssistantMount.start();
    }, 150);
  });
}
