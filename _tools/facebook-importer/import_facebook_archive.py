#!/usr/bin/env python3
"""Read-only multi-root office archive catalog importer."""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from archive_metadata import build_metadata_index, metadata_for

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None


PROJECT_ROOT = Path(r"D:\GitHub\ARCH-PORTFOLIO")
DEFAULT_OUTPUT = PROJECT_ROOT / "_imports" / "office_catalog"
DEFAULT_SOURCES = [
    Path(r"E:\New folder (7)\فيس بوك"),
    Path(r"E:\FOR SHARE"),
]

EXTENSION_TYPES = {
    ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image",
    ".mp4": "video", ".webm": "video", ".mov": "video", ".avi": "video",
    ".pdf": "pdf",
    ".doc": "document", ".docx": "document",
    ".xls": "spreadsheet", ".xlsx": "spreadsheet",
    ".ppt": "presentation", ".pptx": "presentation",
    ".html": "html", ".htm": "html",
    ".json": "json",
}

CATEGORY_KEYWORDS = {
    "Residential": [
        "فيلا", "سكني", "دار", "بيت", "منزل", "استراحة", "مزرعة",
        "villa", "house", "residential",
    ],
    "Government": [
        "بلدية", "حكومي", "موانئ", "اداري", "إداري", "محافظة",
        "government", "municipality", "port", "boc",
    ],
    "Commercial": [
        "تجاري", "مول", "مطعم", "كوفي", "معرض", "مكتب", "فندق", "فنادق",
        "office", "commercial", "restaurant", "cafe", "showroom", "hotel",
    ],
    "Interior Design": [
        "ديكور", "داخلي", "غرفة", "نوم", "حمام", "مطبخ", "مجلس", "صالة", "سقوف",
        "interior", "bedroom", "bathroom", "kitchen", "majlis", "ceiling",
    ],
    "Lighting Studies": [
        "انارة", "إنارة", "إضاءة", "اضاءة", "lighting", "lux", "lumen", "spotlight",
    ],
    "Acoustics / Cinema": [
        "سينما", "صوت", "عزل صوتي", "acoustic", "cinema", "atmos", "speaker",
    ],
    "Technical Documents": [
        "مخطط", "تقرير", "دراسة", "كميات", "boq", "pdf", "tender",
        "report", "study", "تنفيذ",
    ],
    "Videos": ["فيديو", "video", "animation", "reel", "mp4", "webm"],
    "Office Branding": [
        "logo", "شعار", "بروفايل", "profile", "brochure", "company profile",
    ],
}

STYLE_KEYWORDS = {
    "Classic / Neo Classic": [
        "كلاسك", "كلاسيك", "نيو كلاسك", "نيو كلاسيك", "neo classic",
        "neo-classic", "classic",
    ],
    "Modern": ["مودرن", "حديث", "minimal", "modern", "contemporary"],
}

# Replace legacy keyword literals with canonical Unicode values.
CATEGORY_KEYWORDS = {
    "Residential": [
        "فيلا", "سكني", "دار", "بيت", "منزل", "استراحة", "مزرعة",
        "villa", "house", "residential", "واجهة", "عمارة",
    ],
    "Government": [
        "بلدية", "حكومي", "موانئ", "ميناء", "اداري", "إداري", "محافظة",
        "government", "municipality", "port", "boc",
    ],
    "Commercial": [
        "تجاري", "مول", "مطعم", "كوفي", "معرض", "مكتب", "فندق", "فنادق",
        "office", "commercial", "restaurant", "cafe", "showroom", "hotel",
    ],
    "Interior Design": [
        "ديكور", "داخلي", "غرفة", "نوم", "حمام", "مطبخ", "مجلس", "صالة", "سقوف",
        "interior", "bedroom", "bathroom", "kitchen", "majlis", "ceiling",
    ],
    "Lighting Studies": [
        "انارة", "إنارة", "إضاءة", "اضاءة", "lighting", "lux", "lumen", "spotlight",
    ],
    "Acoustics / Cinema": [
        "سينما", "صوت", "عزل صوتي", "acoustic", "cinema", "atmos", "speaker",
    ],
    "Technical Documents": [
        "مخطط", "تقرير", "دراسة", "كميات", "تنفيذ", "boq", "pdf", "tender",
        "report", "study", "specification", "drawing",
    ],
    "Videos": ["فيديو", "video", "animation", "reel", "mp4", "webm"],
    "Office Branding": [
        "logo", "شعار", "بروفايل", "profile", "brochure", "company profile",
    ],
}

