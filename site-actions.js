// Registers this website's operations with the agent runtime.
// agent-manifest.json loads this module through "actions.module".
// Only the names in "actions.agentTools" become model tools, named website_<name>.
// The 9 website actions wrap App.page methods without duplicating business logic.

import { App } from "./script.js";

export class SiteActions {
  /**
   * Register all 9 website actions with the runtime.
   *
   * @param {object} actions - The runtime registry facade with register(definition)
   */
  static registerActions(actions) {
    actions.register(SiteActions.getKitchenInfoAction());
    actions.register(SiteActions.getMenuAction());
    actions.register(SiteActions.getCartAction());
    actions.register(SiteActions.addToCartAction());
    actions.register(SiteActions.setCartQuantitiesAction());
    actions.register(SiteActions.prepareCheckoutAction());
    actions.register(SiteActions.prefillSubscriptionAction());
    actions.register(SiteActions.checkOrderStatusAction());
    actions.register(SiteActions.setLanguageAction());
  }

  /* 1. get_kitchen_info */
  static getKitchenInfoAction() {
    return {
      name: "get_kitchen_info",
      description: "Read kitchen metadata, operating hours, kitchen clock time, address, delivery policy, earliest pickup time, bookable dates, and subscription plans.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      execute: async () => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.getKitchenInfo();
      }
    };
  }

  /* 2. get_menu */
  static getMenuAction() {
    return {
      name: "get_menu",
      description: "Read available menu dishes filtered by cuisine (Punjabi, Tamil, Bengali, Chinese), category (Appetizer, Lunch, Dinner, Soft Drink, Hard Drink), or dietary lifestyle tags (vegetarian, vegan, nut_free, dairy_free, gluten_free, diabetic_friendly, high_protein).",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {
          cuisine: {
            type: "string",
            description: "Optional cuisine filter: Punjabi, Tamil, Bengali, Chinese, or all",
            enum: ["all", "Punjabi", "Tamil", "Bengali", "Chinese"]
          },
          category: {
            type: "string",
            description: "Optional meal category: Appetizer, Lunch, Dinner, Soft Drink, Hard Drink, or all",
            enum: ["all", "Appetizer", "Lunch", "Dinner", "Soft Drink", "Hard Drink"]
          },
          diets: {
            type: "array",
            description: "Optional list of dietary preferences: vegetarian, vegan, nut_free, dairy_free, gluten_free, diabetic_friendly, high_protein",
            items: {
              type: "string",
              enum: [
                "vegetarian",
                "vegan",
                "nut_free",
                "dairy_free",
                "gluten_free",
                "diabetic_friendly",
                "high_protein"
              ]
            }
          }
        },
        additionalProperties: false
      },
      execute: async (args) => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.getMenu(args || {});
      }
    };
  }

  /* 3. get_cart */
  static getCartAction() {
    return {
      name: "get_cart",
      description: "Read the current contents of the visitor's cart, subtotal, delivery fee, total, fulfillment method, alcohol status, and cart version.",
      effect: "read",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      execute: async () => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.getCart();
      }
    };
  }

  /* 4. add_to_cart */
  static addToCartAction() {
    return {
      name: "add_to_cart",
      description: "Add a quantity of an authentic menu dish to the customer's cart. Updates the visible cart in real-time. IDs must match real menu IDs.",
      effect: "write",
      inputSchema: {
        type: "object",
        required: ["id", "quantity"],
        properties: {
          id: {
            type: "string",
            description: "The unique ID of the dish to add (e.g. PJ-APP-01, TM-LUN-01).",
            enum: App.page ? App.page.catalogIds() : [
              "PJ-APP-01", "PJ-APP-02", "PJ-LUN-01", "PJ-LUN-02", "PJ-DIN-01", "PJ-DIN-02", "PJ-DRK-01", "PJ-DRK-02", "PJ-ALC-01", "PJ-ALC-02",
              "TM-APP-01", "TM-APP-02", "TM-LUN-01", "TM-LUN-02", "TM-DIN-01", "TM-DIN-02", "TM-DRK-01", "TM-DRK-02", "TM-ALC-01", "TM-ALC-02",
              "BN-APP-01", "BN-APP-02", "BN-LUN-01", "BN-LUN-02", "BN-DIN-01", "BN-DIN-02", "BN-DRK-01", "BN-DRK-02", "BN-ALC-01", "BN-ALC-02",
              "CH-APP-01", "CH-APP-02", "CH-LUN-01", "CH-LUN-02", "CH-DIN-01", "CH-DIN-02", "CH-DRK-01", "CH-DRK-02", "CH-ALC-01", "CH-ALC-02"
            ]
          },
          quantity: {
            type: "integer",
            minimum: 1,
            maximum: 50,
            description: "Number of servings to add (1 to 50)."
          }
        },
        additionalProperties: false
      },
      execute: async ({ id, quantity }) => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.addToCart(id, quantity);
      }
    };
  }

  /* 5. set_cart_quantities */
  static setCartQuantitiesAction() {
    return {
      name: "set_cart_quantities",
      description: "Set exact quantities for dishes in the cart. A quantity of 0 removes that item. Updates the visible cart in real-time.",
      effect: "write",
      inputSchema: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            description: "List of items with target quantities.",
            items: {
              type: "object",
              required: ["id", "quantity"],
              properties: {
                id: {
                  type: "string",
                  enum: App.page ? App.page.catalogIds() : [
                    "PJ-APP-01", "PJ-APP-02", "PJ-LUN-01", "PJ-LUN-02", "PJ-DIN-01", "PJ-DIN-02", "PJ-DRK-01", "PJ-DRK-02", "PJ-ALC-01", "PJ-ALC-02",
                    "TM-APP-01", "TM-APP-02", "TM-LUN-01", "TM-LUN-02", "TM-DIN-01", "TM-DIN-02", "TM-DRK-01", "TM-DRK-02", "TM-ALC-01", "TM-ALC-02",
                    "BN-APP-01", "BN-APP-02", "BN-LUN-01", "BN-LUN-02", "BN-DIN-01", "BN-DIN-02", "BN-DRK-01", "BN-DRK-02", "BN-ALC-01", "BN-ALC-02",
                    "CH-APP-01", "CH-APP-02", "CH-LUN-01", "CH-LUN-02", "CH-DIN-01", "CH-DIN-02", "CH-DRK-01", "CH-DRK-02", "CH-ALC-01", "CH-ALC-02"
                  ]
                },
                quantity: {
                  type: "integer",
                  minimum: 0,
                  maximum: 50
                }
              },
              additionalProperties: false
            }
          }
        },
        additionalProperties: false
      },
      execute: async ({ items }) => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.setCartQuantities(items);
      }
    };
  }

  /* 6. prepare_checkout */
  static prepareCheckoutAction() {
    return {
      name: "prepare_checkout",
      description: "Pre-fills order fulfillment method (pickup or delivery), requested date, ready time slot, and payment option on the checkout form, and scrolls to the checkout section. Never accepts personal data (names, emails, phones, or addresses).",
      effect: "write",
      inputSchema: {
        type: "object",
        properties: {
          fulfillment: {
            type: "string",
            enum: ["pickup", "delivery"],
            description: "Fulfillment option: pickup or delivery"
          },
          date: {
            type: "string",
            description: "Requested date in YYYY-MM-DD format (within the bookable dates)"
          },
          time: {
            type: "string",
            description: "Requested time slot in HH:MM format (between 10:00 and 22:00, meeting lead time notice)"
          },
          payment: {
            type: "string",
            enum: ["Cash", "Cheque", "Zelle"],
            description: "Payment method: Cash, Cheque, or Zelle"
          }
        },
        additionalProperties: false
      },
      execute: async (params) => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.prepareCheckout(params || {});
      }
    };
  }

  /* 7. prefill_subscription */
  static prefillSubscriptionAction() {
    return {
      name: "prefill_subscription",
      description: "Pre-fills the plan section of the weekly or monthly meal tiffin subscription form (plan, delivery days, start date, lunch/dinner dishes, fulfillment) and calculates the price estimate. Never accepts personal contact data.",
      effect: "write",
      inputSchema: {
        type: "object",
        required: ["plan", "days"],
        properties: {
          plan: {
            type: "string",
            enum: ["weekly", "monthly"],
            description: "Subscription plan: weekly (5% off) or monthly (10% off)"
          },
          days: {
            type: "array",
            description: "List of delivery days of the week (mon, tue, wed, thu, fri, sat, sun)",
            items: {
              type: "string",
              enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            }
          },
          startDate: {
            type: "string",
            description: "Start date in YYYY-MM-DD format (between tomorrow and 14 days ahead)"
          },
          lunch: {
            type: "object",
            description: "Lunch meal configuration (11:00 to 15:00)",
            properties: {
              time: { type: "string" },
              dishes: {
                type: "array",
                description: "List of 1 to 6 non-alcoholic dish IDs",
                items: { type: "string" }
              }
            },
            additionalProperties: false
          },
          dinner: {
            type: "object",
            description: "Dinner meal configuration (17:00 to 22:00)",
            properties: {
              time: { type: "string" },
              dishes: {
                type: "array",
                description: "List of 1 to 6 non-alcoholic dish IDs",
                items: { type: "string" }
              }
            },
            additionalProperties: false
          },
          fulfillment: {
            type: "string",
            enum: ["pickup", "delivery"]
          }
        },
        additionalProperties: false
      },
      execute: async (params) => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.prefillSubscription(params || {});
      }
    };
  }

  /* 8. check_order_status */
  static checkOrderStatusAction() {
    return {
      name: "check_order_status",
      description: "Check the status of an existing order or subscription by its reference ID (e.g. AHK-YYYYMMDD-NNNN or AHS-YYYYMMDD-NNNN). Returns status without personal contact data.",
      effect: "read",
      inputSchema: {
        type: "object",
        required: ["orderId"],
        properties: {
          orderId: {
            type: "string",
            description: "The order ID (AHK-...) or subscription ID (AHS-...)"
          }
        },
        additionalProperties: false
      },
      execute: async ({ orderId }) => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.checkOrderStatus(orderId);
      }
    };
  }

  /* 9. set_language */
  static setLanguageAction() {
    return {
      name: "set_language",
      description: "Switch the website UI and assistant language to English, Spanish, Chinese, Hindi, or Bengali.",
      effect: "write",
      inputSchema: {
        type: "object",
        required: ["language"],
        properties: {
          language: {
            type: "string",
            enum: ["en", "es", "zh", "hi", "bn"],
            description: "Target language code: en (English), es (Spanish), zh (Chinese), hi (Hindi), or bn (Bengali)"
          }
        },
        additionalProperties: false
      },
      execute: async ({ language }) => {
        if (!App.page) return { ok: false, reason: "Page not initialized yet." };
        return App.page.setLanguage(language);
      }
    };
  }
}

// Module export for agentify runtime loader
export function registerActions(actions) {
  SiteActions.registerActions(actions);
}
