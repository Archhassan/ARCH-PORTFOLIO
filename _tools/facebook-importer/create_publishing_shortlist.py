#!/usr/bin/env python3
"""Create a conservative, review-only publishing shortlist."""

from __future__ import annotations

import csv
import hashlib
import html
import json
import shutil
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import auto_select_office_items as selector

try:
    from PIL import Image
except ImportError:
    Image = None


PROJECT_ROOT = Path(r"D:\GitHub\ARCH-PORTFOLIO")
CATALOG_ROOT = PROJECT_ROOT / "_imports" / "office_catalog"
CATALOG_PATH = CATALOG_ROOT / "office_media_catalog.json"
OUTPUT_ROOT = CATALOG_ROOT / "publishing_shortlist"
TOOL_ROOT = PROJECT_ROOT / "_tools" / "facebook-importer"
WORKBOOK_BUILDER = TOOL_ROOT / "build_publishing_workbook.mjs"

QUOTAS = {
    "Residential": 28,
    "Interior Design": 28,
    "Government": 14,
    "Commercial": 18,
    "Lighting Studies": 14,
    "Acoustics / Cinema": 14,
    "Technical Documents": 16,
    "Videos": 18,
    "Branding": 8,
}
THRESHOLDS = {
    "image": 72,
    "video": 68,
    "pdf": 56,
    "document": 58,
    "spreadsheet": 58,
    "presentation": 58,
}
BLOCKED_PATH_PARTS = {
    "messages/inbox", "messages/archived_threads", "messages/filtered_threads",
    "comments_and_reactions", "connections/", "logged_information/",
    "profile_information/", "facebook_gaming/", "saved_items_and_collections/",
    "activity_you're_tagged_in/", "/icons/", "stickers/", "reactions/",
}
STRONG_TERMS = {
    "فيلا", "بيت", "واجهة", "تصميم", "ديكور", "داخلي", "حمام", "مطبخ",
    "غرفة", "مجلس", "سينما", "انارة", "إنارة", "إضاءة", "دراسة", "مخطط",
    "تنفيذ", "بلدية", "مول", "فندق", "مكتب", "مشروع", "villa", "facade",
    "architecture", "interior", "lighting", "cinema", "project", "render",
    "design", "municipality", "commercial", "hotel", "boq", "study",
}

COLUMNS = [
    "Rank", "Publish Recommendation", "Auto Score", "Suggested Category",
    "Suggested Style", "Suggested Project Title", "Media Caption", "Post Text",
    "Facebook Date", "Related Media Count", "Relationship ID", "File Type",
    "Original File Name", "Full Source Path", "Source Root", "Relative Folder",
    "File Size Bytes", "Image Width", "Image Height", "Aspect Ratio",
    "Suggested Use", "Selection Reason", "Metadata Source", "Preview Path",
    "Reviewer Decision", "Reviewer Notes",
]


def normalized(value: object) -> str:
    return " ".join(str(value or "").replace("\\", "/").casefold().split())


def catalog_text(item: dict) -> str:
    return " ".join(str(item.get(key, "")) for key in (
        "file_name", "relative_folder_path", "parent_folder_name",
        "possible_project_title", "possible_category", "possible_style",
        "post_text", "media_caption", "html_text_snippet",
    ))


def is_private_or_low_value(item: dict) -> bool:
    path = normalized(item.get("full_file_path"))
    return any(part in path for part in BLOCKED_PATH_PARTS)


def has_office_signal(item: dict, category: str) -> bool:
    text = normalized(catalog_text(item))
    if category in {"Branding", "Technical Documents"}:
        return True
    return any(term.casefold() in text for term in STRONG_TERMS)


def fast_metrics(path: Path) -> tuple[int, int, float, None]:
    if Image is None:
        return 0, 0, 0, None
    try:
        with Image.open(path) as image:
            width, height = image.size
            return width, height, width / height if height else 0, None
    except Exception:
        return 0, 0, 0, None


def strict_candidates(items: list[dict]) -> tuple[list[dict], int]:
    selector.metrics = fast_metrics
    prefiltered = []
    for item in items:
        file_type = item.get("file_type")
        if file_type not in THRESHOLDS or is_private_or_low_value(item):
            continue
        category = {
            "Office Branding": "Branding",
            "Unclassified": "Unsorted",
        }.get(item.get("possible_category"), item.get("possible_category"))
        if category not in QUOTAS and file_type != "video":
            continue
        if file_type == "image" and int(item.get("file_size_bytes") or 0) < 180_000:
            continue
        if not has_office_signal(item, "Videos" if file_type == "video" else category):
            continue
        prefiltered.append(item)
    scored = [selector.score_item(item) for item in prefiltered]
    duplicates = selector.mark_duplicates(scored)
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in scored:
        item = row["item"]
        if row["duplicate"].startswith("Duplicate of"):
            continue
        if is_private_or_low_value(item):
            continue
        if row["category"] not in QUOTAS:
            continue
        if row["score"] < THRESHOLDS[item["file_type"]]:
            continue
        if not has_office_signal(item, row["category"]):
            continue
        if item["file_type"] == "image" and (row["w"] < 900 or row["h"] < 650):
            continue
        grouped[row["category"]].append(row)

    selected = []
    for category, quota in QUOTAS.items():
        relationship_counts: Counter[str] = Counter()
        title_counts: Counter[str] = Counter()
        ordered = sorted(
            grouped.get(category, []),
            key=lambda row: (
                bool(row["item"].get("metadata_date")),
                row["score"],
                row["item"].get("file_size_bytes", 0),
            ),
            reverse=True,
        )
        for row in ordered:
            item = row["item"]
            relationship = item.get("relationship_id") or ""
            title_key = normalized(item.get("possible_project_title"))
            if relationship and relationship_counts[relationship] >= 4:
                continue
            if title_key and title_counts[title_key] >= 8:
                continue
            selected.append(row)
            if relationship:
                relationship_counts[relationship] += 1
            if title_key:
                title_counts[title_key] += 1
            if sum(1 for candidate in selected if candidate["category"] == category) >= quota:
                break
    selected.sort(key=lambda row: (row["score"], row["item"].get("metadata_date", "")), reverse=True)
    return selected, duplicates


