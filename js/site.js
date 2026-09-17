const nestedPage = window.location.pathname.includes('/panorama/');
const rootPrefix = nestedPage ? '../' : '';
const dataFiles = ['residential', 'commercial', 'government', 'interiors', 'panorama', 'knowledge', 'documents', 'videos'];
const dataCache = new Map();

const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

const pathFor = (path = '') => {
  if (!path || /^(https?:|mailto:|tel:|#)/.test(path)) return path;
  return `${rootPrefix}${path}`;
};

const mediaTypes = new Set(['image', 'gallery', 'video', 'pdf', 'heyzine', 'panorama', 'pano2vr', 'external']);
const viewerMediaTypes = new Set(['gallery', 'video', 'pdf', 'heyzine', 'panorama', 'pano2vr']);
const projectSections = ['commercial', 'residential', 'government', 'interiors'];
const detailSections = [...projectSections, 'panorama'];

function isProjectSection(section = '') {
  return projectSections.includes(String(section || '').trim().toLowerCase());
}

function normalizeMediaType(type = '') {
  const normalized = String(type || '').trim().toLowerCase();
  return mediaTypes.has(normalized) ? normalized : '';
}

function isExternalUrl(url = '') {
  return /^https?:\/\//i.test(String(url || '').trim());
}

function isPdfUrl(url = '') {
  return /\.pdf(?:[?#].*)?$/i.test(String(url || '').trim());
}

function isVideoUrl(url = '') {
  return /\.(mp4|webm|mov|avi)(?:[?#].*)?$/i.test(String(url || '').trim())
    || /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(String(url || '').trim());
}

function isHeyzineUrl(url = '') {
  return /https?:\/\/(?:www\.)?heyzine\.com\/flip-book\//i.test(String(url || '').trim());
}

function hasGallery(item = {}) {
  return Array.isArray(item.gallery) && item.gallery.length > 0;
}

function getThumbnail(item = {}) {
  return item.thumbnail || item.image || 'assets/profile.jpg';
}

function normalizeIdentityText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ');
}

function hashText(value = '') {
  const text = normalizeIdentityText(value);
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(6, '0');
}

function getContentIdentity(item = {}, section = '', index = 0) {
  const source = String(section || item._section || item.section || '').trim().toLowerCase() || 'unknown';
  const id = String(item.id || '').trim();
  if (id) {
    return { key: id, source, stable: true, detailId: id };
  }

  const slug = String(item.slug || '').trim();
  if (slug) {
    return { key: slug, source, stable: true, detailId: slug };
  }

  const titleText = normalizeIdentityText(item.title || item.subtitle || '');
  const fallbackSeed = titleText || `${source}:row:${Number(index) || 0}`;
  const fallbackKey = `legacy:${source}:${hashText(fallbackSeed)}`;
  const legacyDetailId = asciiSlug(item.title || item.subtitle || '') || fallbackKey;
  return { key: fallbackKey, source, stable: false, detailId: legacyDetailId };
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function normalizeStatus(value = '') {
  const status = String(value || '').trim().toLowerCase();
  return ['published', 'draft', 'hidden'].includes(status) ? status : 'published';
}

function defaultCategoryForSection(section = '') {
  const labels = {
    residential: 'Residential',
    commercial: 'Commercial',
    government: 'Government',
    interiors: 'Interior Design',
    documents: 'Documents',
    panorama: 'Panorama 360',
    videos: 'Videos',
    knowledge: 'Knowledge'
  };
  return labels[String(section || '').trim().toLowerCase()] || '';
}

function normalizeContentItem(item = {}, section = '', index = 0) {
  const source = String(section || item._section || item.section || '').trim().toLowerCase() || 'unknown';
  const identity = getContentIdentity(item, source, index);
  const image = String(item.image || item.thumbnail || 'assets/profile.jpg').trim();
  const thumbnail = String(item.thumbnail || item.image || image || 'assets/profile.jpg').trim();

  return {
    ...item,
    _section: source,
    section: item.section || source,
    _source_index: Number.isFinite(Number(index)) ? Number(index) : 0,
    _identity: identity,
    _project_id: identity.key,
    image,
    thumbnail,
    category: item.category || defaultCategoryForSection(source),
    status: normalizeStatus(item.status),
    gallery: normalizeList(item.gallery),
    pdf: String(item.pdf || '').trim(),
    video: String(item.video || '').trim(),
    panorama: String(item.panorama || '').trim(),
    url: String(item.url || '').trim(),
    type: normalizeMediaType(item.type) || String(item.type || '').trim(),
    viewer_style: item.viewer_style || item.viewerStyle || '',
    tags: normalizeTags(item.tags)
  };
}

function normalizeAssetTarget(target = '') {
  const value = String(target || '').trim().replace(/\\/g, '/');
  if (!value) return '';

  if (isExternalUrl(value)) {
    try {
      const url = new URL(value);
      url.protocol = url.protocol.toLowerCase();
      url.hostname = url.hostname.toLowerCase();
      url.hash = '';
      return url.toString();
    } catch (error) {
      return value.replace(/#.*$/, '').toLowerCase();
    }
  }

  return value
    .replace(/^[.][/]+/, '')
    .replace(/\/+/g, '/')
    .replace(/[?#].*$/, '')
    .toLowerCase();
}

function runtimeIdSegment(value = '') {
  return String(value || '')
    .trim()
    .replace(/[\\/#?&\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function makeDerivedAssetId(identity = {}, type = 'image', role = 'primary', order = 0) {
  const source = runtimeIdSegment(identity.source || 'unknown');
  const key = runtimeIdSegment(identity.key || identity.detailId || 'item');
  const mediaType = runtimeIdSegment(type || 'image');
  const assetRole = runtimeIdSegment(role || 'primary');
  const assetOrder = Number.isFinite(Number(order)) ? Number(order) : 0;
  return `asset:${source}:${key}:${mediaType}:${assetRole}:${assetOrder}`;
}

function createDerivedAsset(item, identity, type, role, target, order, extras = {}) {
  const mediaType = normalizeMediaType(type) || type;
  const resolvedTarget = String(target || '').trim();
  return {
    asset_id: makeDerivedAssetId(identity, mediaType, role, order),
    project_id: identity.key,
    project_section: identity.source,
    source_section: identity.source,
    source_index: Number.isFinite(Number(item._source_index)) ? Number(item._source_index) : 0,
    type: mediaType,
    role,
    title: extras.title || item.title || item.subtitle || '',
    subtitle: extras.subtitle || item.subtitle || '',
    category: extras.category || item.category || defaultCategoryForSection(identity.source),
    style: extras.style || item.style || mediaType,
    description: extras.description || item.description || '',
    thumbnail: extras.thumbnail || getThumbnail(item),
    target: resolvedTarget,
    viewer_style: mediaType === 'pdf' ? getPdfViewerStyle(item, extras) : '',
    status: normalizeStatus(item.status),
    order,
    tags: Array.isArray(item.tags) ? [...item.tags] : normalizeTags(item.tags),
    derived: true,
    ...extras
  };
}

function extractAssetsFromItem(item = {}, section = '', index = 0) {
  const normalized = item._identity ? item : normalizeContentItem(item, section, index);
  const identity = normalized._identity || getContentIdentity(normalized, section, index);
  const assets = [];
  const seen = new Set();

  const addAsset = (type, role, target, order, extras = {}) => {
    const mediaType = normalizeMediaType(type) || type;
    const actualTarget = String(target || '').trim();
    if (!mediaType || !actualTarget) return;
    const dedupeKey = `${mediaType}:${role}:${normalizeAssetTarget(actualTarget)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    assets.push(createDerivedAsset(normalized, identity, mediaType, role, actualTarget, order, extras));
  };

  addAsset('image', 'cover', getThumbnail(normalized), 0);
  normalized.gallery.forEach((target, galleryIndex) => {
    addAsset('gallery', 'gallery', target, galleryIndex, {
      title: `${normalized.title || 'Gallery'} · ${galleryIndex + 1}`
    });
  });

  const explicitType = normalizeMediaType(normalized.type);
  const url = normalized.url;

  if (normalized.pdf || (explicitType === 'pdf' && isPdfUrl(url))) {
    addAsset('pdf', 'primary', normalized.pdf || url, 0);
  }

  if (normalized.video || (explicitType === 'video' && url)) {
    addAsset('video', 'primary', normalized.video || url, 0);
  }

  if (normalized.panorama || ((explicitType === 'panorama' || explicitType === 'pano2vr') && url)) {
    addAsset(explicitType === 'pano2vr' ? 'pano2vr' : 'panorama', 'primary', normalized.panorama || url, 0);
  }

  if (explicitType === 'heyzine' || isHeyzineUrl(url)) {
    addAsset('heyzine', 'primary', url, 0);
  } else if (explicitType === 'external' || (url && isExternalUrl(url) && !isVideoUrl(url) && !isPdfUrl(url))) {
    addAsset('external', 'primary', url, 0);
  }

  return assets;
}

function assetReference(asset = {}) {
  return {
    project_id: asset.project_id || '',
    source_section: asset.source_section || '',
    source_index: Number.isFinite(Number(asset.source_index)) ? Number(asset.source_index) : 0,
    asset_id: asset.asset_id || ''
  };
}

function mergeAssetReferences(existing = [], next = []) {
  const merged = [];
  const seen = new Set();
  [...existing, ...next].forEach((reference) => {
    const value = reference || {};
    const key = [
      value.project_id || '',
      value.source_section || '',
      value.source_index || 0,
      value.asset_id || ''
    ].join(':');
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(value);
  });
  return merged;
}

function assetMetadataRank(asset = {}) {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!asset.derived && asset.status === 'published') return 30;
  if (!asset.derived && isLocalhost && asset.status !== 'hidden') return 20;
  if (asset.derived) return 10;
  return 0;
}

function mergeStandaloneAndDerivedAssets(standalone = [], derived = []) {
  const merged = new Map();
  const add = (asset = {}, defaultDerived = false) => {
    const type = normalizeMediaType(asset.type) || asset.type || 'external';
    const target = String(asset.target || asset.url || asset.pdf || asset.video || asset.panorama || '').trim();
    const normalizedTarget = normalizeAssetTarget(target);
    if (!type || !normalizedTarget) return;

    const prepared = {
      ...asset,
      type,
      target,
      status: normalizeStatus(asset.status),
      derived: asset.derived ?? defaultDerived
    };
    const refs = mergeAssetReferences(prepared.project_refs, [assetReference(prepared)]);
    prepared.project_refs = refs;

    const key = `${type}:${normalizedTarget}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, prepared);
      return;
    }

    const preparedRank = assetMetadataRank(prepared);
    const existingRank = assetMetadataRank(existing);
    const winner = { ...(preparedRank > existingRank ? prepared : existing) };
    winner.project_refs = mergeAssetReferences(existing.project_refs, prepared.project_refs);
    const projectRef = primaryProjectReference(winner);
    if (projectRef) {
      winner.project_id = winner.project_id || projectRef.project_id || '';
      winner.project_section = winner.project_section || projectRef.source_section || '';
    }
    merged.set(key, winner);
  };

  standalone.forEach((asset) => add(asset, false));
  derived.forEach((asset) => add(asset, true));
  return [...merged.values()];
}

function isMediaDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('mediaDebug') || window.localStorage.getItem('archMediaDebug') === '1';
  } catch (error) {
    return false;
  }
}

function debugContentItem(item = {}, section = '', index = 0) {
  const normalized = normalizeContentItem(item, section || item._section || item.section || '', index);
  const assets = extractAssetsFromItem(normalized, normalized._section, normalized._source_index);
  return {
    identity: normalized._identity,
    normalized,
    assets
  };
}

const aggregationConfigs = {
  documents: {
    standaloneSource: 'documents',
    derivedTypes: new Set(['pdf'])
  },
  panorama: {
    standaloneSource: 'panorama',
    derivedTypes: new Set(['panorama', 'pano2vr'])
  },
  videos: {
    standaloneSource: 'videos',
    derivedTypes: new Set(['video'])
  }
};

function createStandaloneAsset(item = {}, source = '', index = 0) {
  const normalized = item._identity ? item : normalizeContentItem(item, source, index);
  const mediaType = detectMediaType(normalized, source || normalized._section);
  const target = getMediaTarget(normalized, mediaType, source || normalized._section);
  if (!target) return null;

  const identity = normalized._identity || getContentIdentity(normalized, source || normalized._section, index);
  return {
    ...normalized,
    asset_id: normalized.asset_id || makeDerivedAssetId(identity, mediaType, 'standalone', normalized._source_index || index),
    source_section: source || normalized._section,
    source_index: Number.isFinite(Number(normalized._source_index)) ? Number(normalized._source_index) : index,
    type: mediaType,
    role: 'standalone',
    title: normalized.title || normalized.subtitle || '',
    subtitle: normalized.subtitle || '',
    category: normalized.category || defaultCategoryForSection(source || normalized._section),
    style: normalized.style || mediaType,
    description: normalized.description || '',
    thumbnail: getThumbnail(normalized),
    target,
    viewer_style: mediaType === 'pdf' ? getPdfViewerStyle(normalized) : '',
    status: normalizeStatus(normalized.status),
    tags: normalizeTags(normalized.tags),
    derived: false,
    project_refs: Array.isArray(normalized.project_refs) ? normalized.project_refs : []
  };
}

function primaryProjectReference(asset = {}) {
  const refs = Array.isArray(asset.project_refs) ? asset.project_refs : [];
  return refs.find((reference) => reference && isProjectSection(reference.source_section) && reference.project_id)
    || (isProjectSection(asset.source_section) && asset.project_id
      ? { project_id: asset.project_id, source_section: asset.source_section, source_index: asset.source_index || 0 }
      : null);
}

function assetToRenderableItem(asset = {}, fallbackSource = '') {
  const mediaType = normalizeMediaType(asset.type) || asset.type || 'external';
  const target = String(asset.target || asset.url || asset.pdf || asset.video || asset.panorama || '').trim();
  const projectRef = primaryProjectReference(asset);
  const source = fallbackSource || asset._section || asset.section || asset.source_section || '';
  const thumbnail = asset.thumbnail || asset.image || 'assets/profile.jpg';
  const item = {
    ...asset,
    _section: source,
    section: source,
    _source_index: Number.isFinite(Number(asset.source_index)) ? Number(asset.source_index) : 0,
    id: asset.id || asset.asset_id || '',
    slug: asset.slug || asset.asset_id || '',
    title: asset.title || asset.subtitle || '',
    subtitle: asset.subtitle || '',
    category: asset.category || (asset.derived ? 'Project Media' : defaultCategoryForSection(source)),
    style: asset.style || mediaType,
    description: asset.description || (asset.derived ? 'محتوى مرتبط بمشروع ضمن أعمال المكتب.' : ''),
    image: thumbnail,
    thumbnail,
    type: mediaType,
    url: asset.url || target,
    pdf: mediaType === 'pdf' ? target : (asset.pdf || ''),
    video: mediaType === 'video' ? target : (asset.video || ''),
    panorama: (mediaType === 'panorama' || mediaType === 'pano2vr') ? target : (asset.panorama || ''),
    gallery: normalizeList(asset.gallery),
    tags: normalizeTags(asset.tags),
    status: normalizeStatus(asset.status),
    viewer_style: mediaType === 'pdf' ? getPdfViewerStyle(asset) : (asset.viewer_style || ''),
    derived: Boolean(asset.derived),
    target,
    project_refs: Array.isArray(asset.project_refs) ? asset.project_refs : [],
    project_id: asset.project_id || projectRef?.project_id || '',
    project_section: asset.project_section || projectRef?.source_section || ''
  };
  item._identity = {
    key: item.id || makeDerivedAssetId({ source, key: target || item.title || 'asset' }, mediaType, 'runtime', item._source_index),
    source,
    stable: true,
    detailId: item.id || ''
  };
  return item;
}

async function getAggregatedAssets(type = '', standaloneItems = [], projectSources = projectSections) {
  const config = aggregationConfigs[type];
  if (!config) return standaloneItems;

  const standaloneAssets = standaloneItems
    .map((item, index) => createStandaloneAsset(item, config.standaloneSource, index))
    .filter(Boolean);

  const projectCollections = await Promise.all(
    projectSources.map(async (source) => ({ source, items: await loadData(source).catch(() => []) }))
  );

  const derivedAssets = projectCollections.flatMap(({ source, items }) => items.flatMap((item, index) => {
    const normalized = item._identity ? item : normalizeContentItem(item, source, index);
    return extractAssetsFromItem(normalized, source, normalized._source_index || index)
      .filter((asset) => config.derivedTypes.has(normalizeMediaType(asset.type) || asset.type));
  }));

  return mergeStandaloneAndDerivedAssets(standaloneAssets, derivedAssets)
    .map((asset) => assetToRenderableItem(asset, config.standaloneSource));
}

function getProjectDetailUrl(item = {}) {
  const section = item._section || item.section || '';
  if (!section || !detailSections.includes(section)) return '';

  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isDraft = item.status && item.status !== 'published';
  const previewParam = (isLocalhost && isDraft) ? '&preview=1' : '';
  const identity = item._identity || getContentIdentity(item, section, item._source_index || 0);
  const slug = identity.detailId || item.id || item.slug || asciiSlug(item.title);

  if (slug) return `project-detail.html?section=${encodeURIComponent(section)}&id=${encodeURIComponent(slug)}${previewParam}`;
  if (item.title) return `project-detail.html?section=${encodeURIComponent(section)}&title=${encodeURIComponent(item.title)}${previewParam}`;
  return '';
}

function detectMediaType(item = {}, context = '') {
  const explicitType = normalizeMediaType(item.type);
  if (explicitType) return explicitType;

  const contextName = typeof context === 'string'
    ? context
    : (context && (context.source || context.render || context.section)) || '';
  const section = item._section || contextName;

  // Keep legacy project behavior conservative: a project can have video/pdf/panorama
  // as extra resources without becoming a media-only card.
  if (projectSections.includes(section)) return 'image';

  if (section === 'videos') return 'video';
  if (section === 'panorama') return 'panorama';
  if (section === 'documents') {
    if (isHeyzineUrl(item.url)) return 'heyzine';
    if (item.pdf || isPdfUrl(item.url)) return 'pdf';
    if (isExternalUrl(item.url)) return 'external';
    return 'image';
  }
  if (section === 'knowledge') {
    if (isHeyzineUrl(item.url)) return 'heyzine';
    if (item.pdf || isPdfUrl(item.url)) return 'pdf';
    if (hasGallery(item)) return 'gallery';
    if (isExternalUrl(item.url)) return 'external';
    return 'image';
  }

  if (item.video || isVideoUrl(item.url)) return 'video';
  if (isHeyzineUrl(item.url)) return 'heyzine';
  if (item.panorama) return 'panorama';
  if (item.pdf || isPdfUrl(item.url)) return 'pdf';
  if (hasGallery(item)) return 'gallery';
  if (isExternalUrl(item.url)) return 'external';
  return 'image';
}

function getMediaTarget(item = {}, type = '', context = '') {
  const mediaType = normalizeMediaType(type) || detectMediaType(item, context);
  const detailUrl = getProjectDetailUrl(item);
  const firstGalleryImage = hasGallery(item) ? item.gallery[0] : '';

  switch (mediaType) {
    case 'video':
      return item.video || item.url || detailUrl || getThumbnail(item);
    case 'pdf':
      return item.pdf || item.url || detailUrl || '';
    case 'heyzine':
      return item.url || detailUrl || '';
    case 'panorama':
    case 'pano2vr':
      return item.panorama || item.url || detailUrl || '';
    case 'gallery':
      return firstGalleryImage || item.url || getThumbnail(item);
    case 'external':
      return item.url || item.video || item.panorama || item.pdf || detailUrl || '';
    case 'image':
    default:
      return detailUrl || item.url || item.panorama || item.pdf || item.video || firstGalleryImage || getThumbnail(item);
  }
}

function getMediaOpenMode(item = {}, type = '', context = '') {
  const mediaType = normalizeMediaType(type) || detectMediaType(item, context);
  const target = getMediaTarget(item, mediaType, context);
  if (!target) return 'disabled';
  if (['video', 'pdf', 'heyzine', 'panorama', 'pano2vr', 'external'].includes(mediaType)) return 'new-tab';
  if (isExternalUrl(target)) return 'new-tab';
  return 'same-tab';
}

function linkOptionsForMedia(item = {}, type = '', context = '') {
  return getMediaOpenMode(item, type, context) === 'new-tab'
    ? 'target="_blank" rel="noopener"'
    : '';
}

function getPdfViewerStyle(item = {}, overrides = {}) {
  const value = String(
    overrides.viewer_style ||
    overrides.viewerStyle ||
    item.viewer_style ||
    item.viewerStyle ||
    ''
  ).trim().toLowerCase();
  return value === 'flipbook' ? 'flipbook' : 'standard';
}

function mediaViewerAttributes(item = {}, type = '', context = '', overrides = {}) {
  const mediaType = normalizeMediaType(type) || detectMediaType(item, context);
  if (!viewerMediaTypes.has(mediaType)) return '';

  const target = overrides.target || getMediaTarget(item, mediaType, context);
  if (!target) return '';

  const gallery = Array.isArray(overrides.gallery)
    ? overrides.gallery
    : (hasGallery(item) ? item.gallery : []);
  const index = Number.isFinite(Number(overrides.index)) ? Number(overrides.index) : 0;

  const attributes = {
    'data-media-viewer': 'true',
    'data-media-type': mediaType,
    'data-media-target': target,
    'data-media-title': overrides.title || item.title || item.subtitle || '',
    'data-media-gallery': JSON.stringify(gallery),
    'data-media-index': String(index)
  };
  if (mediaType === 'pdf') {
    attributes['data-media-viewer-style'] = getPdfViewerStyle(item, overrides);
  }

  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${escapeHTML(value)}"`)
    .join(' ');
}

const imageMarkup = (item, className = '') => {
  const source = pathFor(getThumbnail(item));
  const fallback = pathFor('assets/logo.png');
  return `<img class="${className}" src="${escapeHTML(source)}" alt="${escapeHTML(item.title || 'صورة مؤقتة')}" loading="lazy" data-fallback="${escapeHTML(fallback)}">`;
};

const linkMarkup = (href, label, className = '', options = '') => href
  ? `<a class="${className}" href="${escapeHTML(pathFor(href))}" ${options}>${label}</a>`
  : `<span class="${className} is-disabled" aria-disabled="true">${label}</span>`;

async function loadData(name) {
  if (dataCache.has(name)) return dataCache.get(name);
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const request = fetch(`${rootPrefix}data/${name}.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load ${name}.json`);
      return response.json();
    })
    .then((items) => {
      if (!Array.isArray(items)) return [];
      const normalizedItems = items.map((item, index) => normalizeContentItem(item, name, index));
      // On localhost: show all items (including drafts) so you can review before publishing
      // On GitHub Pages: only show published items
      const visibleItems = isLocalhost
        ? normalizedItems
        : normalizedItems.filter(item => !item.status || item.status === "published");
      return visibleItems;
    });
  dataCache.set(name, request);
  return request;
}

function asciiSlug(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

function projectCard(item, index) {
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isDraft = item.status && item.status !== 'published';
  const explicitMediaType = normalizeMediaType(item.type);
  const mediaType = detectMediaType(item, 'project-card');

  // Draft badge shown only on localhost
  const draftBadge = (isLocalhost && isDraft)
    ? `<span style="position:absolute;top:8px;right:8px;background:#c0392b;color:#fff;font-size:10px;padding:3px 8px;border-radius:4px;font-weight:bold;z-index:10;letter-spacing:0.5px;">مسودة</span>`
    : '';

  let actions = '';
  if (item.video) {
    actions += `<a class="card-action-link" href="${escapeHTML(pathFor(item.video))}" target="_blank" rel="noopener" ${mediaViewerAttributes(item, 'video', 'project-card', { target: item.video })}>عرض الفيديو</a>`;
  }
  if (item.pdf) {
    actions += `<a class="card-action-link" href="${escapeHTML(pathFor(item.pdf))}" target="_blank" rel="noopener" ${mediaViewerAttributes(item, 'pdf', 'project-card', { target: item.pdf })}>ملف PDF</a>`;
  }
  if (item.gallery && Array.isArray(item.gallery) && item.gallery.length > 0) {
    actions += `<a class="card-action-link" href="${escapeHTML(pathFor(item.gallery[0]))}" target="_blank" rel="noopener" ${mediaViewerAttributes(item, 'gallery', 'project-card', { target: item.gallery[0], gallery: item.gallery })}>معرض الصور</a>`;
  }
  if (actions) {
    actions = `<div class="card-actions-mini">${actions}</div>`;
  }

  let cardUrl = item.url;
  const detailUrl = getProjectDetailUrl(item);
  if (item._section && detailSections.includes(item._section)) {
    cardUrl = (explicitMediaType && explicitMediaType !== 'image')
      ? (getMediaTarget(item, mediaType, 'project-card') || detailUrl)
      : (detailUrl || item.url);
  } else if (explicitMediaType || mediaType !== 'image') {
    cardUrl = getMediaTarget(item, mediaType, 'project-card') || item.url;
  }
  const cardUrlPath = cardUrl ? escapeHTML(pathFor(cardUrl)) : '';
  const cardOptions = cardUrl ? linkOptionsForMedia(item, mediaType, 'project-card') : '';
  const viewerOptions = cardUrl ? mediaViewerAttributes(item, mediaType, 'project-card') : '';
  const linkAttributes = [cardOptions, viewerOptions].filter(Boolean).join(' ');

  if (!actions) {
    const body = `${draftBadge}${imageMarkup(item)}<div class="card-copy"><p>${escapeHTML(item.category || item.style)}</p><h3>${escapeHTML(item.title)}</h3><small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small><span>${String(index + 1).padStart(2, '0')}</span></div>`;
    const wrapper = cardUrl ? `<a class="project-card" href="${cardUrlPath}" ${linkAttributes}>${body}</a>` : `<article class="project-card">${body}</article>`;
    // Need position:relative on the wrapper for the badge
    return wrapper.replace('class="project-card"', 'class="project-card" style="position:relative;"');
  }

  const imagePart = cardUrl ? `<a class="project-card-image-link" href="${cardUrlPath}" ${linkAttributes}>${imageMarkup(item)}</a>` : imageMarkup(item);
  const titlePart = cardUrl ? `<a class="project-card-title-link" href="${cardUrlPath}" ${linkAttributes}>${escapeHTML(item.title)}</a>` : escapeHTML(item.title);

  const body = `${draftBadge}${imagePart}<div class="card-copy"><p>${escapeHTML(item.category || item.style)}</p><h3>${titlePart}</h3><small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small><span>${String(index + 1).padStart(2, '0')}</span>${actions}</div>`;

  return `<article class="project-card" style="position:relative;">${body}</article>`;
}


function panoramaCard(item) {
  const categoryIds = { Villas: 'villas', Bedrooms: 'bedrooms', Bathrooms: 'bathrooms', 'Cinema Rooms': 'cinema' };
  const id = categoryIds[item.category] || '';
  const mediaType = detectMediaType(item, 'panorama');
  const target = getMediaTarget(item, mediaType, 'panorama');
  return `<article ${id ? `id="${id}"` : ''} class="tour-card">
    ${imageMarkup(item)}
    <div><p class="eyebrow">${escapeHTML(item.category)}</p><h2>${escapeHTML(item.title)}</h2><span lang="en" dir="ltr">${escapeHTML(item.subtitle)}</span>
    ${linkMarkup(target, 'فتح الجولة 360 ↗', 'button button-dark', `${linkOptionsForMedia(item, mediaType, 'panorama')} ${mediaViewerAttributes(item, mediaType, 'panorama')}`)}</div>
  </article>`;
}

function knowledgeCard(item) {
  const previewTarget = hasGallery(item) ? item.gallery[0] : getThumbnail(item);
  const previewType = hasGallery(item) ? 'gallery' : '';
  const pdfType = item.pdf ? 'pdf' : detectMediaType(item, 'knowledge');
  return `<article class="knowledge-card">${imageMarkup(item)}<div>
    <span class="card-type">${escapeHTML(item.style || item.category)}</span>
    <h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)}</p>
    <small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small>
    <div class="card-actions">
      ${linkMarkup(previewTarget, 'معاينة الصور', '', `target="_blank" rel="noopener" ${previewType ? mediaViewerAttributes(item, previewType, 'knowledge', { target: previewTarget, gallery: item.gallery }) : ''}`)}
      ${linkMarkup(item.pdf, 'تحميل PDF', 'download', `target="_blank" rel="noopener" ${mediaViewerAttributes(item, pdfType, 'knowledge', { target: item.pdf })}`)}
    </div></div></article>`;
}

function documentCard(item, index) {
  const mediaType = detectMediaType(item, 'documents');
  const previewTarget = getMediaTarget(item, mediaType, 'documents') || item.url || item.pdf;
  const previewOptions = [
    linkOptionsForMedia(item, mediaType, 'documents'),
    mediaViewerAttributes(item, mediaType, 'documents', { target: previewTarget })
  ].filter(Boolean).join(' ');
  const downloadAction = item.derived
    ? '<span class="download" aria-disabled="true">متاح للمعاينة</span>'
    : linkMarkup(item.pdf, 'تحميل', 'download', 'download');
  return `<article class="library-card">
    <div class="library-cover">${imageMarkup(item)}<span>${String(index + 1).padStart(2, '0')}</span></div>
    <div class="library-copy"><p class="eyebrow">${escapeHTML(item.style)}</p><h2>${escapeHTML(item.title)}</h2>
    <span lang="en" dir="ltr">${escapeHTML(item.subtitle)}</span><p>${escapeHTML(item.description)}</p>
    <div class="library-actions">
      ${linkMarkup(previewTarget, 'معاينة', '', previewOptions)}
      ${downloadAction}
    </div></div></article>`;
}

async function renderContainer(container) {
  const type = container.dataset.render;
  const sourceNames = (container.dataset.sources || container.dataset.source || '').split(',').filter(Boolean);
  try {
    const collections = await Promise.all(sourceNames.map(loadData));
    let items = collections.flat();
    if (type === 'documents' && sourceNames.includes('documents')) {
      items = await getAggregatedAssets('documents', items);
    } else if (type === 'panorama' && sourceNames.includes('panorama')) {
      items = await getAggregatedAssets('panorama', items);
    } else if (type === 'videos' && sourceNames.includes('videos')) {
      items = await getAggregatedAssets('videos', items);
    }
    if (container.dataset.category) items = items.filter((item) => item.category === container.dataset.category);
    if (container.dataset.limit) items = items.slice(0, Number(container.dataset.limit));
    const renderer = type === 'panorama' ? panoramaCard : type === 'knowledge' ? knowledgeCard : type === 'documents' ? documentCard : projectCard;
    container.innerHTML = items.length
      ? items.map(renderer).join('')
      : '<p class="data-message">لا توجد عناصر منشورة في هذا القسم حالياً.</p>';
  } catch (error) {
    container.innerHTML = '<p class="data-message">تعذر تحميل المحتوى. يرجى تحديث الصفحة أو المحاولة لاحقاً.</p>';
    console.error(error);
  }
}

function installNavigation() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('is-open', !open);
    });
    nav.addEventListener('click', (event) => {
      if (!event.target.closest('a')) return;
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
    });
  }

  if (nav && !nav.querySelector('a[href$="knowledge-center.html"]')) {
    const link = document.createElement('a');
    link.href = `${rootPrefix}knowledge-center.html`;
    link.innerHTML = 'مركز المعرفة <span class="nav-en">Knowledge Center</span>';
    nav.insertBefore(link, nav.querySelector('a[href$="engineering-documents.html"]'));
  }
  if (nav && !nav.querySelector('a[href$="document-library.html"]')) {
    const link = document.createElement('a');
    link.href = `${rootPrefix}document-library.html`;
    link.innerHTML = 'مكتبة الوثائق <span class="nav-en">Document Library</span>';
    nav.insertBefore(link, nav.querySelector('a[href$="engineering-documents.html"]'));
  }
  document.querySelectorAll('.submenu-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const group = button.closest('.nav-group');
      const open = group.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });
  });
}

