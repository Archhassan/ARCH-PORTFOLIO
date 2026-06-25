import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [outputDir, summaryPath] = process.argv.slice(2);
const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
const csvText = await fs.readFile(path.join(outputDir, "smart_selected_items.csv"), "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "Selected Items" });
const items = workbook.worksheets.getItemAt(0);
items.showGridLines = false;
items.freezePanes.freezeRows(1);
items.freezePanes.freezeColumns(2);
const used = items.getUsedRange();
used.format.font = { name: "Aptos", size: 9, color: "#272722" };
used.format.verticalAlignment = "center";
items.getRange("A1:W1").format = {
  fill: "#171715", font: { bold: true, color: "#FFFFFF", size: 10 },
  rowHeight: 28, borders: { preset: "inside", style: "thin", color: "#4B4943" },
};
items.getRange("G2:G30000").format.numberFormat = "#,##0";
items.getRange("I2:J30000").format.numberFormat = "#,##0";
items.getRange("K2:K30000").format.numberFormat = "0.00";
items.getRange("L2:L30000").format.numberFormat = "0.0";
items.getRange("A:A").format.columnWidth = 25;
items.getRange("B:B").format.columnWidth = 58;
items.getRange("C:D").format.columnWidth = 26;
items.getRange("E:L").format.columnWidth = 14;
items.getRange("M:M").format.columnWidth = 13;
items.getRange("N:R").format.columnWidth = 24;
items.getRange("S:S").format.columnWidth = 25;
items.getRange("T:T").format.columnWidth = 54;
items.getRange("U:W").format.columnWidth = 20;
items.getRange("M2:M30000").conditionalFormats.add("containsText", {
  text: "Yes", format: { fill: "#DDEEDD", font: { bold: true, color: "#245C35" } },
});
items.getRange("M2:M30000").conditionalFormats.add("containsText", {
  text: "Maybe", format: { fill: "#FFF0C7", font: { bold: true, color: "#755715" } },
});
items.getRange("M2:M30000").conditionalFormats.add("containsText", {
  text: "No", format: { fill: "#F0E2E0", font: { color: "#8B3A35" } },
});
items.tables.add(used.address, true, "SmartSelectionTable").style = "TableStyleMedium2";

const dashboard = workbook.worksheets.add("Summary");
dashboard.showGridLines = false;
dashboard.getRange("A1:H2").merge();
dashboard.getRange("A1").values = [["Office Archive Smart Selection"]];
dashboard.getRange("A1:H2").format = {
  fill: "#171715", font: { bold: true, color: "#FFFFFF", size: 20 },
  verticalAlignment: "center",
};
dashboard.getRange("A4:H4").values = [[
  "Total Reviewed", "Yes", "Maybe", "No", "Duplicates", "Top Score", "Generated", "Source"
]];
dashboard.getRange("A5:H5").values = [[
  summary.total_files_reviewed, summary.auto_selected.Yes || 0,
  summary.auto_selected.Maybe || 0, summary.auto_selected.No || 0,
  summary.duplicates_detected, summary.top_score,
  new Date(summary.generated_utc), "office_media_catalog.json",
]];
dashboard.getRange("A4:H4").format = {
  fill: "#A68A5B", font: { bold: true, color: "#FFFFFF" },
};
dashboard.getRange("A5:H5").format = {
  fill: "#F5F2EC", font: { bold: true, color: "#171715", size: 12 },
};
dashboard.getRange("A5:F5").format.numberFormat = "#,##0";
dashboard.getRange("G5").format.numberFormat = "yyyy-mm-dd hh:mm";
const categories = Object.entries(summary.items_per_category);
dashboard.getRange("A8:B8").values = [["Category", "Items"]];
dashboard.getRange(`A9:B${8 + categories.length}`).values = categories;
dashboard.getRange("A8:B8").format = { fill: "#171715", font: { bold: true, color: "#FFFFFF" } };
const selections = Object.entries(summary.auto_selected);
dashboard.getRange("D8:E8").values = [["Selection", "Count"]];
dashboard.getRange(`D9:E${8 + selections.length}`).values = selections;
dashboard.getRange("D8:E8").format = { fill: "#171715", font: { bold: true, color: "#FFFFFF" } };
dashboard.getRange("A:H").format.columnWidth = 20;
dashboard.freezePanes.freezeRows(2);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, "smart_selected_items.xlsx"));
const preview = await workbook.render({
  sheetName: "Summary", range: "A1:H20", scale: 1.5, format: "png",
});
await fs.writeFile(path.join(outputDir, "workbook_summary_preview.png"),
  new Uint8Array(await preview.arrayBuffer()));
