# Office Archive Importer

This tool scans office archive folders recursively and builds local catalogs.
It does not move, delete, rename, modify, or upload source files.

## Run the office archive import

```powershell
python _tools/facebook-importer/import_facebook_archive.py "E:\New folder (7)\فيس بوك" "E:\FOR SHARE"
```

The importer detects extracted Facebook JSON or HTML exports beneath those roots.
It links media to post text, captions, Facebook dates, and related upload groups
where the export contains those relationships.

To rebuild the strict review-only publishing shortlist after cataloging:

```text
python _tools/facebook-importer/create_publishing_shortlist.py
```

Open `_imports/office_catalog/publishing_shortlist/review_index.html` first.
The shortlist never publishes files or copies originals into the website.

Or double-click `run-office-import.bat`.

Supported files include office images, videos, PDF and Office documents, and
HTML exports. Catalog output is written to `_imports\office_catalog`, which is
ignored by Git.

## Smart selection workflow

1. Run the office archive import.
2. Run the smart selection:

```powershell
python _tools/facebook-importer/auto_select_office_items.py
```

   Or double-click `run-auto-office-selection.bat`.
3. Open `_imports\office_catalog\smart_selection\preview_gallery.html`.
4. Open `smart_selected_items.xlsx`.
5. Review rows marked `Yes` and `Maybe`.
6. Later copy only approved items into the public website.

Smart selection ranks the local catalog using file type, dimensions, aspect
ratio, project keywords, recency, likely category, quality warnings, and
duplicate detection. It only reads catalog and source files. It does not
publish, move, rename, edit, or copy full-size archive files.

## Importer options

Skip image previews:

```powershell
python _tools/facebook-importer/import_facebook_archive.py "E:\New folder (7)\فيس بوك" "E:\FOR SHARE" --no-previews
```

Change thumbnail size:

```powershell
python _tools/facebook-importer/import_facebook_archive.py "E:\New folder (7)\فيس بوك" "E:\FOR SHARE" --preview-size 240
```