function searchableText(item) {
  const projectRefs = Array.isArray(item.project_refs)
    ? item.project_refs.map((reference) => `${reference.project_id || ''} ${reference.source_section || ''}`)
    : [];
  return [
    item.title,
    item.subtitle,
    item.category,
    item.style,
    item.location,
    item.description,
    item.type,
    item.target,
    item.url,
    item.pdf,
    item.video,
    item.panorama,
    item.project_id,
    item.project_section,
    ...(item.tags || []),
    ...projectRefs
  ]
    .filter(Boolean).join(' ').toLocaleLowerCase();
}

function searchResultLabel(item = {}, source = '', mediaType = '') {
  if (isProjectSection(source)) return 'Project';
  if (source === 'documents' || mediaType === 'pdf' || mediaType === 'heyzine') return mediaType === 'heyzine' ? 'Flipbook' : 'PDF';
  if (source === 'panorama' || mediaType === 'panorama' || mediaType === 'pano2vr') return mediaType === 'pano2vr' ? 'Pano2VR' : 'Panorama 360';
  if (source === 'videos' || mediaType === 'video') return 'Video';
  if (source === 'knowledge') return 'Knowledge';
  return source || 'Content';
}

function searchResult(item, source) {
  const isProjectResult = isProjectSection(source);
  const mediaType = isProjectResult ? 'image' : detectMediaType(item, source);
  const primary = isProjectResult
    ? (getProjectDetailUrl(item) || getMediaTarget(item, mediaType, source))
    : getMediaTarget(item, mediaType, source);
  return `<article class="search-result">${imageMarkup(item)}<div><span>${searchResultLabel(item, source, mediaType)}</span>
    <h3>${escapeHTML(item.title)}</h3><small lang="en" dir="ltr">${escapeHTML(item.subtitle)}</small>
    <p>${escapeHTML(item.description)}</p>${linkMarkup(primary, 'فتح العنصر ←', 'text-link', `${linkOptionsForMedia(item, mediaType, source)} ${mediaViewerAttributes(item, mediaType, source, { target: primary })}`)}</div></article>`;
}

