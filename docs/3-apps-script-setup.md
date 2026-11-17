# Google Apps Script Setup Guide

Follow these steps to connect your live Google Sheet for order management:

1. Create a blank Google Sheet named **Aahira Orders** in your Google account.
2. Go to **Extensions -> Apps Script**.
3. Replace the template code with the full contents of `apps-script/Code.gs`.
4. Review `CONFIG` at the top of the script (set your owner email, phone, etc.).
5. In the function dropdown, select `setup` and click **Run**.
   - Review permissions -> Choose your Google account -> Click **Advanced** -> Click **Go to Aahira Orders (unsafe)** -> Click **Allow**.
   - The script will initialize the `Orders` and `Subscriptions` tabs with headers, formatting, dropdown validations, and an edit trigger.
6. Click **Deploy -> New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the Web App URL (ending in `/exec`).
7. Paste this URL into `orderEndpoint` in `data/kitchen.json`.
8. When live, also update `CONFIG.menuUrl` with your published `data/menu.json` URL to enforce server-side price verification.
