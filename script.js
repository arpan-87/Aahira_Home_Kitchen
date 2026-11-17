/**
 * Aahira Home Kitchen - Client Application & Business Logic
 * Single Page Architecture with KitchenClock, KitchenPage, and App.
 */

export class KitchenClock {
  constructor(timezone = "America/Indiana/Indianapolis") {
    this.timezone = timezone;
  }

  /**
   * Returns current Date parts evaluated in the kitchen's time zone.
   */
  nowParts() {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: this.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(new Date());
    const map = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }
    // hour12: false can return '24' for midnight in some engines
    const hr = parseInt(map.hour, 10) % 24;
    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10),
      day: parseInt(map.day, 10),
      hour: hr,
      minute: parseInt(map.minute, 10),
      second: parseInt(map.second, 10),
      isoDate: `${map.year}-${map.month.padStart(2, "0")}-${map.day.padStart(2, "0")}`,
      timeStr: `${String(hr).padStart(2, "0")}:${map.minute.padStart(2, "0")}`,
      totalMinutes: hr * 60 + parseInt(map.minute, 10)
    };
  }

  todayIso() {
    return this.nowParts().isoDate;
  }

  minutes(timeStr) {
    if (!timeStr || !timeStr.includes(":")) return -1;
    const [h, m] = timeStr.split(":").map(Number);
    return h * 60 + m;
  }

  formatMinutes(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  /**
   * Adds days to an ISO YYYY-MM-DD date string.
   */
  addDays(isoDate, days) {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    return dt.toISOString().slice(0, 10);
  }
}

export class KitchenPage {
  constructor(kitchenConfig, aboutData, menuItems, i18nStrings, currentLang = "en") {
    this.config = kitchenConfig;
    this.about = aboutData;
    this.menu = menuItems;
    this.i18n = i18nStrings;
    this.lang = currentLang;
    this.clock = new KitchenClock(this.config.timezone || "America/Indiana/Indianapolis");

    this.cart = new Map(); // id -> quantity
    this.cartVersion = 1;
    this.fulfillment = "pickup"; // 'pickup' | 'delivery'

    // Menu filters
    this.activeCuisine = "all";
    this.activeCategory = "all";
    this.searchQuery = "";
    this.dietFilters = {
      vegetarian: false,
      vegan: false,
      nutFree: false,
      dairyFree: false,
      glutenFree: false,
      diabeticFriendly: false,
      highProtein: false
    };

    this.orderResult = null;
    this.subResult = null;
  }

  t(key, params = {}) {
    let str = this.i18n[key] || key;
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return str;
  }

  catalogIds() {
    return this.menu.map(item => item.id);
  }

  getItem(id) {
    return this.menu.find(it => it.id === id);
  }

  getLocalizedName(item) {
    if (!item) return "";
    if (item.names && item.names[this.lang]) {
      return item.names[this.lang];
    }
    return item.name;
  }

  /* ---------------- TIME AND SLOTS ---------------- */

  getEarliestReady(dateIso = null) {
    const now = this.clock.nowParts();
    const targetDate = dateIso || now.isoDate;
    const openMins = this.clock.minutes(this.config.hours.open);
    const closeMins = this.clock.minutes(this.config.hours.close);
    const leadMins = (this.config.leadTimeHours || 2) * 60;
    const slotMins = this.config.slotMinutes || 30;

    if (targetDate > now.isoDate) {
      // Future date starts from open time
      return this.clock.formatMinutes(openMins);
    }

    let minReady = now.totalMinutes + leadMins;
    // Round up to next slot
    const rem = minReady % slotMins;
    if (rem !== 0) {
      minReady += (slotMins - rem);
    }

    if (minReady < openMins) minReady = openMins;
    return this.clock.formatMinutes(minReady);
  }

  slotsFor(dateIso) {
    const openMins = this.clock.minutes(this.config.hours.open);
    const closeMins = this.clock.minutes(this.config.hours.close);
    const slotMins = this.config.slotMinutes || 30;
    const now = this.clock.nowParts();

    let earliestAllowed = openMins;
    if (dateIso === now.isoDate) {
      earliestAllowed = this.clock.minutes(this.getEarliestReady(dateIso));
    }

    const slots = [];
    for (let m = openMins; m <= closeMins; m += slotMins) {
      if (dateIso > now.isoDate || m >= earliestAllowed) {
        slots.push(this.clock.formatMinutes(m));
      }
    }
    return slots;
  }

  orderDates() {
    const dates = [];
    const today = this.clock.todayIso();
    const maxDays = this.config.advanceDays || 14;

    for (let i = 0; i <= maxDays; i++) {
      const d = this.clock.addDays(today, i);
      const slots = this.slotsFor(d);
      if (slots.length > 0) {
        dates.push(d);
      }
    }
    return dates;
  }

  checkTime(dateIso, timeStr) {
    if (!dateIso) return { ok: false, reason: this.t("err_date_required"), field: "date" };
    if (!timeStr) return { ok: false, reason: this.t("err_time_required"), field: "time" };

    const validDates = this.orderDates();
    if (!validDates.includes(dateIso)) {
      return { ok: false, reason: this.t("err_date_invalid", { days: this.config.advanceDays || 14 }), field: "date" };
    }

    const tMins = this.clock.minutes(timeStr);
    const openMins = this.clock.minutes(this.config.hours.open);
    const closeMins = this.clock.minutes(this.config.hours.close);

    if (tMins < openMins || tMins > closeMins) {
      return {
        ok: false,
        reason: this.t("err_time_outside_hours", { open: this.config.hours.open, close: this.config.hours.close }),
        field: "time"
      };
    }

    const now = this.clock.nowParts();
    if (dateIso === now.isoDate) {
      const earliestStr = this.getEarliestReady(dateIso);
      const earliestMins = this.clock.minutes(earliestStr);
      if (tMins < earliestMins) {
        return {
          ok: false,
          reason: this.t("err_time_too_early", { hours: this.config.leadTimeHours || 2, earliest: earliestStr }),
          field: "time"
        };
      }
    }

    return { ok: true };
  }

  /* ---------------- TOTALS AND CART ---------------- */