async function loadSearchItemsForSource(source) {
  const items = await loadData(source).catch(() => []);
  if (source === 'documents') return getAggregatedAssets('documents', items);
  if (source === 'panorama') return getAggregatedAssets('panorama', items);
  if (source === 'videos') return getAggregatedAssets('videos', items);
  return items;
}

function installSearch() {
  const header = document.querySelector('.header-inner');
  if (!header) return;
  const button = document.createElement('button');
  button.className = 'search-toggle';
  button.type = 'button';
  button.setAttribute('aria-label', 'فتح البحث');
  button.textContent = '⌕';
  header.insertBefore(button, document.querySelector('.menu-toggle'));

  const panel = document.createElement('section');
  panel.className = 'search-panel';
  panel.hidden = true;
  panel.innerHTML = `<div class="search-shell"><button class="search-close" type="button" aria-label="إغلاق البحث">×</button>
    <p class="eyebrow">البحث في جميع محتويات المكتب</p><label for="global-search">ابحث عن مشروع أو دراسة أو وثيقة</label>
    <input id="global-search" type="search" placeholder="cinema, lighting, villa, BOQ, Revit..." autocomplete="off">
    <p class="search-hint">يبحث في العنوان، الفئة، الأسلوب، الموقع، الوصف، والكلمات المفتاحية.</p>
    <div class="search-results" aria-live="polite"></div></div>`;
  document.body.appendChild(panel);

  const input = panel.querySelector('input');
  const results = panel.querySelector('.search-results');
  const close = () => { panel.hidden = true; document.body.classList.remove('search-open'); };
  button.addEventListener('click', () => { panel.hidden = false; document.body.classList.add('search-open'); setTimeout(() => input.focus(), 0); });
  panel.querySelector('.search-close').addEventListener('click', close);
  panel.addEventListener('click', (event) => { if (event.target === panel) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const query = input.value.trim().toLocaleLowerCase();
      if (!query) { results.innerHTML = '<p class="data-message">ابدأ بكتابة كلمة للبحث.</p>'; return; }
      results.innerHTML = '<p class="data-message">جاري البحث...</p>';
      const settled = await Promise.all(dataFiles.map(async (source) => ({ source, items: await loadSearchItemsForSource(source) })));
      const matches = settled.flatMap(({ source, items }) => items.filter((item) => searchableText(item).includes(query)).map((item) => ({ item, source })));
      results.innerHTML = matches.length
        ? matches.map(({ item, source }) => searchResult(item, source)).join('')
        : `<p class="data-message">لا توجد نتائج مطابقة لكلمة “${escapeHTML(input.value)}”.</p>`;
    }, 180);
  });
}