def output_row(rank: int, row: dict) -> dict:
    item = row["item"]
    caption = item.get("media_caption", "")
    post_text = item.get("post_text", "")
    title = caption or item.get("possible_project_title", "") or item["file_name"]
    recommendation = "Strong publishable candidate" if row["score"] >= 84 else "Publish after office review"
    return {
        "Rank": rank,
        "Publish Recommendation": recommendation,
        "Auto Score": row["score"],
        "Suggested Category": row["category"],
        "Suggested Style": row["style"],
        "Suggested Project Title": title[:180],
        "Media Caption": caption,
        "Post Text": post_text,
        "Facebook Date": item.get("metadata_date", ""),
        "Related Media Count": item.get("related_media_count", 0),
        "Relationship ID": item.get("relationship_id", ""),
        "File Type": item["file_type"],
        "Original File Name": item["file_name"],
        "Full Source Path": item["full_file_path"],
        "Source Root": item["source_root"],
        "Relative Folder": item["relative_folder_path"],
        "File Size Bytes": item["file_size_bytes"],
        "Image Width": row["w"] or "",
        "Image Height": row["h"] or "",
        "Aspect Ratio": round(row["ratio"], 3) if row["ratio"] else "",
        "Suggested Use": row["use"],
        "Selection Reason": row["reasons"],
        "Metadata Source": item.get("metadata_source_path", ""),
        "Preview Path": item.get("preview_path", ""),
        "Reviewer Decision": "Pending",
        "Reviewer Notes": "",
    }


def write_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def copy_previews(rows: list[dict]) -> dict[str, str]:
    preview_dir = OUTPUT_ROOT / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    mapping = {}
    for row in rows:
        relative = row["Preview Path"]
        if not relative:
            continue
        source = CATALOG_ROOT / relative
        if not source.is_file():
            continue
        digest = hashlib.sha1(row["Full Source Path"].encode("utf-8")).hexdigest()[:12]
        destination = preview_dir / f"{int(row['Rank']):03d}-{digest}.jpg"
        if not destination.exists():
            shutil.copy2(source, destination)
        mapping[row["Full Source Path"]] = destination.relative_to(OUTPUT_ROOT).as_posix()
    return mapping


def card(row: dict, mapping: dict[str, str]) -> str:
    preview = mapping.get(row["Full Source Path"], "")
    media = (
        f'<img src="{html.escape(preview)}" alt="">'
        if preview else '<div class="no-preview">No preview</div>'
    )
    source_uri = Path(row["Full Source Path"]).as_uri()
    return f"""<article data-category="{html.escape(row['Suggested Category'])}">
{media}<div class="content"><small>{html.escape(row['Suggested Category'])} · {row['Auto Score']}</small>
<h2>{html.escape(row['Suggested Project Title'])}</h2>
<p>{html.escape((row['Media Caption'] or row['Post Text'])[:260])}</p>
<dl><dt>Date</dt><dd>{html.escape(row['Facebook Date'] or 'Archive date unavailable')}</dd>
<dt>Type</dt><dd>{html.escape(row['File Type'])}</dd></dl>
<a href="{html.escape(source_uri)}">Open original read-only source</a></div></article>"""