  totals() {
    let subtotal = 0;
    let hasAlcohol = false;

    for (const [id, qty] of this.cart.entries()) {
      const item = this.getItem(id);
      if (item && qty > 0) {
        subtotal += item.price * qty;
        if (item.alcoholic || item.category === "Hard Drink") {
          hasAlcohol = true;
        }
      }
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const isDelivery = this.fulfillment === "delivery";
    let deliveryFee = 0;

    if (isDelivery && subtotal > 0) {
      if (subtotal < (this.config.delivery?.freeOver || 50)) {
        deliveryFee = this.config.delivery?.fee || 4.99;
      }
    }

    const total = Math.round((subtotal + deliveryFee) * 100) / 100;

    return {
      subtotal,
      deliveryFee,
      isDeliveryFree: isDelivery && subtotal >= (this.config.delivery?.freeOver || 50) && subtotal > 0,
      total,
      hasAlcohol,
      version: this.cartVersion
    };
  }

  getCart() {
    const lines = [];
    for (const [id, qty] of this.cart.entries()) {
      const item = this.getItem(id);
      if (item && qty > 0) {
        lines.push({
          id,
          name: this.getLocalizedName(item),
          englishName: item.name,
          category: item.category,
          price: item.price,
          quantity: qty,
          lineTotal: Math.round(item.price * qty * 100) / 100,
          alcoholic: item.alcoholic || item.category === "Hard Drink"
        });
      }
    }
    const t = this.totals();
    return {
      lines,
      itemCount: lines.reduce((acc, l) => acc + l.quantity, 0),
      fulfillment: this.fulfillment,
      subtotal: t.subtotal,
      deliveryFee: t.deliveryFee,
      total: t.total,
      hasAlcohol: t.hasAlcohol,
      version: this.cartVersion
    };
  }

  addToCart(id, qty = 1) {
    const item = this.getItem(id);
    if (!item) {
      return { ok: false, reason: `Item with id '${id}' does not exist.` };
    }
    if (!item.available) {
      return { ok: false, reason: `'${this.getLocalizedName(item)}' is currently not available.` };
    }
    const current = this.cart.get(id) || 0;
    const next = current + Number(qty);
    if (next > 50) {
      return { ok: false, reason: "Maximum quantity per item is 50." };
    }
    this.cart.set(id, next);
    this.cartVersion++;
    this.renderCart();
    return { ok: true, cart: this.getCart() };
  }

  setCartQuantities(itemsList) {
    if (!Array.isArray(itemsList)) {
      return { ok: false, reason: "items must be an array of {id, quantity}." };
    }
    for (const entry of itemsList) {
      const { id, quantity } = entry;
      const item = this.getItem(id);
      if (!item) {
        return { ok: false, reason: `Item '${id}' does not exist.` };
      }
      const q = Math.max(0, Math.min(50, Number(quantity) || 0));
      if (q === 0) {
        this.cart.delete(id);
      } else {
        this.cart.set(id, q);
      }
    }
    this.cartVersion++;
    this.renderCart();
    return { ok: true, cart: this.getCart() };
  }

  clearCart() {
    this.cart.clear();
    this.cartVersion++;
    this.renderCart();
  }

  /* ---------------- PUBLIC ASSISTANT OPERATIONS ---------------- */

  getKitchenInfo() {
    const now = this.clock.nowParts();
    return {
      name: this.config.name,
      tagline: this.config.tagline,
      address: this.config.address,
      phone: this.config.phone,
      email: this.config.email,
      timezone: this.config.timezone,
      currentKitchenTime: now.timeStr,
      currentKitchenDate: now.isoDate,
      operatingHours: this.config.hours,
      leadTimeHours: this.config.leadTimeHours,
      earliestPickupToday: this.getEarliestReady(now.isoDate),
      bookableDates: this.orderDates(),
      delivery: this.config.delivery,
      paymentMethods: this.config.payment?.methods,
      subscriptionPlans: this.config.subscription?.plans,
      currentLanguage: this.lang
    };
  }

  getMenu(filters = {}) {
    let result = this.menu.filter(it => it.available);

    if (filters.cuisine && filters.cuisine !== "all") {
      result = result.filter(it => it.cuisine.toLowerCase() === filters.cuisine.toLowerCase());
    }
    if (filters.category && filters.category !== "all") {
      result = result.filter(it => it.category.toLowerCase() === filters.category.toLowerCase());
    }
    if (filters.diets && Array.isArray(filters.diets)) {
      for (const d of filters.diets) {
        const diet = String(d).toLowerCase().replace(/[-_]/g, "");
        if (diet.includes("veg") && !diet.includes("vegan")) result = result.filter(it => it.vegetarian);
        if (diet.includes("vegan")) result = result.filter(it => it.vegan);
        if (diet.includes("nut")) result = result.filter(it => !it.contains_nuts);
        if (diet.includes("dairy")) result = result.filter(it => !it.contains_dairy);
        if (diet.includes("gluten")) result = result.filter(it => !it.contains_gluten);
        if (diet.includes("diabet")) result = result.filter(it => it.diabetic_friendly);
        if (diet.includes("protein")) result = result.filter(it => it.high_protein);
      }
    }

    return result.map(it => ({
      id: it.id,
      name: this.getLocalizedName(it),
      englishName: it.name,
      cuisine: it.cuisine,
      category: it.category,
      price: it.price,
      description: it.description,
      ingredients: it.ingredients,
      vegetarian: it.vegetarian,
      vegan: it.vegan,
      nutFree: !it.contains_nuts,
      dairyFree: !it.contains_dairy,
      glutenFree: !it.contains_gluten,
      diabeticFriendly: it.diabetic_friendly,
      highProtein: it.high_protein,
      otherAllergens: it.other_allergens,
      calories: it.calories,
      protein_g: it.protein_g,
      spice_level: it.spice_level,
      alcoholic: it.alcoholic
    }));
  }

  prepareCheckout(params = {}) {
    if (params.fulfillment) {
      this.fulfillment = params.fulfillment === "delivery" ? "delivery" : "pickup";
      const rad = document.querySelector(`input[name="co-fulfillment"][value="${this.fulfillment}"]`);
      if (rad) {
        rad.checked = true;
        this.updateFulfillmentView();
      }
    }
    if (params.date) {
      const dateEl = document.querySelector("#co-date");
      if (dateEl) dateEl.value = params.date;
      this.refreshCheckoutTimeSlots();
    }
    if (params.time) {
      const timeEl = document.querySelector("#co-time");
      if (timeEl) timeEl.value = params.time;
    }
    if (params.payment) {
      const payEl = document.querySelector(`input[name="co-payment"][value="${params.payment}"]`);
      if (payEl) payEl.checked = true;
    }

    this.renderCart();
    const cartSec = document.querySelector("#cart");
    if (cartSec) {
      cartSec.scrollIntoView({ behavior: "smooth" });
    }

    return {
      fulfillment: this.fulfillment,
      date: document.querySelector("#co-date")?.value || null,
      time: document.querySelector("#co-time")?.value || null,
      payment: document.querySelector('input[name="co-payment"]:checked')?.value || null,
      totals: this.totals()
    };
  }

  prefillSubscription(params = {}) {
    if (params.plan) {
      const planEl = document.querySelector(`input[name="sub-plan"][value="${params.plan}"]`);
      if (planEl) planEl.checked = true;
    }
    if (params.startDate) {
      const sDateEl = document.querySelector("#sub-start-date");
      if (sDateEl) sDateEl.value = params.startDate;
    }
    if (Array.isArray(params.days)) {
      document.querySelectorAll(".sub-day-cb").forEach(cb => {
        cb.checked = params.days.map(d => String(d).toLowerCase().slice(0, 3)).includes(cb.value);
      });
    }
    if (params.lunch) {
      const lCb = document.querySelector("#sub-include-lunch");
      if (lCb) lCb.checked = true;
      if (params.lunch.time) {
        const lTime = document.querySelector("#sub-lunch-time");
        if (lTime) lTime.value = params.lunch.time;
      }
      if (Array.isArray(params.lunch.dishes)) {
        document.querySelectorAll(".sub-lunch-dish-cb").forEach(cb => {
          cb.checked = params.lunch.dishes.includes(cb.value);
        });
      }
    }
    if (params.dinner) {
      const dCb = document.querySelector("#sub-include-dinner");
      if (dCb) dCb.checked = true;
      if (params.dinner.time) {
        const dTime = document.querySelector("#sub-dinner-time");
        if (dTime) dTime.value = params.dinner.time;
      }
      if (Array.isArray(params.dinner.dishes)) {
        document.querySelectorAll(".sub-dinner-dish-cb").forEach(cb => {
          cb.checked = params.dinner.dishes.includes(cb.value);
        });
      }
    }

    this.updateSubscriptionEstimate();
    const subSec = document.querySelector("#subscribe");
    if (subSec) {
      subSec.scrollIntoView({ behavior: "smooth" });
    }

    return this.calculateSubscriptionSummary();
  }

  /* ---------------- ORDER AND SUBSCRIPTION SUBMISSION ---------------- */

  checkOrder(data) {
    if (this.cart.size === 0) {
      return { ok: false, reason: this.t("err_cart_empty") };
    }
    if (data.expectedVersion && data.expectedVersion !== this.cartVersion) {
      return { ok: false, reason: this.t("err_stale_cart") };
    }

    // Name validations (letters 1-50)
    const nameRegex = /^[A-Za-z\s'-]{1,50}$/;
    if (!data.firstName || !nameRegex.test(data.firstName.trim())) {
      return { ok: false, reason: this.t("err_first_name_required"), field: "firstName" };
    }
    if (!data.lastName || !nameRegex.test(data.lastName.trim())) {
      return { ok: false, reason: this.t("err_last_name_required"), field: "lastName" };
    }

    // Phone validation (10-15 digits)
    const phoneClean = (data.phone || "").replace(/\D/g, "");
    if (phoneClean.length < 10 || phoneClean.length > 15) {
      return { ok: false, reason: this.t("err_phone_required"), field: "phone" };
    }

    // Email format (optional)
    if (data.email && data.email.trim() !== "") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email.trim())) {
        return { ok: false, reason: this.t("err_email_invalid"), field: "email" };
      }
    }

