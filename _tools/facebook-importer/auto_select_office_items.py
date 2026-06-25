#!/usr/bin/env python3
"""Rank office archive catalog items for later human review."""
from __future__ import annotations

import csv, hashlib, html, json, re, shutil, subprocess, sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from difflib import SequenceMatcher

try:
    from PIL import Image, ImageFilter, ImageStat
except ImportError:
    Image = ImageFilter = ImageStat = None

PROJECT_ROOT = Path(r"D:\GitHub\ARCH-PORTFOLIO")
CATALOG_ROOT = PROJECT_ROOT / "_imports" / "office_catalog"
OUTPUT_ROOT = CATALOG_ROOT / "smart_selection"
TOOL_ROOT = PROJECT_ROOT / "_tools" / "facebook-importer"
INPUT_CATALOG = CATALOG_ROOT / "office_media_catalog.json"
WORKBOOK_BUILDER = TOOL_ROOT / "build_selection_workbook.mjs"

COLUMNS = [
    "Original File Name","Full Source Path","Source Root","Parent Folder",
    "File Type","Extension","File Size","Modified Date","Image Width",
    "Image Height","Aspect Ratio","Auto Score","Auto Selected",
    "Suggested Website Section","Suggested Project Title","Suggested Category",
    "Suggested Style","Suggested Use As","Duplicate Flag","Selection Reason",
    "Review Status","Notes","Preview Path",
]
CATEGORY_EXPORTS = {
    "Residential":"residential_selected.csv","Interior Design":"interior_selected.csv",
    "Government":"government_selected.csv","Commercial":"commercial_selected.csv",
    "Lighting Studies":"lighting_selected.csv",
    "Acoustics / Cinema":"cinema_acoustics_selected.csv",
    "Technical Documents":"technical_documents_selected.csv",
    "Videos":"videos_selected.csv","Branding":"branding_selected.csv",
    "Unsorted":"unsorted_maybe.csv",
}
TARGETS = {
    "Residential":40,"Interior Design":40,"Government":20,"Commercial":20,
    "Lighting Studies":20,"Acoustics / Cinema":20,"Technical Documents":20,
    "Videos":20,"Branding":10,
}
CATEGORY_KEYWORDS = {
    "Residential":["فيلا","villa","سكني","دار","بيت","منزل","استراحة","مزرعة","house","residential","واجهة","facade","معماري","architecture"],
    "Government":["بلدية","municipality","حكومي","government","موانئ","port","اداري","إداري","محافظة","boc"],
    "Commercial":["تجاري","commercial","مول","mall","مطعم","restaurant","كوفي","cafe","معرض","showroom","مكتب","office","فندق","hotel"],
    "Interior Design":["ديكور","interior","داخلي","حمام","bathroom","غرفة","bedroom","مطبخ","kitchen","مجلس","majlis","صالة","سقوف","ceiling"],
    "Lighting Studies":["انارة","إنارة","إضاءة","اضاءة","lighting","lux","lumen","spotlight"],
    "Acoustics / Cinema":["سينما","cinema","صوت","عزل صوتي","acoustic","atmos","speaker"],
    "Technical Documents":["مخطط","تقرير","دراسة","كميات","boq","pdf","tender","report","study","تنفيذ","specification","drawing"],
    "Videos":["فيديو","video","animation","reel","walkthrough","mp4","webm"],
    "Branding":["logo","شعار","بروفايل","profile","brochure","company profile","branding"],
}
STYLE_KEYWORDS = {
    "Classic / Neo Classic":["كلاسك","كلاسيك","نيو كلاسك","نيو كلاسيك","classic","neo classic","neo-classic"],
    "Modern":["مودرن","حديث","minimal","modern","contemporary"],
}
HIGH_VALUE = [
    "فيلا","villa","واجهة","facade","معماري","architecture","ديكور","interior",
    "حمام","bathroom","غرفة","bedroom","مطبخ","kitchen","مجلس","majlis",
    "سينما","cinema","انارة","إنارة","إضاءة","lighting","مشروع","project",
    "بلدية","municipality","boc","مول","mall","فندق","hotel","commercial",
    "government","رندر","render","تنفيذ","site","supervision","study","boq",
]
VIDEO_VALUE = ["walkthrough","reel","render","animation","panorama","project","construction","تنفيذ","مشروع","فيديو","جولة","360"]
PENALTIES = {
    "personal":-35,"selfie":-40,"messenger":-30,"whatsapp":-18,
    "screenshot":-30,"screen shot":-30,"gaming":-35,"game":-18,"meme":-35,
    "profile photo":-25,"profile picture":-25,"small logo":-15,"icon":-28,
    "emoji":-30,"sticker":-30,"ads":-20,"advert":-20,"download":-8,
    "cache":-15,"avatar":-28,"thumbnail":-15,"reaction":-20,"chat":-20,
    "شخصي":-35,"سيلفي":-40,"لقطة شاشة":-30,"العاب":-25,"ألعاب":-25,
    "ميم":-35,"ايقونة":-28,"أيقونة":-28,
}
TYPE_BASE = {"image":42,"video":40,"pdf":32,"document":24,"spreadsheet":26,"presentation":28,"html":20}
YEAR_RE = re.compile(r"(?<!\d)(19\d{2}|20\d{2}|21\d{2})(?!\d)")
ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩","0123456789")

