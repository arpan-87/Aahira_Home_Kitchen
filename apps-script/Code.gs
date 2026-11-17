/**
 * Aahira Home Kitchen - Google Apps Script Order & Subscription Backend
 * Paste into Google Apps Script connected to Google Sheet "Aahira Orders".
 */

const CONFIG = {
  kitchenName: "Aahira Home Kitchen",
  ownerEmail: "aahirahomekitchen@gmail.com",
  timezone: "America/Indiana/Indianapolis",
  menuUrl: "", // Live menu URL (e.g. https://<user>.github.io/<repo>/data/menu.json)
  leadTimeHours: 2,
  hours: { open: "10:00", close: "22:00" },
  deliveryFee: 4.99,
  deliveryFreeOver: 50.00,
  sendStatusEmails: true,
  phone: "+1 (570) 780-7680",
  zelleRecipient: "aahirahomekitchen@gmail.com",
  chequePayableTo: "Aahira Home Kitchen"
};

/**
 * Setup function: run once from Apps Script editor.
 * Creates Orders and Subscriptions sheets with data validation dropdowns, formats and triggers.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(CONFIG.timezone);

  // 1. Orders Sheet
  let ordersSheet = ss.getSheetByName("Orders");
  if (!ordersSheet) {
    ordersSheet = ss.insertSheet("Orders");
  }
  const orderHeaders = [
    "Order ID", "Order Date & Time", "First Name", "Last Name",
    "Phone", "Email", "Order Type", "Delivery Address",
    "Requested Time", "Order Details", "Total Amount", "Payment Method",
    "Status", "Status Updated", "Notes", "Items JSON"
  ];
  ordersSheet.getRange(1, 1, 1, orderHeaders.length).setValues([orderHeaders])
    .setFontWeight("bold")
    .setBackground("#f2ede9");

  // Status Dropdown validation for Orders
  const orderStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      "Received", "Preparing", "Ready for Pickup", "Out for Delivery", "Completed", "Cancelled"
    ], true)
    .build();
  ordersSheet.getRange("M2:M1000").setDataValidation(orderStatusRule);

  // Hide Items JSON column
  ordersSheet.hideColumns(16);

  // 2. Subscriptions Sheet
  let subSheet = ss.getSheetByName("Subscriptions");
  if (!subSheet) {
    subSheet = ss.insertSheet("Subscriptions");
  }
  const subHeaders = [
    "Subscription ID", "Created At", "First Name", "Last Name",
    "Phone", "Email", "Plan", "Start Date", "Delivery Days",
    "Lunch Details", "Dinner Details", "Fulfillment", "Address",
    "Estimated Total", "Payment Method", "Status", "Status Updated", "Data JSON"
  ];
  subSheet.getRange(1, 1, 1, subHeaders.length).setValues([subHeaders])
    .setFontWeight("bold")
    .setBackground("#f2ede9");

  // Status Dropdown validation for Subscriptions
  const subStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Active", "Paused", "Cancelled", "Completed"], true)
    .build();
  subSheet.getRange("P2:P1000").setDataValidation(subStatusRule);

  // Hide JSON column
  subSheet.hideColumns(18);

  // 3. Installable Trigger for onStatusEdit
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === "onStatusEdit") {
      ScriptApp.deleteTrigger(t);
    }
  }
  ScriptApp.newTrigger("onStatusEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  Logger.log("Setup completed successfully. Time zone, headers, dropdowns, and triggers configured.");
}

/**
 * Handles incoming web POST requests.
 * Uses text/plain to avoid pre-flight CORS complications.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      reason: "Server is busy processing other requests. Please retry in a moment."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    const rawData = e.postData ? e.postData.contents : "{}";
    const data = JSON.parse(rawData);

    if (data.kind === "subscription") {
      return ContentService.createTextOutput(JSON.stringify(saveSubscription_(data)))
        .setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(JSON.stringify(saveOrder_(data)))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      reason: error.message || "Failed to process request."
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles incoming web GET requests.
 * Answers status lookups without exposing customer personal data.
 */
