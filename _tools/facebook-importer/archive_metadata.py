"""Extract media relationships from Facebook JSON and HTML exports."""

from __future__ import annotations

import hashlib
import html
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote


MEDIA_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm", ".mov", ".avi"}
TEXT_KEYS = {"title", "text", "post", "message", "description", "caption", "name", "content", "comment"}
DATE_KEYS = {"timestamp", "creation_timestamp", "created_timestamp", "taken_timestamp", "date", "created_time"}
URI_KEYS = {"uri", "href", "src", "path", "media_uri"}
SECTION_RE = re.compile(r"(?is)<section\b[^>]*class=[\"'][^\"']*_a6-g[^\"']*[\"'][^>]*>.*?</section>")
MEDIA_REF_RE = re.compile(r"""(?is)(?:src|href)=["']([^"']+\.(?:jpe?g|png|webp|mp4|webm|mov|avi)(?:\?[^"']*)?)["']""")
TAG_RE = re.compile(r"(?is)<[^>]+>")
SCRIPT_STYLE_RE = re.compile(r"(?is)<(?:script|style)\b.*?</(?:script|style)>")
SPACE_RE = re.compile(r"\s+")
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
MONTHS = {
    "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4,
    "مايو": 5, "يونيو": 6, "يوليو": 7, "أغسطس": 8, "اغسطس": 8,
    "سبتمبر": 9, "أكتوبر": 10, "اكتوبر": 10, "نوفمبر": 11, "ديسمبر": 12,
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5,
    "june": 6, "july": 7, "august": 8, "september": 9, "october": 10,
    "november": 11, "december": 12,
}


def clean_text(value: object, limit: int = 1200) -> str:
    text = html.unescape(str(value or ""))
    text = text.replace("\u200f", " ").replace("\u200e", " ")
    return SPACE_RE.sub(" ", text).strip()[:limit]


def html_text(fragment: str, limit: int = 1200) -> str:
    return clean_text(TAG_RE.sub(" ", SCRIPT_STYLE_RE.sub(" ", fragment)), limit)


def parse_date(text: str) -> str:
    value = clean_text(text).translate(ARABIC_DIGITS)
    if re.fullmatch(r"\d{9,13}", value):
        timestamp = int(value)
        if timestamp > 10_000_000_000:
            timestamp //= 1000
        try:
            return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
        except (OverflowError, OSError, ValueError):
            return ""
    lowered = value.casefold()
    month = next((number for name, number in MONTHS.items() if name in lowered), None)
    numbers = [int(number) for number in re.findall(r"\d+", value)]
    if month and len(numbers) >= 2:
        day, year = numbers[0], numbers[1]
        hour = numbers[2] if len(numbers) > 2 else 0
        minute = numbers[3] if len(numbers) > 3 else 0
        second = numbers[4] if len(numbers) > 4 else 0
        if ("م" in value or "pm" in lowered) and hour < 12:
            hour += 12
        if ("ص" in value or "am" in lowered) and hour == 12:
            hour = 0
        try:
            return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc).isoformat()
        except ValueError:
            return ""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except ValueError:
        return ""


def resolve_media_path(archive_root: Path, metadata_file: Path, reference: str) -> Path | None:
    raw = html.unescape(unquote(reference.split("?", 1)[0])).replace("/", "\\")
    if raw.casefold().startswith(("http:\\", "https:\\")):
        return None
    for candidate in (archive_root / raw, metadata_file.parent / raw):
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved.suffix.casefold() in MEDIA_EXTENSIONS and resolved.exists():
            return resolved
    return None


def relation_id(source: Path, index: int) -> str:
    return hashlib.sha1(f"{source}|{index}".encode("utf-8", errors="replace")).hexdigest()[:16]


def add_relation(index: dict[str, list[dict]], media_path: Path, relation: dict) -> None:
    key = str(media_path.resolve()).casefold()
    marker = (relation["relationship_id"], relation["metadata_source_path"])
    if marker not in {(item["relationship_id"], item["metadata_source_path"]) for item in index[key]}:
        index[key].append(relation)