function installUtilities() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLImageElement && event.target.dataset.fallback && !event.target.dataset.fallbackUsed) {
      event.target.dataset.fallbackUsed = 'true';
      event.target.src = event.target.dataset.fallback;
    }
  }, true);
  if (!document.querySelector('.whatsapp-float')) {
    const whatsapp = document.createElement('a');
    whatsapp.className = 'whatsapp-float';
    whatsapp.href = 'https://wa.me/9647801028055';
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener';
    whatsapp.setAttribute('aria-label', 'التواصل عبر واتساب');
    whatsapp.innerHTML = '<span class="whatsapp-icon" aria-hidden="true">WA</span><span class="whatsapp-label">تواصل عبر واتساب</span>';
    document.body.appendChild(whatsapp);
  }
  const contactForm = document.querySelector('[data-contact-form]');
  if (contactForm) contactForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(contactForm);
    const subject = encodeURIComponent(`Project inquiry from ${data.get('name') || 'website visitor'}`);
    const body = encodeURIComponent(`Name: ${data.get('name') || ''}\nPhone: ${data.get('phone') || ''}\n\n${data.get('message') || ''}`);
    window.location.href = `mailto:hassan6900@gmail.com?subject=${subject}&body=${body}`;
  });
}

function installFooterContacts() {
  document.querySelectorAll('.site-footer .shell').forEach((footer) => {
    if (footer.querySelector('.footer-contacts')) return;
    const contacts = document.createElement('nav');
    contacts.className = 'footer-contacts';
    contacts.setAttribute('aria-label', 'بيانات اتصال المكتب');
    contacts.innerHTML = `
      <a href="https://wa.me/9647801028055" target="_blank" rel="noopener" dir="ltr">+964 780 102 8055</a>
      <a href="mailto:hassan6900@gmail.com" dir="ltr">hassan6900@gmail.com</a>
      <a href="https://maps.app.goo.gl/ReywzMyjcvAn9D5c6" target="_blank" rel="noopener" lang="en" dir="ltr">Basra, Iraq</a>`;
    footer.appendChild(contacts);
  });
}