    // Delivery validation
    if (data.fulfillment === "delivery") {
      if (!data.street || data.street.trim() === "") {
        return { ok: false, reason: this.t("err_street_required"), field: "street" };
      }
      if (!data.city || data.city.trim() === "") {
        return { ok: false, reason: this.t("err_city_required"), field: "city" };
      }
      const zipRegex = /^\d{5}$/;
      if (!data.zip || !zipRegex.test(data.zip.trim())) {
        return { ok: false, reason: this.t("err_zip_required"), field: "zip" };
      }
    }

    // Date & time validation
    const timeRes = this.checkTime(data.date, data.time);
    if (!timeRes.ok) {
      return timeRes;
    }

    // Alcohol age confirmation
    const totals = this.totals();
    if (totals.hasAlcohol && !data.alcoholConfirmed) {
      return { ok: false, reason: this.t("err_alcohol_age_confirmation"), field: "alcoholConfirmed" };
    }

    return { ok: true };
  }

  async submitOrder(formData) {
    const check = this.checkOrder(formData);
    if (!check.ok) return check;

    const cartData = this.getCart();
    const orderRecord = {
      kind: "order",
      orderDate: this.clock.nowParts().isoDate,
      orderTime: this.clock.nowParts().timeStr,
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      phone: formData.phone.trim(),
      email: (formData.email || "").trim(),
      fulfillment: formData.fulfillment,
      address: formData.fulfillment === "delivery"
        ? `${formData.street}, ${formData.city}, ${formData.state || "IN"} ${formData.zip}`
        : "Pickup at Kitchen (3017 Warren Way, Carmel, IN)",
      requestedDate: formData.date,
      requestedTime: formData.time,
      items: cartData.lines,
      subtotal: cartData.subtotal,
      deliveryFee: cartData.deliveryFee,
      total: cartData.total,
      paymentMethod: formData.payment,
      notes: (formData.notes || "").trim()
    };

    const res = await this.send(orderRecord, "AHK");
    if (res.ok) {
      this.clearCart();
      this.orderResult = res;
      this.renderOrderConfirmation(res, orderRecord);
    }
    return res;
  }

  async submitSubscription(subData) {
    // Validate subscription
    const summary = this.calculateSubscriptionSummary(subData);
    if (!summary.valid) {
      return { ok: false, reason: summary.error, field: summary.errorField };
    }

    const subRecord = {
      kind: "subscription",
      plan: subData.plan,
      planName: subData.plan === "monthly" ? "Monthly Plan (10% off)" : "Weekly Plan (5% off)",
      startDate: subData.startDate,
      days: subData.days,
      includeLunch: subData.includeLunch,
      lunchTime: subData.lunchTime,
      lunchDishes: subData.lunchDishes,
      includeDinner: subData.includeDinner,
      dinnerTime: subData.dinnerTime,
      dinnerDishes: subData.dinnerDishes,
      firstName: subData.firstName.trim(),
      lastName: subData.lastName.trim(),
      phone: subData.phone.trim(),
      email: (subData.email || "").trim(),
      fulfillment: subData.fulfillment,
      address: subData.fulfillment === "delivery"
        ? `${subData.street}, ${subData.city}, ${subData.state || "IN"} ${subData.zip}`
        : "Pickup at Kitchen",
      paymentMethod: subData.payment,
      estimatedTotal: summary.total
    };

    const res = await this.send(subRecord, "AHS");
    if (res.ok) {
      this.subResult = res;
      this.renderSubscriptionConfirmation(res, subRecord);
    }
    return res;
  }

  async send(record, prefix = "AHK") {
    const endpoint = (this.config.orderEndpoint || "").trim();

    // If an external Apps Script URL is provided, POST via text/plain to avoid CORS pre-flight
    if (endpoint.startsWith("https://script.google.com/")) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(record)
        });
        const json = await response.json();
        return {
          ok: json.ok ?? true,
          id: json.id,
          total: json.total || record.total,
          emailSent: json.emailSent ?? false,
          savedTo: "google-sheet"
        };
      } catch (err) {
        console.warn("Apps Script endpoint unreachable, falling back to local demo mode:", err);
      }
    }

    // Demo Mode Persistence in LocalStorage
    const todayDigits = this.clock.todayIso().replace(/-/g, "");
    const storageKey = prefix === "AHK" ? "aahira_orders" : "aahira_subscriptions";
    const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
    const countToday = existing.filter(r => (r.id || "").includes(todayDigits)).length + 1;
    const generatedId = `${prefix}-${todayDigits}-${String(countToday).padStart(4, "0")}`;

    const savedRecord = {
      ...record,
      id: generatedId,
      status: "Received",
      createdAt: new Date().toISOString(),
      statusUpdated: new Date().toISOString()
    };

    existing.push(savedRecord);
    localStorage.setItem(storageKey, JSON.stringify(existing));

    return {
      ok: true,
      id: generatedId,
      total: record.total || record.estimatedTotal,
      emailSent: Boolean(record.email && record.email.includes("@")),
      savedTo: "demo-local-storage"
    };
  }

  async checkOrderStatus(lookupId) {
    if (!lookupId) return { ok: false, reason: "ID is required" };
    const cleanId = String(lookupId).trim().toUpperCase();
    const endpoint = (this.config.orderEndpoint || "").trim();

    if (endpoint.startsWith("https://script.google.com/")) {
      try {
        const url = `${endpoint}?action=status&id=${encodeURIComponent(cleanId)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.ok) {
          return {
            ok: true,
            id: json.id || cleanId,
            status: json.status,
            kind: json.kind,
            fulfilment: json.fulfilment,
            requestedTime: json.requestedTime,
            total: json.total
          };
        }
      } catch (err) {
        console.warn("Status endpoint error, checking local store:", err);
      }
    }

    // Demo mode lookup
    const orders = JSON.parse(localStorage.getItem("aahira_orders") || "[]");
    const subs = JSON.parse(localStorage.getItem("aahira_subscriptions") || "[]");
    const all = [...orders, ...subs];
    const match = all.find(r => (r.id || "").toUpperCase() === cleanId);

    if (match) {
      return {
        ok: true,
        id: match.id,
        status: match.status || "Received",
        kind: match.kind || "order",
        fulfilment: match.fulfillment || "pickup",
        requestedTime: match.requestedDate ? `${match.requestedDate} ${match.requestedTime}` : match.startDate,
        total: match.total || match.estimatedTotal
      };
    }

    return { ok: false, reason: this.t("status_not_found", { id: cleanId }) };
  }

  /* ---------------- SUBSCRIPTION SUMMARY CALCULATOR ---------------- */

  calculateSubscriptionSummary(customData = null) {
    const data = customData || this.readSubscriptionForm();
    if (!data.includeLunch && !data.includeDinner) {
      return { valid: false, error: this.t("err_sub_no_meal_selected"), errorField: "meals" };
    }
    if (!data.days || data.days.length === 0) {
      return { valid: false, error: this.t("err_sub_no_days_selected"), errorField: "days" };
    }

    // Check dish selections (1-6) and no alcohol
    if (data.includeLunch) {
      if (data.lunchDishes.length < 1 || data.lunchDishes.length > 6) {
        return { valid: false, error: this.t("err_sub_lunch_dish_count"), errorField: "lunchDishes" };
      }
      for (const id of data.lunchDishes) {
        const it = this.getItem(id);
        if (it && (it.alcoholic || it.category === "Hard Drink")) {
          return { valid: false, error: this.t("err_sub_alcohol_disallowed"), errorField: "lunchDishes" };
        }
      }
    }

    if (data.includeDinner) {
      if (data.dinnerDishes.length < 1 || data.dinnerDishes.length > 6) {
        return { valid: false, error: this.t("err_sub_dinner_dish_count"), errorField: "dinnerDishes" };
      }
      for (const id of data.dinnerDishes) {
        const it = this.getItem(id);
        if (it && (it.alcoholic || it.category === "Hard Drink")) {
          return { valid: false, error: this.t("err_sub_alcohol_disallowed"), errorField: "dinnerDishes" };
        }
      }
    }

    // Start date check (tomorrow to 14 days)
    const today = this.clock.todayIso();
    const minStart = this.clock.addDays(today, 1);
    const maxStart = this.clock.addDays(today, 14);
    if (!data.startDate || data.startDate < minStart || data.startDate > maxStart) {
      return { valid: false, error: this.t("err_sub_start_date_invalid"), errorField: "startDate" };
    }

    let dailyDishSum = 0;
    if (data.includeLunch) {
      dailyDishSum += data.lunchDishes.reduce((sum, id) => sum + (this.getItem(id)?.price || 0), 0);
    }
    if (data.includeDinner) {
      dailyDishSum += data.dinnerDishes.reduce((sum, id) => sum + (this.getItem(id)?.price || 0), 0);
    }

    const daysCount = data.days.length;
    const weeksCount = data.plan === "monthly" ? 4 : 1;
    const discountRate = data.plan === "monthly" ? 0.10 : 0.05;

    const baseTotal = dailyDishSum * daysCount * weeksCount;
    const discount = baseTotal * discountRate;
    const finalTotal = baseTotal - discount;

    return {
      valid: true,
      plan: data.plan,
      weeks: weeksCount,
      daysPerWeek: daysCount,
      dailyDishSum: Math.round(dailyDishSum * 100) / 100,
      baseTotal: Math.round(baseTotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      total: Math.round(finalTotal * 100) / 100
    };
  }

  readSubscriptionForm() {
    const plan = document.querySelector('input[name="sub-plan"]:checked')?.value || "weekly";
    const startDate = document.querySelector("#sub-start-date")?.value || "";
    const days = Array.from(document.querySelectorAll(".sub-day-cb:checked")).map(cb => cb.value);
    const includeLunch = document.querySelector("#sub-include-lunch")?.checked || false;
    const lunchTime = document.querySelector("#sub-lunch-time")?.value || "12:30";
    const lunchDishes = Array.from(document.querySelectorAll(".sub-lunch-dish-cb:checked")).map(cb => cb.value);
    const includeDinner = document.querySelector("#sub-include-dinner")?.checked || false;
    const dinnerTime = document.querySelector("#sub-dinner-time")?.value || "19:00";
    const dinnerDishes = Array.from(document.querySelectorAll(".sub-dinner-dish-cb:checked")).map(cb => cb.value);

    return {
      plan,
      startDate,
      days,
      includeLunch,
      lunchTime,
      lunchDishes,
      includeDinner,
      dinnerTime,
      dinnerDishes
    };
  }

  /* ---------------- RENDERING ---------------- */

  setLanguage(langCode) {
    if (!["en", "hi", "es", "zh", "bn"].includes(langCode)) {
      return { ok: false, reason: `Unsupported language: ${langCode}` };
    }
    fetch(`i18n/${langCode}.json`)
      .then(res => res.json())
      .then(data => {
        this.lang = langCode;
        this.i18n = data;
        localStorage.setItem("aahira_lang", langCode);
        const sel = document.querySelector("#lang-select");
        if (sel) sel.value = langCode;
        document.documentElement.lang = langCode;
        this.renderAll();
      })
      .catch(err => {
        console.error("Language load failed:", err);
      });
    return { ok: true, language: langCode };
  }

  renderAll() {
    this.translateStaticElements();
    this.renderAbout();
    this.renderMenu();
    this.renderCart();
    this.renderSubscriptionSection();
    this.refreshCheckoutDateSlots();
    this.refreshCheckoutTimeSlots();
  }

  translateStaticElements() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (this.i18n[key]) {
        el.textContent = this.i18n[key];
      }
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (this.i18n[key]) {
        el.setAttribute("placeholder", this.i18n[key]);
      }
    });
  }

  renderAbout() {
    const data = this.about[this.lang] || this.about.en;
    if (!data) return;

    const storyEl = document.querySelector("#about-story");
    if (storyEl) storyEl.textContent = data.story;

    const missionEl = document.querySelector("#about-mission");
    if (missionEl) missionEl.textContent = data.mission;

    const audTitleEl = document.querySelector("#about-audience-title");
    if (audTitleEl) audTitleEl.textContent = data.audienceTitle;

    const audEl = document.querySelector("#about-audience");
    if (audEl) {
      audEl.innerHTML = (data.audience || []).map(item => `<li><span class="icon">✦</span> ${item}</li>`).join("");
    }

    const valTitleEl = document.querySelector("#about-values-title");
    if (valTitleEl) valTitleEl.textContent = data.valuesTitle;

    const valEl = document.querySelector("#about-values");
    if (valEl) {
      valEl.innerHTML = (data.values || []).map(item => `<li><span class="icon">✔</span> ${item}</li>`).join("");
    }
  }

  renderMenu() {
    const grid = document.querySelector("#menu-grid");
    if (!grid) return;

    let items = this.menu;

    // Filter by cuisine
    if (this.activeCuisine !== "all") {
      items = items.filter(it => it.cuisine.toLowerCase() === this.activeCuisine.toLowerCase());
    }

    // Filter by category
    if (this.activeCategory !== "all") {
      items = items.filter(it => it.category.toLowerCase() === this.activeCategory.toLowerCase());
    }

    // Filter by diet
    if (this.dietFilters.vegetarian) items = items.filter(it => it.vegetarian);
    if (this.dietFilters.vegan) items = items.filter(it => it.vegan);
    if (this.dietFilters.nutFree) items = items.filter(it => !it.contains_nuts);
    if (this.dietFilters.dairyFree) items = items.filter(it => !it.contains_dairy);
    if (this.dietFilters.glutenFree) items = items.filter(it => !it.contains_gluten);
    if (this.dietFilters.diabeticFriendly) items = items.filter(it => it.diabetic_friendly);
    if (this.dietFilters.highProtein) items = items.filter(it => it.high_protein);

    // Search query filter
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      items = items.filter(it =>
        it.name.toLowerCase().includes(q) ||
        (it.names && it.names[this.lang] && it.names[this.lang].toLowerCase().includes(q)) ||
        it.description.toLowerCase().includes(q) ||
        it.ingredients.toLowerCase().includes(q)
      );
    }

    if (items.length === 0) {
      grid.innerHTML = `<div class="empty-state">${this.t("no_dishes_match")}</div>`;
      return;
    }

    grid.innerHTML = items.map(it => {
      const localizedName = this.getLocalizedName(it);
      const isAlcoholic = it.alcoholic || it.category === "Hard Drink";
      const spiceIcons = "🌶️".repeat(it.spice_level);
      const spiceLabel = it.spice_level === 3 ? this.t("spice_spicy") : it.spice_level === 2 ? this.t("spice_medium") : it.spice_level === 1 ? this.t("spice_mild") : "";

      const badges = [];
      if (it.vegetarian) badges.push(`<span class="badge veg">🌱 Veg</span>`);
      if (it.vegan) badges.push(`<span class="badge vegan">🌿 Vegan</span>`);
      if (!it.contains_nuts) badges.push(`<span class="badge nutfree">🥜 Nut-Free</span>`);
      if (!it.contains_dairy) badges.push(`<span class="badge dairyfree">🥛 Dairy-Free</span>`);
      if (!it.contains_gluten) badges.push(`<span class="badge glutenfree">🌾 Gluten-Free</span>`);
      if (it.diabetic_friendly) badges.push(`<span class="badge diabetic">🩺 Diabetic-Safe</span>`);
      if (it.high_protein) badges.push(`<span class="badge protein">💪 High-Protein</span>`);
      if (isAlcoholic) badges.push(`<span class="badge alcohol">🔞 21+ Only</span>`);

      return `
        <article class="dish-card ${!it.available ? "sold-out" : ""}" data-dish-id="${it.id}">
          <div class="dish-header">
            <div>
              <span class="cuisine-tag">${it.cuisine} · ${it.category}</span>
              <h3 class="dish-name">${localizedName}</h3>
              ${this.lang !== "en" && it.name !== localizedName ? `<span class="dish-subname">(${it.name})</span>` : ""}
            </div>
            <div class="dish-price">$${it.price.toFixed(2)}</div>
          </div>
          <p class="dish-desc">${it.description}</p>
          <p class="dish-ingredients"><small><strong>${this.t("item_ingredients_label", { ingredients: it.ingredients })}</strong></small></p>
          <div class="dish-meta">
            <span class="calories">${it.calories} ${this.t("item_calories")}</span>
            <span class="protein">${it.protein_g} ${this.t("item_protein")}</span>
            ${spiceIcons ? `<span class="spice">${spiceIcons} ${spiceLabel}</span>` : ""}
          </div>
          <div class="dish-badges">${badges.join("")}</div>
          ${it.other_allergens && it.other_allergens.length ? `<div class="allergens"><small>${this.t("item_other_allergens", { allergens: it.other_allergens.join(", ") })}</small></div>` : ""}
          <div class="dish-footer">
            ${it.available
              ? `<button class="btn btn-add-cart" data-action="add-to-cart" data-id="${it.id}">+ ${this.t("btn_add_to_cart")}</button>`
              : `<span class="badge soldout-label">${this.t("item_unavailable")}</span>`
            }
          </div>
        </article>
      `;
    }).join("");
  }

  renderCart() {
    const cartContainer = document.querySelector("#cart-lines");
    const subtotalEl = document.querySelector("#cart-subtotal");
    const deliveryFeeEl = document.querySelector("#cart-delivery-fee");
    const totalEl = document.querySelector("#cart-total");
    const alcWarningEl = document.querySelector("#cart-alcohol-warning");
    const alcCheckboxWrap = document.querySelector("#co-alcohol-wrap");

    const cartData = this.getCart();

    if (cartData.lines.length === 0) {
      if (cartContainer) cartContainer.innerHTML = `<p class="empty-state">${this.t("cart_empty")}</p>`;
      if (subtotalEl) subtotalEl.textContent = "$0.00";
      if (deliveryFeeEl) deliveryFeeEl.textContent = "$0.00";
      if (totalEl) totalEl.textContent = "$0.00";
      if (alcWarningEl) alcWarningEl.classList.add("hidden");
      if (alcCheckboxWrap) alcCheckboxWrap.classList.add("hidden");
      return;
    }

    if (cartContainer) {
      cartContainer.innerHTML = `
        <table class="cart-table">
          <thead>
            <tr>
              <th>${this.t("cart_col_item")}</th>
              <th>${this.t("cart_col_price")}</th>
              <th>${this.t("cart_col_qty")}</th>
              <th>${this.t("cart_col_total")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${cartData.lines.map(l => `
              <tr>
                <td>
                  <strong>${l.name}</strong>
                  ${l.alcoholic ? '<span class="badge alcohol">21+</span>' : ""}
                </td>
                <td>$${l.price.toFixed(2)}</td>
                <td>
                  <div class="qty-control">
                    <button class="btn-qty" data-cart-action="dec" data-id="${l.id}">-</button>
                    <span class="qty-val">${l.quantity}</span>
                    <button class="btn-qty" data-cart-action="inc" data-id="${l.id}">+</button>
                  </div>
                </td>
                <td><strong>$${l.lineTotal.toFixed(2)}</strong></td>
                <td>
                  <button class="btn-remove" data-cart-action="remove" data-id="${l.id}">✕</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }

    if (subtotalEl) subtotalEl.textContent = `$${cartData.subtotal.toFixed(2)}`;
    if (deliveryFeeEl) {
      if (this.fulfillment === "delivery") {
        if (cartData.deliveryFee === 0) {
          deliveryFeeEl.innerHTML = `<span class="free-tag">$0.00 (${this.t("cart_delivery_free_msg")})</span>`;
        } else {
          deliveryFeeEl.textContent = `$${cartData.deliveryFee.toFixed(2)}`;
        }
      } else {
        deliveryFeeEl.textContent = "$0.00 (Pickup)";
      }
    }
    if (totalEl) totalEl.textContent = `$${cartData.total.toFixed(2)}`;

    // Alcohol handling
    if (cartData.hasAlcohol) {
      if (alcWarningEl) alcWarningEl.classList.remove("hidden");
      if (alcCheckboxWrap) alcCheckboxWrap.classList.remove("hidden");
    } else {
      if (alcWarningEl) alcWarningEl.classList.add("hidden");
      if (alcCheckboxWrap) alcCheckboxWrap.classList.add("hidden");
    }
  }

  updateFulfillmentView() {
    const deliveryAddressFields = document.querySelector("#co-delivery-address-fields");
    if (this.fulfillment === "delivery") {
      if (deliveryAddressFields) deliveryAddressFields.classList.remove("hidden");
    } else {
      if (deliveryAddressFields) deliveryAddressFields.classList.add("hidden");
    }
    this.renderCart();
  }

  refreshCheckoutDateSlots() {
    const dateSel = document.querySelector("#co-date");
    if (!dateSel) return;
    const dates = this.orderDates();
    const currentVal = dateSel.value;
    dateSel.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join("");
    if (dates.includes(currentVal)) {
      dateSel.value = currentVal;
    } else if (dates.length > 0) {
      dateSel.value = dates[0];
    }
  }

  refreshCheckoutTimeSlots() {
    const dateSel = document.querySelector("#co-date");
    const timeSel = document.querySelector("#co-time");
    if (!dateSel || !timeSel) return;
    const slots = this.slotsFor(dateSel.value);
    const currentVal = timeSel.value;
    timeSel.innerHTML = slots.map(s => `<option value="${s}">${s}</option>`).join("");
    if (slots.includes(currentVal)) {
      timeSel.value = currentVal;
    } else if (slots.length > 0) {
      timeSel.value = slots[0];
    }
  }

  renderSubscriptionSection() {
    const lunchDishesContainer = document.querySelector("#sub-lunch-dishes-list");
    const dinnerDishesContainer = document.querySelector("#sub-dinner-dishes-list");
    const startDateInput = document.querySelector("#sub-start-date");

    const nonAlcoholicDishes = this.menu.filter(it => !it.alcoholic && it.category !== "Hard Drink");

    if (lunchDishesContainer) {
      lunchDishesContainer.innerHTML = nonAlcoholicDishes.map(it => `
        <label class="sub-dish-option">
          <input type="checkbox" class="sub-lunch-dish-cb" value="${it.id}">
          <span>${this.getLocalizedName(it)} <small>($${it.price.toFixed(2)})</small></span>
        </label>
      `).join("");
    }

    if (dinnerDishesContainer) {
      dinnerDishesContainer.innerHTML = nonAlcoholicDishes.map(it => `
        <label class="sub-dish-option">
          <input type="checkbox" class="sub-dinner-dish-cb" value="${it.id}">
          <span>${this.getLocalizedName(it)} <small>($${it.price.toFixed(2)})</small></span>
        </label>
      `).join("");
    }

    if (startDateInput && !startDateInput.value) {
      const tomorrow = this.clock.addDays(this.clock.todayIso(), 1);
      startDateInput.value = tomorrow;
      startDateInput.min = tomorrow;
      startDateInput.max = this.clock.addDays(this.clock.todayIso(), 14);
    }

    this.updateSubscriptionEstimate();
  }

  updateSubscriptionEstimate() {
    const summary = this.calculateSubscriptionSummary();
    const estBase = document.querySelector("#sub-est-base");
    const estDiscount = document.querySelector("#sub-est-discount");
    const estTotal = document.querySelector("#sub-est-total");

    if (summary.valid) {
      if (estBase) estBase.textContent = `$${summary.baseTotal.toFixed(2)}`;
      if (estDiscount) estDiscount.textContent = `-$${summary.discount.toFixed(2)}`;
      if (estTotal) estTotal.textContent = `$${summary.total.toFixed(2)}`;
    } else {
      if (estBase) estBase.textContent = "$0.00";
      if (estDiscount) estDiscount.textContent = "$0.00";
      if (estTotal) estTotal.textContent = "$0.00";
    }
  }

  renderOrderConfirmation(res, order) {
    const confBox = document.querySelector("#co-confirmation");
    if (!confBox) return;
    confBox.classList.remove("hidden");
    confBox.innerHTML = `
      <div class="confirmation-card success">
        <h3>🎉 ${this.t("co_success_title")}</h3>
        <p><strong>${this.t("co_order_id_label")}</strong> <span class="highlight-id">${res.id}</span></p>
        <p><strong>${this.t("status_result_total")}</strong> $${res.total.toFixed(2)}</p>
        <p><strong>${this.t("co_type_label")}:</strong> ${order.fulfillment === "delivery" ? order.address : "Pickup at 3017 Warren Way"}</p>
        <p><strong>${this.t("co_date")}:</strong> ${order.requestedDate} @ ${order.requestedTime}</p>
        ${res.savedTo === "demo-local-storage" ? `<p class="info-note">💡 ${this.t("co_demo_note")}</p>` : ""}
        ${res.emailSent ? `<p class="info-note">✉ ${this.t("co_email_sent_note")}</p>` : ""}
      </div>
    `;
    confBox.scrollIntoView({ behavior: "smooth" });
  }

  renderSubscriptionConfirmation(res, sub) {
    const confBox = document.querySelector("#sub-confirmation");
    if (!confBox) return;
    confBox.classList.remove("hidden");
    confBox.innerHTML = `
      <div class="confirmation-card success">
        <h3>🎉 ${this.t("sub_success_title")}</h3>
        <p><strong>${this.t("sub_id_label")}</strong> <span class="highlight-id">${res.id}</span></p>
        <p><strong>Plan:</strong> ${sub.planName}</p>
        <p><strong>Start Date:</strong> ${sub.startDate}</p>
        <p><strong>Days:</strong> ${sub.days.join(", ").toUpperCase()}</p>
        <p><strong>${this.t("sub_est_total")}:</strong> $${res.total.toFixed(2)}</p>
        <p class="info-note">💡 Your tiffin subscription is active in demo mode!</p>
      </div>
    `;
    confBox.scrollIntoView({ behavior: "smooth" });
  }
}

/**
 * Global application bootstrap and singleton.
 */
export class App {
  static page = null;

  static async start() {
    try {
      const [kitchenConfig, aboutData, menuItems, i18nEn] = await Promise.all([
        fetch("data/kitchen.json").then(r => r.json()),
        fetch("data/about.json").then(r => r.json()),
        fetch("data/menu.json").then(r => r.json()),
        fetch("i18n/en.json").then(r => r.json())
      ]);

      const savedLang = localStorage.getItem("aahira_lang") || "en";
      let initialI18n = i18nEn;
      if (savedLang !== "en") {
        try {
          initialI18n = await fetch(`i18n/${savedLang}.json`).then(r => r.json());
        } catch {
          initialI18n = i18nEn;
        }
      }

      App.page = new KitchenPage(kitchenConfig, aboutData, menuItems, initialI18n, savedLang);
      App.wireEvents();
      App.page.renderAll();

      console.log("Aahira Home Kitchen initialized successfully.");
    } catch (err) {
      console.error("Failed to start Aahira Kitchen App:", err);
    }
  }

  static wireEvents() {
    // Language switcher
    const langSelect = document.querySelector("#lang-select");
    if (langSelect) {
      langSelect.value = App.page.lang;
      langSelect.addEventListener("change", e => {
        App.page.setLanguage(e.target.value);
      });
    }

    // Cuisine tabs
    document.querySelectorAll(".cuisine-tab").forEach(tab => {
      tab.addEventListener("click", e => {
        document.querySelectorAll(".cuisine-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        App.page.activeCuisine = tab.getAttribute("data-cuisine");
        App.page.renderMenu();
      });
    });

    // Category chips
    document.querySelectorAll(".category-chip").forEach(chip => {
      chip.addEventListener("click", e => {
        document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        App.page.activeCategory = chip.getAttribute("data-category");
        App.page.renderMenu();
      });
    });

    // Search input
    const searchInput = document.querySelector("#menu-search");
    if (searchInput) {
      searchInput.addEventListener("input", e => {
        App.page.searchQuery = e.target.value.trim();
        App.page.renderMenu();
      });
    }

    // Diet filter checkboxes
    const dietMap = {
      "filter-veg": "vegetarian",
      "filter-vegan": "vegan",
      "filter-nut-free": "nutFree",
      "filter-dairy-free": "dairyFree",
      "filter-gluten-free": "glutenFree",
      "filter-diabetic": "diabeticFriendly",
      "filter-high-protein": "highProtein"
    };

    for (const [id, prop] of Object.entries(dietMap)) {
      const cb = document.querySelector(`#${id}`);
      if (cb) {
        cb.addEventListener("change", e => {
          App.page.dietFilters[prop] = e.target.checked;
          App.page.renderMenu();
        });
      }
    }

    // Add to cart delegation from menu
    const menuGrid = document.querySelector("#menu-grid");
    if (menuGrid) {
      menuGrid.addEventListener("click", e => {
        const btn = e.target.closest('button[data-action="add-to-cart"]');
        if (btn) {
          const id = btn.getAttribute("data-id");
          App.page.addToCart(id, 1);
        }
      });
    }

    // Cart actions (inc, dec, remove)
    const cartLines = document.querySelector("#cart-lines");
    if (cartLines) {
      cartLines.addEventListener("click", e => {
        const btn = e.target.closest("button[data-cart-action]");
        if (!btn) return;
        const action = btn.getAttribute("data-cart-action");
        const id = btn.getAttribute("data-id");
        const currentQty = App.page.cart.get(id) || 0;

        if (action === "inc") {
          App.page.addToCart(id, 1);
        } else if (action === "dec") {
          if (currentQty <= 1) {
            App.page.cart.delete(id);
            App.page.cartVersion++;
            App.page.renderCart();
          } else {
            App.page.addToCart(id, -1);
          }
        } else if (action === "remove") {
          App.page.cart.delete(id);
          App.page.cartVersion++;
          App.page.renderCart();
        }
      });
    }

    // Clear cart button
    const clearCartBtn = document.querySelector("#btn-clear-cart");
    if (clearCartBtn) {
      clearCartBtn.addEventListener("click", () => App.page.clearCart());
    }

    // Fulfillment radio buttons
    document.querySelectorAll('input[name="co-fulfillment"]').forEach(rad => {
      rad.addEventListener("change", e => {
        App.page.fulfillment = e.target.value;
        App.page.updateFulfillmentView();
      });
    });

    // Date change updates slots
    const dateInput = document.querySelector("#co-date");
    if (dateInput) {
      dateInput.addEventListener("change", () => App.page.refreshCheckoutTimeSlots());
    }

    // Checkout form submit
    const checkoutForm = document.querySelector("#checkout-form");
    if (checkoutForm) {
      checkoutForm.addEventListener("submit", async e => {
        e.preventDefault();
        const errEl = document.querySelector("#co-error");
        if (errEl) errEl.textContent = "";

        const formData = {
          firstName: document.querySelector("#co-first-name")?.value || "",
          lastName: document.querySelector("#co-last-name")?.value || "",
          phone: document.querySelector("#co-phone")?.value || "",
          email: document.querySelector("#co-email")?.value || "",
          fulfillment: App.page.fulfillment,
          street: document.querySelector("#co-street")?.value || "",
          city: document.querySelector("#co-city")?.value || "",
          state: document.querySelector("#co-state")?.value || "IN",
          zip: document.querySelector("#co-zip")?.value || "",
          date: document.querySelector("#co-date")?.value || "",
          time: document.querySelector("#co-time")?.value || "",
          payment: document.querySelector('input[name="co-payment"]:checked')?.value || "Cash",
          alcoholConfirmed: document.querySelector("#co-alcohol-confirm")?.checked || false,
          notes: document.querySelector("#co-notes")?.value || "",
          expectedVersion: App.page.cartVersion
        };

        const check = App.page.checkOrder(formData);
        if (!check.ok) {
          if (errEl) errEl.textContent = check.reason;
          return;
        }

        const submitBtn = document.querySelector("#co-submit-btn");
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = App.page.t("co_btn_submitting");
        }

        try {
          const res = await App.page.submitOrder(formData);
          if (!res.ok && errEl) {
            errEl.textContent = res.reason;
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = App.page.t("co_btn_place_order");
          }
        }
      });
    }

    // Subscription form change updates
    const subForm = document.querySelector("#sub-form");
    if (subForm) {
      subForm.addEventListener("change", () => App.page.updateSubscriptionEstimate());
      subForm.addEventListener("submit", async e => {
        e.preventDefault();
        const errEl = document.querySelector("#sub-error");
        if (errEl) errEl.textContent = "";

        const subData = {
          ...App.page.readSubscriptionForm(),
          firstName: document.querySelector("#sub-first-name")?.value || "",
          lastName: document.querySelector("#sub-last-name")?.value || "",
          phone: document.querySelector("#sub-phone")?.value || "",
          email: document.querySelector("#sub-email")?.value || "",
          fulfillment: document.querySelector('input[name="sub-fulfillment"]:checked')?.value || "delivery",
          street: document.querySelector("#sub-street")?.value || "",
          city: document.querySelector("#sub-city")?.value || "",
          state: "IN",
          zip: document.querySelector("#sub-zip")?.value || "",
          payment: document.querySelector('input[name="sub-payment"]:checked')?.value || "Zelle"
        };

        const res = await App.page.submitSubscription(subData);
        if (!res.ok && errEl) {
          errEl.textContent = res.reason;
        }
      });
    }

    // Status lookup form
    const statusForm = document.querySelector("#status-form");
    if (statusForm) {
      statusForm.addEventListener("submit", async e => {
        e.preventDefault();
        const input = document.querySelector("#status-input");
        const resultContainer = document.querySelector("#status-result");
        if (!input || !resultContainer) return;

        const id = input.value.trim();
        if (!id) return;

        resultContainer.innerHTML = "<p>Checking order status...</p>";
        const res = await App.page.checkOrderStatus(id);

        if (res.ok) {
          resultContainer.innerHTML = `
            <div class="status-card">
              <h4>${App.page.t("status_result_heading")}</h4>
              <p><strong>${App.page.t("status_result_id")}</strong> ${res.id}</p>
              <p><strong>${App.page.t("status_result_kind")}</strong> ${res.kind.toUpperCase()}</p>
              <p><strong>${App.page.t("status_result_status")}</strong> <span class="badge status-${res.status.toLowerCase().replace(/\s+/g, "-")}">${res.status}</span></p>
              <p><strong>${App.page.t("status_result_fulfilment")}</strong> ${res.fulfilment}</p>
              <p><strong>${App.page.t("status_result_time")}</strong> ${res.requestedTime}</p>
              <p><strong>${App.page.t("status_result_total")}</strong> $${res.total.toFixed(2)}</p>
            </div>
          `;
        } else {
          resultContainer.innerHTML = `<div class="error-msg">${res.reason}</div>`;
        }
      });
    }
  }
}

// Auto-start on load
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => App.start());
}
