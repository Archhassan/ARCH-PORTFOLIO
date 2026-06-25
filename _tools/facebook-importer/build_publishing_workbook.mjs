import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const [outputDir, summaryPath] = process.argv.slice(2);
const csvText = await fs.readFile(path.join(outputDir, "publishing_shortlist.csv"), "utf8");
const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));

const workbook = await Workbook.fromCSV(csvText, { sheetName: "Publishing Shortlist" });
const items = workbook.worksheets.getItemAt(0);
items.freezePanes.freezeRows(1);
items.getRange("A1:Z1").format = {
  fill: "#171715",
  font: { bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
};
items.getRange("A:Z").format.wrapText = true;
items.getRange("A:Z").format.verticalAlignment = "top";
items.getRange("A:A").format.columnWidth = 7;
items.getRange("B:C").format.columnWidth = 18;
items.getRange("D:E").format.columnWidth = 20;
items.getRange("F:F").format.columnWidth = 34;
items.getRange("G:H").format.columnWidth = 48;
items.getRange("I:I").format.columnWidth = 22;
items.getRange("J:L").format.columnWidth = 18;
items.getRange("M:M").format.columnWidth = 26;
items.getRange("N:P").format.columnWidth = 48;
items.getRange("Q:U").format.columnWidth = 16;
items.getRange("V:V").format.columnWidth = 48;
items.getRange("W:X").format.columnWidth = 52;
items.getRange("Y:Z").format.columnWidth = 22;
items.getRange("A1:Z1").format.rowHeight = 34;
items.getRange(`A2:Z${summary.selected_items + 1}`).format.rowHeight = 54;

const summarySheet = workbook.worksheets.add("Summary");
summarySheet.getRange("A1:H1").merge();
summarySheet.getRange("A1").values = [["Office Archive Publishing Shortlist"]];
summarySheet.getRange("A1:H1").format = {
  fill: "#171715",
  font: { bold: true, color: "#FFFFFF", size: 20 },
  rowHeight: 44,
  verticalAlignment: "center",
};
summarySheet.getRange("A3:B8").values = [
  ["Generated UTC", summary.generated_utc],
  ["Catalog items reviewed", summary.catalog_items_reviewed],
  ["Strict candidates", summary.selected_items],
  ["Metadata-linked candidates", summary.metadata_linked_items],
  ["Duplicates excluded", summary.duplicates_excluded],
  ["Publishing status", "Review only — nothing published"],
];
summarySheet.getRange("A3:A8").format = { font: { bold: true }, fill: "#EEE9DF" };
summarySheet.getRange("B3").format.numberFormat = "yyyy-mm-dd hh:mm";
summarySheet.getRange("A10:B10").values = [["Category", "Selected"]];
summarySheet.getRange("A10:B10").format = { fill: "#987849", font: { bold: true, color: "#FFFFFF" } };
const categoryRows = Object.entries(summary.items_per_category);
if (categoryRows.length) summarySheet.getRange(`A11:B${10 + categoryRows.length}`).values = categoryRows;
summarySheet.getRange("A:A").format.columnWidth = 30;
summarySheet.getRange("B:B").format.columnWidth = 42;
summarySheet.getRange("A1:H30").format.wrapText = true;
summarySheet.freezePanes.freezeRows(1);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "publishing_shortlist.xlsx"));
const preview = await workbook.render({
  sheetName: "Summary", range: "A1:H22", scale: 1.25, format: "png",
});
await fs.writeFile(
  path.join(outputDir, "publishing_workbook_preview.png"),
  new Uint8Array(await preview.arrayBuffer()),
);

console.log(`Workbook created: ${path.join(outputDir, "publishing_shortlist.xlsx")}`);