function doGet(e) {
  const action = e.parameter.action;
  const id = (e.parameter.id || "").trim().toUpperCase();

  if (action === "status" && id) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Check Orders
    const ordersSheet = ss.getSheetByName("Orders");
    if (ordersSheet && ordersSheet.getLastRow() > 1) {
      const rows = ordersSheet.getRange(2, 1, ordersSheet.getLastRow() - 1, 14).getValues();
      for (const r of rows) {
        if (String(r[0]).toUpperCase() === id) {
          return ContentService.createTextOutput(JSON.stringify({
            ok: true,
            id: r[0],
            kind: "order",
            status: r[12] || "Received",
            fulfilment: r[6],
            requestedTime: r[8],
            total: r[10]
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // Check Subscriptions
    const subSheet = ss.getSheetByName("Subscriptions");
    if (subSheet && subSheet.getLastRow() > 1) {
      const rows = subSheet.getRange(2, 1, subSheet.getLastRow() - 1, 17).getValues();
      for (const r of rows) {
        if (String(r[0]).toUpperCase() === id) {
          return ContentService.createTextOutput(JSON.stringify({
            ok: true,
            id: r[0],
            kind: "subscription",
            status: r[15] || "Active",
            fulfilment: r[11],
            requestedTime: r[7],
            total: r[13]
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      ok: false,
      reason: "Order or subscription not found."
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({
    ok: true,
    service: "Aahira Home Kitchen orders"
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Validates, prices, appends, and emails an order.
 */
function saveOrder_(data) {
  checkCustomer_(data);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Orders");
  const now = new Date();
  const dateStr = Utilities.formatDate(now, CONFIG.timezone, "yyyyMMdd");
  const timeStamp = Utilities.formatDate(now, CONFIG.timezone, "yyyy-MM-dd HH:mm:ss");

  // Counter in script properties per day
  const props = PropertiesService.getScriptProperties();
  const counterKey = "counter_" + dateStr;
  const currentCount = parseInt(props.getProperty(counterKey) || "0", 10) + 1;
  props.setProperty(counterKey, String(currentCount));

  const orderId = "AHK-" + dateStr + "-" + pad4_(currentCount);

  // Verify and recalculate prices
  let subtotal = 0;
  const details = [];
  const menuMap = fetchMenuMap_();

  for (const line of (data.items || [])) {
    let unitPrice = line.price;
    if (menuMap && menuMap[line.id]) {
      unitPrice = menuMap[line.id].price;
    }
    const qty = parseInt(line.quantity, 10) || 1;
    subtotal += unitPrice * qty;
    details.push(qty + "x " + (line.name || line.englishName) + " ($" + (unitPrice * qty).toFixed(2) + ")");
  }

  let deliveryFee = 0;
  if (data.fulfillment === "delivery" && subtotal > 0 && subtotal < CONFIG.deliveryFreeOver) {
    deliveryFee = CONFIG.deliveryFee;
  }
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

  sheet.appendRow([
    orderId,
    timeStamp,
    safe_(data.firstName),
    safe_(data.lastName),
    safe_(data.phone),
    safe_(data.email),
    safe_(data.fulfillment),
    safe_(data.address),
    safe_(data.requestedDate + " " + data.requestedTime),
    safe_(details.join(", ")),
    total,
    safe_(data.paymentMethod),
    "Received",
    timeStamp,
    safe_(data.notes),
    JSON.stringify(data.items || [])
  ]);

  let emailSent = false;
  if (data.email && data.email.indexOf("@") !== -1) {
    try {
      sendOrderCustomerEmail_(data, orderId, details, total);
      emailSent = true;
    } catch (e) {
      Logger.log("Customer email error: " + e.message);
    }
  }

  try {
    sendOrderOwnerNotification_(data, orderId, details, total);
  } catch (e) {
    Logger.log("Owner notification error: " + e.message);
  }

  return { ok: true, id: orderId, total: total, emailSent: emailSent };
}

/**
 * Validates, records and emails a meal subscription.
 */
function saveSubscription_(data) {
  checkCustomer_(data);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Subscriptions");
  const now = new Date();
  const dateStr = Utilities.formatDate(now, CONFIG.timezone, "yyyyMMdd");
  const timeStamp = Utilities.formatDate(now, CONFIG.timezone, "yyyy-MM-dd HH:mm:ss");

  const props = PropertiesService.getScriptProperties();
  const counterKey = "sub_counter_" + dateStr;
  const currentCount = parseInt(props.getProperty(counterKey) || "0", 10) + 1;
  props.setProperty(counterKey, String(currentCount));

  const subId = "AHS-" + dateStr + "-" + pad4_(currentCount);

  sheet.appendRow([
    subId,
    timeStamp,
    safe_(data.firstName),
    safe_(data.lastName),
    safe_(data.phone),
    safe_(data.email),
    safe_(data.planName),
    safe_(data.startDate),
    safe_((data.days || []).join(", ").toUpperCase()),
    safe_(data.includeLunch ? "Time: " + data.lunchTime + "; Dishes: " + (data.lunchDishes || []).join(", ") : "None"),
    safe_(data.includeDinner ? "Time: " + data.dinnerTime + "; Dishes: " + (data.dinnerDishes || []).join(", ") : "None"),
    safe_(data.fulfillment),
    safe_(data.address),
    data.estimatedTotal,
    safe_(data.paymentMethod),
    "Active",
    timeStamp,
    JSON.stringify(data)
  ]);

  let emailSent = false;
  if (data.email && data.email.indexOf("@") !== -1) {
    try {
      sendSubCustomerEmail_(data, subId);
      emailSent = true;
    } catch (e) {
      Logger.log("Sub email error: " + e.message);
    }
  }

  return { ok: true, id: subId, total: data.estimatedTotal, emailSent: emailSent };
}

/**
 * Trigger handler for status changes in Orders and Subscriptions sheets.
 */
function onStatusEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const col = e.range.getColumn();
  const row = e.range.getRow();

  if (row <= 1) return; // Ignore header

  const now = new Date();
  const timeStamp = Utilities.formatDate(now, CONFIG.timezone, "yyyy-MM-dd HH:mm:ss");

  // Orders Sheet: Status is column M (13)
  if (sheetName === "Orders" && col === 13) {
    const newStatus = e.value;
    sheet.getRange(row, 14).setValue(timeStamp); // Status Updated (col N)

    if (CONFIG.sendStatusEmails) {
      const email = sheet.getRange(row, 6).getValue();
      const orderId = sheet.getRange(row, 1).getValue();
      const customerName = sheet.getRange(row, 3).getValue();
      if (email && email.indexOf("@") !== -1) {
        try {
          MailApp.sendEmail({
            to: email,
            subject: "Order Status Update: " + orderId + " [" + newStatus + "]",
            htmlBody: "<p>Dear " + esc_(customerName) + ",</p>" +
                      "<p>Your order <strong>" + esc_(orderId) + "</strong> status has been updated to: <strong>" + esc_(newStatus) + "</strong>.</p>" +
                      "<p>Thank you for choosing " + esc_(CONFIG.kitchenName) + "!</p>"
          });
        } catch (err) {
          Logger.log("Status email error: " + err.message);
        }
      }
    }
  }

  // Subscriptions Sheet: Status is column P (16)
  if (sheetName === "Subscriptions" && col === 16) {
    sheet.getRange(row, 17).setValue(timeStamp);
  }
}

/* ---------------- EMAIL HELPERS ---------------- */

function sendOrderCustomerEmail_(data, orderId, details, total) {
  const subject = "Order Confirmation - " + CONFIG.kitchenName + " [" + orderId + "]";
  const body = "<div style='font-family:sans-serif;color:#333;line-height:1.6;'>" +
    "<h2 style='color:#b84214;'>Thank You for Your Order!</h2>" +
    "<p>Dear " + esc_(data.firstName) + ",</p>" +
    "<p>Your order has been received and is being prepared with pure ingredients and homemade care.</p>" +
    "<p><strong>Order ID:</strong> " + esc_(orderId) + "<br>" +
    "<strong>Ready/Delivery Time:</strong> " + esc_(data.requestedDate + " @ " + data.requestedTime) + "<br>" +
    "<strong>Fulfillment:</strong> " + esc_(data.address) + "</p>" +
    "<h3>Order Items</h3>" +
    "<ul>" + details.map(d => "<li>" + esc_(d) + "</li>").join("") + "</ul>" +
    "<p><strong>Total Amount:</strong> $" + total.toFixed(2) + "<br>" +
    "<strong>Payment:</strong> " + esc_(data.paymentMethod) + "</p>" +
    "<p style='color:#666;font-size:0.9em;'>Questions? Call us at " + esc_(CONFIG.phone) + ".</p>" +
    "</div>";

  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    htmlBody: body
  });
}

function sendOrderOwnerNotification_(data, orderId, details, total) {
  if (!CONFIG.ownerEmail) return;
  const subject = "New Order Received - " + orderId + " ($" + total.toFixed(2) + ")";
  const body = "<p>New order received:</p>" +
    "<p><strong>ID:</strong> " + esc_(orderId) + "<br>" +
    "<strong>Customer:</strong> " + esc_(data.firstName + " " + data.lastName) + " (" + esc_(data.phone) + ")<br>" +
    "<strong>Fulfillment:</strong> " + esc_(data.fulfillment) + " - " + esc_(data.address) + "<br>" +
    "<strong>Requested Time:</strong> " + esc_(data.requestedDate + " " + data.requestedTime) + "<br>" +
    "<strong>Total:</strong> $" + total.toFixed(2) + " via " + esc_(data.paymentMethod) + "</p>" +
    "<ul>" + details.map(d => "<li>" + esc_(d) + "</li>").join("") + "</ul>";

  MailApp.sendEmail({
    to: CONFIG.ownerEmail,
    subject: subject,
    htmlBody: body
  });
}

function sendSubCustomerEmail_(data, subId) {
  const subject = "Subscription Confirmation - " + CONFIG.kitchenName + " [" + subId + "]";
  const body = "<div style='font-family:sans-serif;color:#333;line-height:1.6;'>" +
    "<h2 style='color:#b84214;'>Meal Subscription Registered!</h2>" +
    "<p>Dear " + esc_(data.firstName) + ",</p>" +
    "<p>Your meal tiffin subscription is confirmed.</p>" +
    "<p><strong>Subscription ID:</strong> " + esc_(subId) + "<br>" +
    "<strong>Plan:</strong> " + esc_(data.planName) + "<br>" +
    "<strong>Start Date:</strong> " + esc_(data.startDate) + "<br>" +
    "<strong>Days:</strong> " + esc_((data.days || []).join(", ").toUpperCase()) + "</p>" +
    "<p><strong>Estimated Plan Total:</strong> $" + Number(data.estimatedTotal).toFixed(2) + "</p>" +
    "</div>";

  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    htmlBody: body
  });
}

/* ---------------- UTILITY FUNCTIONS ---------------- */

function checkCustomer_(d) {
  if (!d.firstName || !d.lastName) {
    throw new Error("First and last name are required.");
  }
  const phone = (d.phone || "").replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 15) {
    throw new Error("Valid phone number (10-15 digits) is required.");
  }
}

function fetchMenuMap_() {
  if (!CONFIG.menuUrl) return null;
  try {
    const res = UrlFetchApp.fetch(CONFIG.menuUrl);
    const list = JSON.parse(res.getContentText());
    const map = {};
    for (const item of list) {
      map[item.id] = item;
    }
    return map;
  } catch (e) {
    Logger.log("Menu fetch error: " + e.message);
    return null;
  }
}

function safe_(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  // Prevent spreadsheet formula injection (=, +, -, @)
  if (/^[=+\-@]/.test(s)) {
    return "'" + s;
  }
  return s;
}

function esc_(val) {
  if (val === null || val === undefined) return "";
  return String(val)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pad4_(n) {
  return ("0000" + n).slice(-4);
}