def norm(v):
    return re.sub(r"\s+"," ",re.sub(r"[_\-.\\/]+"," ",str(v or "").translate(ARABIC_DIGITS).casefold())).strip()

def category(text, catalog, file_type):
    n=norm(text); scores={k:sum(norm(w) in n for w in words) for k,words in CATEGORY_KEYWORDS.items()}
    mapped={"Office Branding":"Branding","Unclassified":"Unsorted"}.get(catalog,catalog)
    if mapped in scores:scores[mapped]+=2
    if file_type=="video":scores["Videos"]+=2
    if file_type in {"pdf","document","spreadsheet","presentation","html"}:scores["Technical Documents"]+=2
    result,strength=max(scores.items(),key=lambda x:(x[1],x[0]))
    return (result if strength else "Unsorted"),strength

def style(text, existing):
    n=norm(text); scores={k:sum(norm(w) in n for w in words) for k,words in STYLE_KEYWORDS.items()}
    result,strength=max(scores.items(),key=lambda x:x[1])
    return result if strength else existing or ""

def year_for(item):
    text=f"{item.get('possible_year','')} {item.get('relative_folder_path','')} {item.get('file_name','')}".translate(ARABIC_DIGITS)
    m=YEAR_RE.search(text)
    if m:return int(m.group(1))
    try:return datetime.fromisoformat(item["modified_date"]).year
    except Exception:return None

def metrics(path):
    if Image is None:return 0,0,0,None
    try:
        with Image.open(path) as im:
            w,h=im.size; ratio=w/h if h else 0; blur=None
            if w*h<=40_000_000:
                t=im.convert("L");t.thumbnail((256,256),Image.Resampling.BILINEAR)
                blur=ImageStat.Stat(t.filter(ImageFilter.FIND_EDGES)).var[0]
            return w,h,ratio,blur
    except Exception:return 0,0,0,None

def ratio_score(r):
    if not r:return 0,""
    prefs=[(16/9,"16:9"),(4/3,"4:3"),(3/2,"3:2")]
    label,delta=min(((label,abs(r-target)/target) for target,label in prefs),key=lambda x:x[1])
    if delta<=.08:return 12,label
    if 1.2<=r<=2.15:return 7,"landscape"
    if r<.72:return -4,"portrait"
    if r>2.8:return -5,"ultrawide"
    return 0,""

def suggest_use(ft,cat,w,h,r,score):
    if score<25:return "Ignore"
    if ft=="video":return "Video Reel"
    if ft in {"pdf","document","spreadsheet","presentation","html"}:
        return "Knowledge Study" if cat in {"Lighting Studies","Acoustics / Cinema"} else "Document Preview"
    if cat=="Branding":return "Branding Asset"
    if ft=="image":
        if score>=82 and r>=1.45 and w>=1800:return "Hero Image"
        if score>=62 and r>=1.15:return "Project Card"
        if cat in {"Acoustics / Cinema","Interior Design"} and r>=1.2:return "Panorama Preview"
        return "Gallery Image"
    return "Ignore"