def extract_html_relations(archive_root: Path, path: Path, index: dict[str, list[dict]]) -> int:
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 0
    blocks = SECTION_RE.findall(raw) or [raw]
    count = 0
    for block_number, block in enumerate(blocks, start=1):
        references = list(dict.fromkeys(MEDIA_REF_RE.findall(block)))
        if not references:
            continue
        date_match = re.search(r'(?is)class=["\'][^"\']*_a72d[^"\']*["\'][^>]*>(.*?)</div>', block)
        captions = [
            html_text(value, 500)
            for value in re.findall(r'(?is)class=["\'][^"\']*_3-95[^"\']*["\'][^>]*>(.*?)</div>', block)
        ]
        body_candidates = [
            html_text(value, 700)
            for value in re.findall(r'(?is)class=["\'][^"\']*_2pin[^"\']*["\'][^>]*>(.*?)</div>\s*</div>', block)
        ]
        body_candidates = [
            value for value in body_candidates
            if len(value) > 8
            and not value.startswith(("تمّ التحديث", "تم التحديث", "انقر لعرض", "الصور"))
        ]
        body_text = body_candidates[-1] if body_candidates else ""
        media_caption = next((value for value in captions if value and value != "الصور"), "")
        if body_text:
            media_caption = body_text
        relation = {
            "relationship_id": relation_id(path, block_number),
            "post_text": body_text or html_text(block),
            "media_caption": media_caption,
            "metadata_date": parse_date(html_text(date_match.group(1), 160)) if date_match else "",
            "metadata_source_path": str(path),
            "metadata_format": "html",
            "related_media_count": len(references),
        }
        for reference in references:
            media_path = resolve_media_path(archive_root, path, reference)
            if media_path:
                add_relation(index, media_path, relation)
                count += 1
    return count


def collect_json(node: object, texts: list[str], dates: list[str], references: list[str]) -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            lowered = str(key).casefold()
            if lowered in TEXT_KEYS and isinstance(value, (str, int, float)):
                if cleaned := clean_text(value):
                    texts.append(cleaned)
            elif lowered in DATE_KEYS and isinstance(value, (str, int, float)):
                if parsed := parse_date(str(value)):
                    dates.append(parsed)
            elif lowered in URI_KEYS and isinstance(value, str):
                references.append(value)
            collect_json(value, texts, dates, references)
    elif isinstance(node, list):
        for value in node:
            collect_json(value, texts, dates, references)


def extract_json_relations(archive_root: Path, path: Path, index: dict[str, list[dict]]) -> int:
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig", errors="replace"))
    except (OSError, json.JSONDecodeError):
        return 0
    entries = payload if isinstance(payload, list) else [payload]
    count = 0
    for entry_number, entry in enumerate(entries, start=1):
        texts: list[str] = []
        dates: list[str] = []
        references: list[str] = []
        collect_json(entry, texts, dates, references)
        media_paths = []
        for reference in dict.fromkeys(references):
            if media_path := resolve_media_path(archive_root, path, reference):
                media_paths.append(media_path)
        if not media_paths:
            continue
        relation = {
            "relationship_id": relation_id(path, entry_number),
            "post_text": clean_text(" | ".join(dict.fromkeys(texts))),
            "media_caption": clean_text(texts[-1] if texts else "", 500),
            "metadata_date": dates[0] if dates else "",
            "metadata_source_path": str(path),
            "metadata_format": "json",
            "related_media_count": len(media_paths),
        }
        for media_path in media_paths:
            add_relation(index, media_path, relation)
            count += 1
    return count


def find_archive_roots(source_root: Path) -> list[Path]:
    roots = []
    try:
        candidates = [source_root, *[path for path in source_root.iterdir() if path.is_dir()]]
    except OSError:
        return roots
    for candidate in candidates:
        try:
            names = {path.name.casefold() for path in candidate.iterdir() if path.is_dir()}
        except OSError:
            continue
        if "files" in names and (
            "profile_information" in names
            or "this_profile's_activity_across_facebook" in names
            or "your_facebook_activity" in names
        ):
            roots.append(candidate)
    return roots


def build_metadata_index(source_roots: list[Path]) -> tuple[dict[str, list[dict]], dict]:
    index: dict[str, list[dict]] = defaultdict(list)
    stats = {"archive_roots": [], "json_files_read": 0, "html_files_read": 0, "media_relationships": 0}
    for source_root in source_roots:
        for archive_root in find_archive_roots(source_root):
            stats["archive_roots"].append(str(archive_root))
            for path in archive_root.rglob("*"):
                if not path.is_file():
                    continue
                if path.suffix.casefold() == ".json":
                    stats["json_files_read"] += 1
                    stats["media_relationships"] += extract_json_relations(archive_root, path, index)
                elif path.suffix.casefold() in {".html", ".htm"}:
                    stats["html_files_read"] += 1
                    stats["media_relationships"] += extract_html_relations(archive_root, path, index)
    return dict(index), stats


def metadata_for(path: Path, index: dict[str, list[dict]]) -> dict:
    relations = index.get(str(path.resolve()).casefold(), [])
    if not relations:
        return {
            "post_text": "", "media_caption": "", "metadata_date": "",
            "metadata_source_path": "", "metadata_format": "",
            "relationship_id": "", "related_media_count": 0,
        }
    relations = sorted(relations, key=lambda item: item.get("metadata_date", ""), reverse=True)
    best = dict(relations[0])
    best["relationship_id"] = ",".join(dict.fromkeys(item["relationship_id"] for item in relations))
    best["related_media_count"] = max(
        len(relations), max((item.get("related_media_count", 0) for item in relations), default=0)
    )
    return best