STYLE_KEYWORDS = {
    "Classic / Neo Classic": [
        "كلاسك", "كلاسيك", "نيو كلاسك", "نيو كلاسيك", "neo classic", "neo-classic", "classic",
    ],
    "Modern": ["مودرن", "حديث", "حداثة", "minimal", "modern", "contemporary"],
}

GENERIC_FOLDER_NAMES = {
    "", ".", "media", "photos", "photo", "video", "videos", "فيديو", "images",
    "files", "html", "posts", "your_facebook_activity", "facebook",
    "new folder", "drive", "lib", "skin",
}

ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
HTML_TAGS = re.compile(r"<[^>]+>")
WHITESPACE = re.compile(r"\s+")
YEAR_PATTERN = re.compile(r"(?<!\d)(19\d{2}|20\d{2}|21\d{2})(?!\d)")


def configure_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recursively catalog office archive media and documents without modifying sources."
    )
    parser.add_argument(
        "source_roots",
        nargs="*",
        type=Path,
        help="One or more source roots. Defaults to the two configured office archive roots.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Catalog output folder (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--no-previews",
        action="store_true",
        help="Skip image thumbnail generation.",
    )
    parser.add_argument(
        "--preview-size",
        type=int,
        default=320,
        help="Maximum thumbnail edge in pixels (default: 320).",
    )
    return parser.parse_args()


def normalize_text(value: str) -> str:
    value = value.translate(ARABIC_DIGITS).casefold()
    value = re.sub(r"[_\-.\\/]+", " ", value)
    return WHITESPACE.sub(" ", value).strip()


def score_keywords(text: str, mapping: dict[str, list[str]]) -> list[tuple[str, int]]:
    normalized = normalize_text(text)
    scores = []
    for label, keywords in mapping.items():
        score = sum(1 for keyword in keywords if normalize_text(keyword) in normalized)
        if score:
            scores.append((label, score))
    return sorted(scores, key=lambda pair: (-pair[1], pair[0]))


def detect_category(text: str, file_type: str) -> str:
    scores = score_keywords(text, CATEGORY_KEYWORDS)
    if scores:
        return scores[0][0]
    if file_type == "video":
        return "Videos"
    if file_type in {"pdf", "document", "spreadsheet", "presentation"}:
        return "Technical Documents"
    return "Unclassified"


def detect_style(text: str) -> str:
    scores = score_keywords(text, STYLE_KEYWORDS)
    return scores[0][0] if scores else ""


def detect_year(text: str) -> str:
    match = YEAR_PATTERN.search(text.translate(ARABIC_DIGITS))
    return match.group(1) if match else ""


def suggested_title(relative_folder: Path, file_stem: str) -> str:
    for part in reversed(relative_folder.parts):
        candidate = WHITESPACE.sub(" ", part).strip()
        if normalize_text(candidate) not in GENERIC_FOLDER_NAMES and len(candidate) > 1:
            return candidate
    return WHITESPACE.sub(" ", file_stem).strip()


def read_html_snippet(path: Path, limit: int = 300) -> str:
    try:
        sample = path.read_bytes()[:524_288]
    except OSError:
        return ""
    for encoding in ("utf-8", "utf-8-sig", "cp1256", "cp1252"):
        try:
            text = sample.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = sample.decode("utf-8", errors="replace")
    text = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", text)
    text = html.unescape(HTML_TAGS.sub(" ", text))
    return WHITESPACE.sub(" ", text).strip()[:limit]


def preview_name(source_root: Path, path: Path) -> str:
    digest = hashlib.sha1(
        (str(source_root) + "\0" + str(path)).encode("utf-8", errors="surrogatepass")
    ).hexdigest()[:16]
    safe_stem = re.sub(r"[^\w\u0600-\u06ff-]+", "-", path.stem, flags=re.UNICODE).strip("-")
    return f"{digest}-{safe_stem[:50] or 'image'}.jpg"