def score_item(item):
    ft=item["file_type"]; text=" ".join(str(item.get(k,"")) for k in ["file_name","relative_folder_path","parent_folder_name","possible_project_title","possible_category","possible_style","html_text_snippet","post_text","media_caption","metadata_date"])
    n=norm(text); score=float(TYPE_BASE.get(ft,4)); reasons=[f"{ft} priority"]
    cat,strength=category(text,item.get("possible_category",""),ft)
    if strength:
        b=min(strength*5,25);score+=b;reasons.append(f"{cat} keywords +{b}")
    hits=sum(norm(k) in n for k in HIGH_VALUE); b=min(hits,6)*4
    if b:score+=b;reasons.append(f"project keywords +{b}")
    if ft=="video":
        b=min(sum(norm(k) in n for k in VIDEO_VALUE),6)*5;score+=b
        if b:reasons.append(f"project video +{b}")
    p=sum(v for k,v in PENALTIES.items() if norm(k) in n)
    if p:score+=p;reasons.append(f"low-value keywords {p}")
    size=int(item.get("file_size_bytes") or 0);w=h=0;r=0;blur=None
    if ft=="image":
        w,h,r,blur=metrics(Path(item["full_file_path"]));px=w*h
        if px>=12_000_000:score+=18;reasons.append("very high resolution +18")
        elif px>=4_000_000:score+=14;reasons.append("high resolution +14")
        elif px>=2_000_000:score+=10;reasons.append("good resolution +10")
        elif px>=800_000:score+=5
        elif px and px<250_000:score-=25;reasons.append("tiny image -25")
        elif not px:score-=12;reasons.append("dimensions unavailable -12")
        b,label=ratio_score(r);score+=b
        if b:reasons.append(f"{label} ratio {b:+g}")
        if w and h and w<500 and h<500:score-=18
        if blur is not None and blur<35 and px>500_000:score-=12;reasons.append("possible blur -12")
    elif ft=="video":
        if size>=100_000_000:score+=10
        elif size>=20_000_000:score+=7
        elif size<500_000:score-=18
    elif ft in {"pdf","document","spreadsheet","presentation"}:
        if size>=1_000_000:score+=8
        elif size<20_000:score-=8
    yr=year_for(item)
    if yr and 2021<=yr<=2026:score+=12;reasons.append("recent 2021-2026 +12")
    elif yr and 2019<=yr<=2020:score+=6
    elif yr and yr<2010:score-=3
    score=round(max(0,min(score,100)),1)
    return {"item":item,"year":yr,"w":w,"h":h,"ratio":r,"blur":blur,"category":cat,
            "style":style(text,item.get("possible_style","")),"use":suggest_use(ft,cat,w,h,r,score),
            "score":score,"reasons":"; ".join(reasons),"duplicate":""}

def mark_duplicates(rows):
    groups=defaultdict(list)
    for row in rows:
        i=row["item"]; stem=re.sub(r"[\s_-]+","",Path(i["file_name"]).stem.casefold())
        groups[("name",stem,i["file_size_bytes"])].append(row)
        if row["w"] and row["h"]:
            groups[("media",i["file_size_bytes"],row["w"],row["h"],norm(i["parent_folder_name"]))].append(row)
    duplicate_ids=set(); group_no=0
    for candidates in groups.values():
        unique={x["item"]["id"]:x for x in candidates}
        if len(unique)<2:continue
        group_no+=1; ranked=sorted(unique.values(),key=lambda x:x["score"],reverse=True)
        keeper=ranked[0];keeper["duplicate"]=f"Best of duplicate group {group_no}"
        for dup in ranked[1:]:
            dup["duplicate"]=f"Duplicate of ID {keeper['item']['id']}"
            dup["score"]=max(0,dup["score"]-35);dup["reasons"]+="; duplicate penalty -35"
            duplicate_ids.add(dup["item"]["id"])
    return len(duplicate_ids)