function installMediaViewerAssets() {
  const mediaViewerVersion = 'local-flipbook-viewer-v1-1';

  if (!document.getElementById('arch-media-viewer-css')) {
    const link = document.createElement('link');
    link.id = 'arch-media-viewer-css';
    link.rel = 'stylesheet';
    link.href = pathFor(`css/media-viewer.css?v=${mediaViewerVersion}`);
    document.head.appendChild(link);
  }

  if (!document.getElementById('arch-media-viewer-js')) {
    const script = document.createElement('script');
    script.id = 'arch-media-viewer-js';
    script.src = pathFor(`js/media-viewer.js?v=${mediaViewerVersion}`);
    script.defer = true;
    document.body.appendChild(script);
  }
}

window.ArchMediaCore = {
  escapeHTML,
  pathFor,
  asciiSlug,
  isProjectSection,
  getThumbnail,
  getContentIdentity,
  normalizeContentItem,
  extractAssetsFromItem,
  makeDerivedAssetId,
  normalizeAssetTarget,
  mergeStandaloneAndDerivedAssets,
  createStandaloneAsset,
  assetToRenderableItem,
  getAggregatedAssets,
  isMediaDebugEnabled,
  debugContentItem,
  normalizeMediaType,
  detectMediaType,
  getMediaTarget,
  getMediaOpenMode,
  getProjectDetailUrl,
  isExternalUrl,
  isHeyzineUrl,
  mediaViewerAttributes
};

installNavigation();
installSearch();
installUtilities();
installFooterContacts();
installMediaViewerAssets();
document.querySelectorAll('[data-render]').forEach(renderContainer);

const styleSheet = document.createElement("style");
styleSheet.textContent = `
  .card-actions-mini {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .card-action-link {
    display: inline-block;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--gold, #8f7b4b);
    border: 1px solid var(--gold, #8f7b4b);
    border-radius: 4px;
    text-decoration: none;
    background: transparent;
    transition: all 0.2s ease;
  }
  .card-action-link:hover {
    background: var(--gold, #8f7b4b);
    color: #fff !important;
  }
  .project-card h3 a {
    color: inherit;
    text-decoration: none;
  }
  .project-card h3 a:hover {
    color: var(--gold, #8f7b4b);
  }
  .project-card-image-link {
    display: block;
    width: 100%;
  }
`;
document.head.appendChild(styleSheet);
