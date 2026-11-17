# Operations Runbook

## Everyday Owner Tasks

### 1. Update Menu or Prices
1. Open `data/menu.xlsx` in Microsoft Excel.
2. Update prices, descriptions, or add new dishes on the `Menu` tab.
3. Validate locally:
   ```bash
   npm run build:menu
   ```
4. Commit and push changes to GitHub. GitHub Actions will rebuild and deploy the site automatically.

### 2. Temporarily Hide a Dish
1. In `data/menu.xlsx`, locate the dish row.
2. Set `available` to `No`.
3. Run `npm run build:menu` and push.

### 3. Update Kitchen Hours, Address, or Fees
1. Edit `data/kitchen.json`.
2. Update corresponding settings in `CONFIG` in your Google Apps Script project.
3. Commit and push.

### 4. Updating Agent Behavior
1. Edit `aahira_kitchen.hocon` (and `agent-manifest.json` if tool signatures or sample queries change).
2. Recompile network JSON and discovery files:
   ```bash
   npm run build:network
   ```
3. Commit and push.