def assign(rows):
    for r in rows:r["selection"]="No" if r["duplicate"].startswith("Duplicate of") or r["score"]<45 else "Maybe"
    grouped=defaultdict(list)
    for r in rows:
        if not r["duplicate"].startswith("Duplicate of") and r["score"]>=45:grouped[r["category"]].append(r)
    for cat,target in TARGETS.items():
        candidates=sorted(grouped.get(cat,[]),key=lambda x:x["score"],reverse=True)
        for r in candidates[:target]:r["selection"]="Yes"

def output_row(r):
    i=r["item"]; sections={"Residential":"Architecture / Residential","Government":"Architecture / Government",
    "Commercial":"Architecture / Commercial","Interior Design":"Interior Design",
    "Lighting Studies":"Engineering Knowledge Center","Acoustics / Cinema":"Knowledge Center / Cinema & Acoustics",
    "Technical Documents":"Document Library / Knowledge Center","Videos":"Videos",
    "Branding":"About Office / Branding","Unsorted":"Manual Review"}
    return {
        "Original File Name":i["file_name"],"Full Source Path":i["full_file_path"],
        "Source Root":i["source_root"],"Parent Folder":i["parent_folder_name"],
        "File Type":i["file_type"],"Extension":i["file_extension"],"File Size":i["file_size_bytes"],
        "Modified Date":i["modified_date"],"Image Width":r["w"] or "","Image Height":r["h"] or "",
        "Aspect Ratio":round(r["ratio"],3) if r["ratio"] else "","Auto Score":r["score"],
        "Auto Selected":r["selection"],"Suggested Website Section":sections[r["category"]],
        "Suggested Project Title":i["possible_project_title"],"Suggested Category":r["category"],
        "Suggested Style":r["style"],"Suggested Use As":r["use"],"Duplicate Flag":r["duplicate"],
        "Selection Reason":r["reasons"],"Review Status":"Pending",
        "Notes":f"Edge variance: {r['blur']:.1f}" if r["blur"] is not None else "",
        "Preview Path":i.get("preview_path",""),
    }

def write_csv(path,rows):
    with path.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=COLUMNS);w.writeheader();w.writerows(rows)

def copy_previews(rows):
    out=OUTPUT_ROOT/"previews";out.mkdir(parents=True,exist_ok=True);mapping={}
    for idx,row in enumerate(rows[:500],1):
        rel=row["Preview Path"]
        if not rel:continue
        src=CATALOG_ROOT/rel
        if not src.is_file():continue
        digest=hashlib.sha1(row["Full Source Path"].encode("utf-8")).hexdigest()[:10]
        dst=out/f"{idx:04d}-{digest}.jpg"
        if not dst.exists():shutil.copy2(src,dst)
        mapping[row["Full Source Path"]]=dst.relative_to(OUTPUT_ROOT).as_posix()
    return mapping