def page_shell(title: str, intro: str, body: str) -> str:
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)}</title>
<style>
:root{{--ink:#171715;--muted:#716d65;--paper:#f5f3ee;--gold:#987849}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 Arial,sans-serif}}
header{{padding:48px 5vw;background:#fff;border-bottom:1px solid #ded9cf}}h1{{font-size:clamp(30px,5vw,62px);font-weight:400;margin:0}}
header p{{max-width:800px;color:var(--muted)}}nav a,a{{color:#745c36}}nav{{display:flex;gap:18px;flex-wrap:wrap;margin-top:24px}}
main{{padding:28px 5vw}}.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}}
article{{background:#fff;border:1px solid #ded9cf;border-radius:18px;overflow:hidden}}article img,.no-preview{{width:100%;aspect-ratio:16/10;object-fit:cover;background:#ddd8ce;display:grid;place-items:center}}
.content{{padding:20px}}small{{color:var(--gold);text-transform:uppercase;letter-spacing:.08em}}h2{{font-size:21px;line-height:1.35}}
p,dd{{color:var(--muted)}}dl{{display:grid;grid-template-columns:60px 1fr;gap:4px 12px}}dt{{font-weight:bold}}dd{{margin:0;overflow-wrap:anywhere}}
.category{{margin:46px 0 18px;font-size:28px}}.stats{{display:flex;gap:28px;flex-wrap:wrap}}.stats b{{font-size:28px}}
</style></head><body><header><h1>{html.escape(title)}</h1><p>{html.escape(intro)}</p>
<nav><a href="review_index.html">Review index</a><a href="selected_publish_gallery.html">All selected</a>
<a href="by_category_gallery.html">By category</a><a href="publishing_shortlist.csv">CSV</a>
<a href="publishing_shortlist.xlsx">Workbook</a></nav></header><main>{body}</main></body></html>"""


def write_galleries(rows: list[dict], mapping: dict[str, str], summary: dict) -> None:
    all_cards = '<div class="grid">' + "".join(card(row, mapping) for row in rows) + "</div>"
    (OUTPUT_ROOT / "selected_publish_gallery.html").write_text(
        page_shell("Selected publish gallery", "Strict office-work candidates only. Nothing has been published.", all_cards),
        encoding="utf-8",
    )
    categories = []
    for category in QUOTAS:
        category_rows = [row for row in rows if row["Suggested Category"] == category]
        if category_rows:
            categories.append(
                f'<h2 class="category">{html.escape(category)} · {len(category_rows)}</h2>'
                f'<div class="grid">{"".join(card(row, mapping) for row in category_rows)}</div>'
            )
    (OUTPUT_ROOT / "by_category_gallery.html").write_text(
        page_shell("Publishing shortlist by category", "Review balanced candidates category by category.", "".join(categories)),
        encoding="utf-8",
    )
    category_stats = "".join(
        f"<div><b>{count}</b><br>{html.escape(category)}</div>"
        for category, count in summary["items_per_category"].items()
    )
    index_body = (
        f'<div class="stats"><div><b>{summary["selected_items"]}</b><br>Selected candidates</div>'
        f'<div><b>{summary["metadata_linked_items"]}</b><br>Caption/date linked</div>{category_stats}</div>'
        '<h2 class="category">Open first</h2><p><a href="selected_publish_gallery.html">Selected publish gallery</a> '
        'is the fastest visual review. Use the workbook for decisions and notes.</p>'
    )
    (OUTPUT_ROOT / "review_index.html").write_text(
        page_shell("Office archive publishing review", "Read-only shortlist; originals remain untouched.", index_body),
        encoding="utf-8",
    )


def build_workbook(summary_path: Path) -> None:
    dependency_root = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies"
    node = dependency_root / "node/bin/node.exe"
    modules = dependency_root / "node/node_modules"
    runtime = TOOL_ROOT / ".artifact_runtime"
    junction = runtime / "node_modules"
    runtime.mkdir(parents=True, exist_ok=True)
    if not junction.exists():
        subprocess.run(["cmd", "/c", "mklink", "/J", str(junction), str(modules)], check=True, capture_output=True)
    runtime_builder = runtime / WORKBOOK_BUILDER.name
    shutil.copy2(WORKBOOK_BUILDER, runtime_builder)
    subprocess.run([str(node), str(runtime_builder), str(OUTPUT_ROOT), str(summary_path)], cwd=runtime, check=True)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    payload = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    selected, duplicates = strict_candidates(payload["items"])
    rows = [output_row(rank, row) for rank, row in enumerate(selected, start=1)]
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    write_csv(OUTPUT_ROOT / "publishing_shortlist.csv", rows)
    category_counts = Counter(row["Suggested Category"] for row in rows)
    summary = {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "catalog_source": str(CATALOG_PATH),
        "output_root": str(OUTPUT_ROOT),
        "source_roots": payload.get("source_roots", []),
        "facebook_metadata": payload.get("metadata_extraction", {}),
        "catalog_items_reviewed": len(payload["items"]),
        "selected_items": len(rows),
        "metadata_linked_items": sum(bool(row["Metadata Source"]) for row in rows),
        "duplicates_excluded": duplicates,
        "strict_thresholds": THRESHOLDS,
        "category_quotas": QUOTAS,
        "items_per_category": dict(sorted(category_counts.items())),
        "safety": {
            "original_files_modified": False,
            "website_published": False,
            "public_assets_copied": False,
            "data_json_modified": False,
        },
    }
    summary_path = OUTPUT_ROOT / "publishing_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    mapping = copy_previews(rows)
    write_galleries(rows, mapping, summary)
    build_workbook(summary_path)
    print(f"Catalog items reviewed: {len(payload['items']):,}")
    print(f"Strict shortlist selected: {len(rows):,}")
    print(f"Metadata-linked selected items: {summary['metadata_linked_items']:,}")
    for category, count in category_counts.most_common():
        print(f"  {category}: {count:,}")
    print(f"Output: {OUTPUT_ROOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