def create_preview(source_root: Path, path: Path, preview_dir: Path, size: int) -> str:
    if Image is None:
        return ""
    output = preview_dir / preview_name(source_root, path)
    if output.exists() and output.stat().st_mtime >= path.stat().st_mtime:
        return output.relative_to(preview_dir.parent).as_posix()
    try:
        with Image.open(path) as image:
            image = ImageOps.exif_transpose(image)
            if image.mode not in ("RGB", "L"):
                background = Image.new("RGB", image.size, "white")
                if "A" in image.getbands():
                    background.paste(image, mask=image.getchannel("A"))
                else:
                    background.paste(image)
                image = background
            else:
                image = image.convert("RGB")
            image.thumbnail((size, size), Image.Resampling.LANCZOS)
            output.parent.mkdir(parents=True, exist_ok=True)
            image.save(output, "JPEG", quality=76, optimize=True)
        return output.relative_to(preview_dir.parent).as_posix()
    except (OSError, ValueError, Image.DecompressionBombError):
        return ""


def iter_folders(source_root: Path) -> Iterable[Path]:
    for directory, folder_names, _ in os.walk(source_root, followlinks=False):
        folder_names.sort(key=str.casefold)
        yield Path(directory)


def scan(
    source_roots: list[Path],
    output: Path,
    create_previews: bool,
    preview_size: int,
) -> tuple[list[dict], list[dict], list[dict], dict]:
    records: list[dict] = []
    errors: list[dict] = []
    folder_data: dict[tuple[str, str], dict] = {}
    preview_dir = output / "previews"
    metadata_index, metadata_stats = build_metadata_index(source_roots)
    if create_previews:
        preview_dir.mkdir(parents=True, exist_ok=True)

    for source_index, source_root in enumerate(source_roots, start=1):
        for folder in iter_folders(source_root):
            relative_folder = folder.relative_to(source_root)
            key = (str(source_root), relative_folder.as_posix())
            folder_data[key] = {
                "source_root": str(source_root),
                "folder_path": str(folder),
                "folder_name": folder.name,
                "relative_folder_path": relative_folder.as_posix(),
                "total_images": 0,
                "total_videos": 0,
                "total_pdfs": 0,
                "total_documents": 0,
                "total_spreadsheets": 0,
                "total_presentations": 0,
                "total_html": 0,
                "total_json": 0,
                "_classification_text": str(relative_folder),
            }

        for directory, folder_names, file_names in os.walk(source_root, followlinks=False):
            folder_names.sort(key=str.casefold)
            file_names.sort(key=str.casefold)
            directory_path = Path(directory)
            relative_folder = directory_path.relative_to(source_root)
            folder_key = (str(source_root), relative_folder.as_posix())

            for file_name in file_names:
                path = directory_path / file_name
                extension = path.suffix.lower()
                file_type = EXTENSION_TYPES.get(extension)
                if not file_type:
                    continue
                try:
                    stat = path.stat()
                    metadata = metadata_for(path, metadata_index)
                    classification_text = " ".join([
                        relative_folder.as_posix(),
                        path.stem,
                        metadata["post_text"],
                        metadata["media_caption"],
                    ])
                    category = detect_category(classification_text, file_type)
                    style = detect_style(classification_text)
                    year = detect_year(metadata["metadata_date"] or classification_text)
                    title_source = metadata["media_caption"] or metadata["post_text"]
                    title = (
                        WHITESPACE.sub(" ", title_source).strip()[:120]
                        if title_source
                        else suggested_title(relative_folder, path.stem)
                    )
                    snippet = read_html_snippet(path) if file_type == "html" else ""
                    preview = ""
                    if file_type == "image" and create_previews:
                        preview = create_preview(
                            source_root, path, preview_dir, preview_size
                        )

                    record = {
                        "id": len(records) + 1,
                        "file_name": path.name,
                        "full_file_path": str(path),
                        "source_root": str(source_root),
                        "relative_folder_path": relative_folder.as_posix(),
                        "parent_folder_name": path.parent.name,
                        "file_extension": extension.lstrip("."),
                        "file_type": file_type,
                        "file_size_bytes": stat.st_size,
                        "modified_date": datetime.fromtimestamp(
                            stat.st_mtime, timezone.utc
                        ).isoformat(),
                        "possible_project_title": title,
                        "possible_category": category,
                        "possible_style": style,
                        "possible_year": year,
                        "html_text_snippet": snippet,
                        "post_text": metadata["post_text"],
                        "media_caption": metadata["media_caption"],
                        "metadata_date": metadata["metadata_date"],
                        "metadata_source_path": metadata["metadata_source_path"],
                        "metadata_format": metadata["metadata_format"],
                        "relationship_id": metadata["relationship_id"],
                        "related_media_count": metadata["related_media_count"],
                        "metadata_inherited_from_duplicate": False,
                        "preview_path": preview,
                    }
                    records.append(record)

                    folder_record = folder_data[folder_key]
                    counter_name = {
                        "image": "total_images",
                        "video": "total_videos",
                        "pdf": "total_pdfs",
                        "document": "total_documents",
                        "spreadsheet": "total_spreadsheets",
                        "presentation": "total_presentations",
                        "html": "total_html",
                        "json": "total_json",
                    }[file_type]
                    folder_record[counter_name] += 1
                    folder_record["_classification_text"] += f" {path.stem}"
                except (OSError, ValueError) as error:
                    errors.append({
                        "source_root": str(source_root),
                        "path": str(path),
                        "error": str(error),
                    })

    # Keep the best-quality duplicate eligible while carrying Facebook
    # captions and dates from an exact name+size archive copy.
    duplicate_groups: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for record in records:
        if record["file_type"] in {"image", "video"}:
            duplicate_groups[
                (record["file_name"].casefold(), record["file_size_bytes"])
            ].append(record)
    for group in duplicate_groups.values():
        metadata_source = next(
            (item for item in group if item["metadata_source_path"]),
            None,
        )
        if not metadata_source:
            continue
        for item in group:
            if item["metadata_source_path"]:
                continue
            for field in (
                "post_text", "media_caption", "metadata_date",
                "metadata_source_path", "metadata_format",
                "relationship_id", "related_media_count",
            ):
                item[field] = metadata_source[field]
            item["metadata_inherited_from_duplicate"] = True
            enriched_text = " ".join([
                item["relative_folder_path"], item["file_name"],
                item["post_text"], item["media_caption"],
            ])
            item["possible_category"] = detect_category(enriched_text, item["file_type"])
            item["possible_style"] = detect_style(enriched_text)
            item["possible_year"] = detect_year(item["metadata_date"] or enriched_text)
            if item["media_caption"]:
                item["possible_project_title"] = item["media_caption"][:120]

    folder_summaries = []
    for record in folder_data.values():
        text = record.pop("_classification_text")
        folder_summaries.append({
            **record,
            "detected_category": detect_category(text, "other"),
            "detected_style": detect_style(text),
            "suggested_project_title": suggested_title(
                Path(record["relative_folder_path"]), record["folder_name"]
            ),
        })
    folder_summaries.sort(key=lambda item: (
        item["source_root"].casefold(), item["relative_folder_path"].casefold()
    ))
    return records, folder_summaries, errors, metadata_stats


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, value) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def candidate_record(item: dict) -> dict:
    return {
        "title": item["possible_project_title"],
        "category": item["possible_category"],
        "style": item["possible_style"],
        "year": item["possible_year"],
        "source_root": item["source_root"],
        "source_path": item["full_file_path"],
        "relative_folder_path": item["relative_folder_path"],
        "file_name": item["file_name"],
        "file_type": item["file_type"],
        "preview_path": item["preview_path"],
        "html_text_snippet": item["html_text_snippet"],
        "post_text": item["post_text"],
        "media_caption": item["media_caption"],
        "metadata_date": item["metadata_date"],
        "metadata_source_path": item["metadata_source_path"],
        "relationship_id": item["relationship_id"],
        "metadata_inherited_from_duplicate": item["metadata_inherited_from_duplicate"],
    }