def write_gallery(rows,mapping):
    cards=[]
    for row in rows[:500]:
        preview=mapping.get(row["Full Source Path"],"")
        media=f'<img src="{html.escape(preview)}" alt="">' if preview else '<div class="none">No preview</div>'
        cards.append(f'<article>{media}<div><span>{html.escape(row["Suggested Category"])}</span><h2>{html.escape(row["Suggested Project Title"])}</h2><p>{html.escape(row["Original File Name"])}</p><b>{row["Auto Score"]} · {row["Auto Selected"]}</b><br><a href="{Path(row["Full Source Path"]).as_uri()}">Open source</a></div></article>')
    page=f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Smart Selection</title><style>body{{margin:0;background:#f5f3ee;color:#171715;font:14px Arial}}header{{padding:40px 5vw;background:#171715;color:white}}h1{{font-weight:400}}main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;padding:24px 5vw}}article{{overflow:hidden;background:white;border:1px solid #ddd8cf;border-radius:16px}}article img,.none{{width:100%;aspect-ratio:16/10;object-fit:cover;background:#ddd;display:grid;place-items:center}}article div{{padding:18px}}span{{color:#9b7c47;font-size:10px}}h2{{font-size:20px}}p{{color:#777;overflow-wrap:anywhere}}a{{color:#745d36}}</style></head><body><header><h1>Office Smart Selection</h1><p>Top {min(500,len(rows))} candidates. Sources remain read-only.</p></header><main>{"".join(cards)}</main></body></html>'''
    (OUTPUT_ROOT/"preview_gallery.html").write_text(page,encoding="utf-8")

def build_workbook(summary_path):
    dep=Path.home()/".cache/codex-runtimes/codex-primary-runtime/dependencies"
    node=dep/"node/bin/node.exe";modules=dep/"node/node_modules"
    runtime=TOOL_ROOT/".artifact_runtime";junction=runtime/"node_modules";runtime.mkdir(parents=True,exist_ok=True)
    if not junction.exists():subprocess.run(["cmd","/c","mklink","/J",str(junction),str(modules)],check=True,capture_output=True)
    runtime_builder=runtime/"build_selection_workbook.mjs"
    shutil.copy2(WORKBOOK_BUILDER,runtime_builder)
    subprocess.run([str(node),str(runtime_builder),str(OUTPUT_ROOT),str(summary_path)],cwd=runtime,check=True)

def main():
    if hasattr(sys.stdout,"reconfigure"):sys.stdout.reconfigure(encoding="utf-8",errors="replace")
    if not INPUT_CATALOG.is_file():raise SystemExit(f"Catalog not found: {INPUT_CATALOG}")
    OUTPUT_ROOT.mkdir(parents=True,exist_ok=True);(OUTPUT_ROOT/"by_category").mkdir(exist_ok=True)
    items=json.loads(INPUT_CATALOG.read_text(encoding="utf-8"))["items"];print(f"Reviewing {len(items):,} catalog items...")
    scored=[]
    for idx,item in enumerate(items,1):
        scored.append(score_item(item))
        if idx%2500==0:print(f"  scored {idx:,}/{len(items):,}")
    duplicates=mark_duplicates(scored);assign(scored);scored.sort(key=lambda x:x["score"],reverse=True)
    rows=[output_row(x) for x in scored]
    write_csv(OUTPUT_ROOT/"smart_selected_items.csv",rows)
    for n in [100,200,500]:write_csv(OUTPUT_ROOT/f"selected_top_{n}.csv",rows[:n])
    write_csv(OUTPUT_ROOT/"rejected_low_quality.csv",[x for x in rows if x["Auto Selected"]=="No"])
    write_csv(OUTPUT_ROOT/"duplicate_candidates.csv",[x for x in rows if x["Duplicate Flag"]])
    for cat,name in CATEGORY_EXPORTS.items():write_csv(OUTPUT_ROOT/"by_category"/name,[x for x in rows if x["Suggested Category"]==cat and x["Auto Selected"] in {"Yes","Maybe"}])
    selections=Counter(x["Auto Selected"] for x in rows);cats=Counter(x["Suggested Category"] for x in rows);uses=Counter(x["Suggested Use As"] for x in rows)
    summary={"generated_utc":datetime.now(timezone.utc).isoformat(),"catalog_source":str(INPUT_CATALOG),"output_root":str(OUTPUT_ROOT),"total_files_reviewed":len(rows),"auto_selected":dict(selections),"duplicates_detected":duplicates,"items_per_category":dict(sorted(cats.items())),"items_per_suggested_use":dict(sorted(uses.items())),"selection_targets":TARGETS,"top_score":rows[0]["Auto Score"] if rows else 0}
    summary_path=OUTPUT_ROOT/"selection_summary.json";summary_path.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding="utf-8")
    mapping=copy_previews(rows);write_gallery(rows,mapping);build_workbook(summary_path)
    print(f"Total files reviewed: {len(rows):,}");print(f"Auto Selected Yes: {selections['Yes']:,}");print(f"Auto Selected Maybe: {selections['Maybe']:,}");print(f"Auto Selected No: {selections['No']:,}");print(f"Duplicates detected: {duplicates:,}")
    for cat,count in cats.most_common():print(f"  {cat}: {count:,}")
    print(f"Output folder: {OUTPUT_ROOT}")
    return 0
if __name__=="__main__":raise SystemExit(main())
