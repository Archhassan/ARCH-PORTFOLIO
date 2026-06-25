import fs from "node:fs/promises";
import path from "node:path";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const [outputDir, summaryPath] = process.argv.slice(2);
const csvText = await fs.readFile(path.join(outputDir, "publishing_shortlist.csv"), "utf8");
const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));

const workbook = await Workbook.fromCSV(csvText, { sheetName: "Publishing Shortlist" });
const items = workbook.worksheets.getItemAt(0);
items.freezePanes.freezeRows(1);
items.freezePanes.freezeColumns(1);
items.showGridLines = false;
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
items.getRange("X:X").format.columnWidth = 22;
items.getRange("Y:Y").format.columnWidth = 20;
items.getRange("Z:Z").format.columnWidth = 30;
items.getRange("A1:Z1").format.rowHeight = 34;
items.getRange(`A2:Z${summary.selected_items + 1}`).format.rowHeight = 92;
items.getRange(`Y2:Y${summary.selected_items + 1}`).dataValidation = {
  rule: { type: "list", values: ["✓ نشر", "مراجعة", "رفض"] },
};
items.getRange(`Y2:Y${summary.selected_items + 1}`).values =
  Array.from({ length: summary.selected_items }, () => ["مراجعة"]);
items.getRange(`Y2:Y${summary.selected_items + 1}`).format = {
  fill: "#FFF3D6",
  font: { bold: true, color: "#6F5115" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
items.getRange(`Y2:Y${summary.selected_items + 1}`).conditionalFormats.add(
  "containsText",
  { text: "✓ نشر", format: { fill: "#DFF1E4", font: { bold: true, color: "#235D37" } } },
);
items.getRange(`Y2:Y${summary.selected_items + 1}`).conditionalFormats.add(
  "containsText",
  { text: "رفض", format: { fill: "#F7DFDC", font: { bold: true, color: "#8B3028" } } },
);
items.getRange(`X2:X${summary.selected_items + 1}`).values =
  Array.from({ length: summary.selected_items }, () => [""]);
items.getRange(`X2:X${summary.selected_items + 1}`).format = {
  fill: "#F1EEE8",
  horizontalAlignment: "center",
  verticalAlignment: "center",
};

const catalogRoot = path.dirname(outputDir);
const csvRows = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
const headers = parseCsvLine(csvRows[0] || "");
const previewIndex = headers.indexOf("Preview Path");
for (let rowIndex = 1; rowIndex <= summary.selected_items; rowIndex += 1) {
  const values = parseCsvLine(csvRows[rowIndex] || "");
  const previewPath = values[previewIndex] || "";
  if (!previewPath) continue;
  const absolutePreview = path.join(catalogRoot, previewPath.replaceAll("/", path.sep));
  try {
    const bytes = await fs.readFile(absolutePreview);
    const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    items.images.add({
      dataUrl,
      anchor: {
        from: { row: rowIndex, col: 23, rowOffsetPx: 5, colOffsetPx: 5 },
        extent: { widthPx: 128, heightPx: 78 },
      },
    });
  } catch {
    items.getRange(`X${rowIndex + 1}`).values = [["لا توجد معاينة"]];
  }
}

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
summarySheet.getRange("D3:H8").merge();
summarySheet.getRange("D3").values = [[
  "طريقة المراجعة:\nاختر من عمود Reviewer Decision:\n✓ نشر = اعتماد للنشر\nمراجعة = يحتاج قرار\nرفض = استبعاد\n\nبعد الحفظ اطلب من Codex: انشر العناصر المعتمدة."
]];
summarySheet.getRange("D3:H8").format = {
  fill: "#EEE9DF",
  font: { color: "#3F3A32", size: 12 },
  wrapText: true,
  verticalAlignment: "center",
};
summarySheet.getRange("A3:H8").format.rowHeight = 30;

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "publishing_shortlist.xlsx"));
const preview = await workbook.render({
  sheetName: "Summary", range: "A1:H22", scale: 1.25, format: "png",
});
await fs.writeFile(
  path.join(outputDir, "publishing_workbook_preview.png"),
  new Uint8Array(await preview.arrayBuffer()),
);
const reviewPreview = await workbook.render({
  sheetName: "Publishing Shortlist", range: "W1:Z7", scale: 1.2, format: "png",
});
await fs.writeFile(
  path.join(outputDir, "publishing_review_preview.png"),
  new Uint8Array(await reviewPreview.arrayBuffer()),
);

console.log(`Workbook created: ${path.join(outputDir, "publishing_shortlist.xlsx")}`);
