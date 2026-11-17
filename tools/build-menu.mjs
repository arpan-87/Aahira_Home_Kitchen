import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);

const EXCEL_PATH = path.resolve("data/menu.xlsx");
const OUTPUT_PATH = path.resolve("data/menu.json");

const REQUIRED_COLUMNS = [
  "id", "cuisine", "category", "name",
  "description", "ingredients", "price",
  "vegetarian", "vegan", "contains_nuts", "contains_dairy",
  "contains_gluten", "diabetic_friendly", "high_protein",
  "available", "calories", "protein_g", "spice_level"
];

const ALLOWED_CATEGORIES = new Set([
  "Appetizer", "Lunch", "Dinner", "Soft Drink", "Hard Drink"
]);

const ID_REGEX = /^[A-Za-z0-9_-]+$/;

function parseYesNo(val, colName, rowNum, errors) {
  if (val === undefined || val === null || String(val).trim() === "") {
    errors.push(`Row ${rowNum}: Column '${colName}' is required (Yes/No).`);
    return false;
  }
  const clean = String(val).trim().toLowerCase();
  if (clean === "yes" || clean === "true" || clean === "1") return true;
  if (clean === "no" || clean === "false" || clean === "0") return false;
  errors.push(`Row ${rowNum}: Column '${colName}' must be 'Yes' or 'No' (found: '${val}').`);
  return false;
}

function parseNumber(val, colName, min, max, rowNum, errors) {
  if (val === undefined || val === null || String(val).trim() === "") {
    errors.push(`Row ${rowNum}: Column '${colName}' is required (number between ${min} and ${max}).`);
    return 0;
  }
  const num = Number(val);
  if (isNaN(num)) {
    errors.push(`Row ${rowNum}: Column '${colName}' must be a valid number (found: '${val}').`);
    return 0;
  }
  if (num < min || num > max) {
    errors.push(`Row ${rowNum}: Column '${colName}' must be between ${min} and ${max} (found: ${num}).`);
    return 0;
  }
  return num;
}

function parseAllergens(val) {
  if (!val) return [];
  return String(val)
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function buildMenu() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`Error: File not found at ${EXCEL_PATH}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(EXCEL_PATH);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  const sheetName = "Menu";
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    console.error(`Error: Workbook does not contain sheet '${sheetName}'. Sheets present: ${workbook.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
  if (rawRows.length < 2) {
    console.error("Error: Sheet 'Menu' is empty or missing data rows.");
    process.exit(1);
  }

  const headerRow = rawRows[0].map(h => String(h || "").trim());
  const headerIndices = new Map();
  headerRow.forEach((col, idx) => {
    if (col) headerIndices.set(col, idx);
  });

  const errors = [];

  // Check required columns
  for (const col of REQUIRED_COLUMNS) {
    if (!headerIndices.has(col)) {
      errors.push(`Header missing required column: '${col}'`);
    }
  }

  if (errors.length > 0) {
    console.error("Menu validation failed with column errors:");
    errors.forEach(e => console.error(" - " + e));
    process.exit(1);
  }

  const seenIds = new Set();
  const items = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const excelRowNum = r + 1;

    // Check if whole row is empty
    const isEmpty = row.every(cell => cell === undefined || cell === null || String(cell).trim() === "");
    if (isEmpty) continue;

    const getVal = (col) => {
      const idx = headerIndices.get(col);
      return idx !== undefined && idx < row.length ? row[idx] : "";
    };

    const id = String(getVal("id")).trim();
    if (!id) {
      errors.push(`Row ${excelRowNum}: 'id' is required.`);
    } else if (!ID_REGEX.test(id)) {
      errors.push(`Row ${excelRowNum}: 'id' '${id}' contains invalid characters (only letters, numbers, dash, underscore allowed).`);
    } else if (seenIds.has(id)) {
      errors.push(`Row ${excelRowNum}: Duplicate 'id' '${id}'. IDs must be strictly unique.`);
    } else {
      seenIds.add(id);
    }

    const cuisine = String(getVal("cuisine")).trim();
    if (!cuisine) {
      errors.push(`Row ${excelRowNum}: 'cuisine' is required.`);
    }

    const category = String(getVal("category")).trim();
    if (!category) {
      errors.push(`Row ${excelRowNum}: 'category' is required.`);
    } else if (!ALLOWED_CATEGORIES.has(category)) {
      errors.push(`Row ${excelRowNum}: 'category' must be one of: ${Array.from(ALLOWED_CATEGORIES).join(", ")} (found: '${category}').`);
    }

    const name = String(getVal("name")).trim();
    if (!name) {
      errors.push(`Row ${excelRowNum}: English 'name' is required.`);
    }

    const description = String(getVal("description")).trim();
    if (!description) {
      errors.push(`Row ${excelRowNum}: 'description' is required.`);
    }

    const ingredients = String(getVal("ingredients")).trim();
    if (!ingredients) {
      errors.push(`Row ${excelRowNum}: 'ingredients' is required.`);
    }

    const price = parseNumber(getVal("price"), "price", 0.01, 1000, excelRowNum, errors);

    const vegetarian = parseYesNo(getVal("vegetarian"), "vegetarian", excelRowNum, errors);
    const vegan = parseYesNo(getVal("vegan"), "vegan", excelRowNum, errors);
    const contains_nuts = parseYesNo(getVal("contains_nuts"), "contains_nuts", excelRowNum, errors);
    const contains_dairy = parseYesNo(getVal("contains_dairy"), "contains_dairy", excelRowNum, errors);
    const contains_gluten = parseYesNo(getVal("contains_gluten"), "contains_gluten", excelRowNum, errors);
    const diabetic_friendly = parseYesNo(getVal("diabetic_friendly"), "diabetic_friendly", excelRowNum, errors);
    const high_protein = parseYesNo(getVal("high_protein"), "high_protein", excelRowNum, errors);
    const available = parseYesNo(getVal("available"), "available", excelRowNum, errors);

    const calories = parseNumber(getVal("calories"), "calories", 0, 5000, excelRowNum, errors);
    const protein_g = parseNumber(getVal("protein_g"), "protein_g", 0, 300, excelRowNum, errors);
    const spice_level = parseNumber(getVal("spice_level"), "spice_level", 0, 3, excelRowNum, errors);

    const other_allergens = parseAllergens(getVal("other_allergens"));

    const names = {
      en: name,
      hi: String(getVal("name_hi") || name).trim(),
      es: String(getVal("name_es") || name).trim(),
      zh: String(getVal("name_zh") || name).trim(),
      bn: String(getVal("name_bn") || name).trim(),
    };

    const alcoholic = category === "Hard Drink";

    items.push({
      id,
      cuisine,
      category,
      name,
      names,
      description,
      ingredients,
      price: Math.round(price * 100) / 100,
      vegetarian,
      vegan,
      contains_nuts,
      contains_dairy,
      contains_gluten,
      diabetic_friendly,
      high_protein,
      available,
      other_allergens,
      calories: Math.round(calories),
      protein_g: Math.round(protein_g),
      spice_level: Math.round(spice_level),
      alcoholic
    });
  }

  if (errors.length > 0) {
    console.error(`Menu validation failed with ${errors.length} error(s):`);
    errors.forEach(e => console.error(" - " + e));
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2), "utf8");
  console.log(`-> data/menu.json written with ${items.length} items.`);
}

buildMenu();