def build_candidates(records: list[dict]) -> dict[str, list[dict]]:
    project_categories = {"Residential", "Government", "Commercial", "Interior Design"}
    knowledge_categories = {
        "Lighting Studies", "Acoustics / Cinema", "Technical Documents"
    }
    document_types = {"pdf", "document", "spreadsheet", "presentation"}
    return {
        "candidate_projects.json": [
            candidate_record(item)
            for item in records
            if item["possible_category"] in project_categories
        ],
        "candidate_knowledge.json": [
            candidate_record(item)
            for item in records
            if item["possible_category"] in knowledge_categories
        ],
        "candidate_documents.json": [
            candidate_record(item)
            for item in records
            if item["file_type"] in document_types
        ],
        "candidate_videos.json": [
            candidate_record(item)
            for item in records
            if item["file_type"] == "video"
        ],
        "candidate_branding.json": [
            candidate_record(item)
            for item in records
            if item["possible_category"] == "Office Branding"
        ],
    }


def main() -> int:
    configure_console()
    args = parse_args()
    source_roots = [
        path.expanduser().resolve()
        for path in (args.source_roots or DEFAULT_SOURCES)
    ]
    output = args.output.expanduser().resolve()

    missing = [path for path in source_roots if not path.is_dir()]
    if missing:
        raise SystemExit("Missing source root(s):\n" + "\n".join(map(str, missing)))
    for source in source_roots:
        if output == source or source in output.parents:
            raise SystemExit("Output must not be inside any source archive root.")

    output.mkdir(parents=True, exist_ok=True)
    records, folders, errors, metadata_stats = scan(
        source_roots,
        output,
        create_previews=not args.no_previews,
        preview_size=args.preview_size,
    )

    item_fields = [
        "id", "file_name", "full_file_path", "source_root",
        "relative_folder_path", "parent_folder_name", "file_extension",
        "file_type", "file_size_bytes", "modified_date",
        "possible_project_title", "possible_category", "possible_style",
        "possible_year", "html_text_snippet", "post_text", "media_caption",
        "metadata_date", "metadata_source_path", "metadata_format",
        "relationship_id", "related_media_count",
        "metadata_inherited_from_duplicate", "preview_path",
    ]
    folder_fields = [
        "source_root", "folder_path", "folder_name", "relative_folder_path",
        "total_images", "total_videos", "total_pdfs", "total_documents",
        "total_spreadsheets", "total_presentations", "total_html", "total_json",
        "detected_category", "detected_style", "suggested_project_title",
    ]
    write_csv(output / "office_media_catalog.csv", records, item_fields)
    write_json(output / "office_media_catalog.json", {
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "source_roots": [str(path) for path in source_roots],
        "output_root": str(output),
        "recursive": True,
        "supported_extensions": sorted(EXTENSION_TYPES),
        "metadata_extraction": metadata_stats,
        "items": records,
        "errors": errors,
    })
    write_csv(output / "folder_summary.csv", folders, folder_fields)
    for name, candidates in build_candidates(records).items():
        write_json(output / name, candidates)

    type_counts = Counter(item["file_type"] for item in records)
    category_counts = Counter(item["possible_category"] for item in records)
    print(f"Source roots scanned: {len(source_roots):,}")
    print(f"Folders scanned: {len(folders):,}")
    print(f"Images found: {type_counts['image']:,}")
    print(f"Videos found: {type_counts['video']:,}")
    print(f"PDFs found: {type_counts['pdf']:,}")
    print(
        "Office documents found: "
        f"{type_counts['document'] + type_counts['spreadsheet'] + type_counts['presentation']:,}"
    )
    print(f"HTML files found: {type_counts['html']:,}")
    print(f"JSON files found: {type_counts['json']:,}")
    print(f"Facebook archive roots detected: {len(metadata_stats['archive_roots']):,}")
    print(f"Media relationships extracted: {metadata_stats['media_relationships']:,}")
    print("Items per category:")
    for category, count in sorted(category_counts.items()):
        print(f"  {category}: {count:,}")
    print(f"Output CSV: {output / 'office_media_catalog.csv'}")
    print(f"Output JSON: {output / 'office_media_catalog.json'}")
    print(f"Read errors: {len(errors):,}")
    if Image is None and not args.no_previews:
        print("Preview warning: Pillow is unavailable; no thumbnails were created.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
