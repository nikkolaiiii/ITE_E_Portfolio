const termIds = ['prelim', 'midterm', 'final'];
const categoryLabels = {
  classroom: 'Classroom Activities and Exercises',
  laboratory: 'Laboratory Activities',
  quiz: 'Quizzes and Assessments',
  project: 'Projects and Performance Tasks',
  exam: 'Examination Results',
  other: 'Other Course Materials'
};
const categoryOrder = Object.keys(categoryLabels);
const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const dataUrl = new URL('./portfolio-data.json', document.baseURI);
const searchInput = document.querySelector('#entry-search');
const statusMessage = document.querySelector('#entry-status');
const themeButton = document.querySelector('#theme-toggle');
const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#site-nav');
const exportButton = document.querySelector('#export-portfolio');
const draftStatus = document.querySelector('#draft-storage-status');
let entries = [];
let publishedEntries = [];
let publishedRawEntries = [];
let openEntryId = null;
let publishedLoadError = '';
let draftDbPromise;
const draftObjectUrls = new Set();
const maxFileSize = 25 * 1024 * 1024;

function safeUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (value.startsWith('data:')) {
    const allowedDataUrl = /^data:(?:image\/(?:png|jpeg|gif|webp)|application\/(?:pdf|msword|vnd\.ms-(?:excel|powerpoint)|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|zip|octet-stream)|text\/(?:plain|csv));base64,[a-z0-9+/]*={0,2}$/i;
    if (!allowedDataUrl.test(value)) return null;
    try { return new URL(value); } catch { return null; }
  }
  try {
    const url = new URL(value, baseUrl);
    if (!['http:', 'https:', 'blob:'].includes(url.protocol)) return null;
    if (url.origin !== window.location.origin) return null;
    return url;
  } catch {
    return null;
  }
}

function normalizeAttachment(file) {
  if (!file || typeof file !== 'object') return null;
  const url = safeUrl(file.src, dataUrl);
  if (!url) return null;
  return {
    name: String(file.name || 'Portfolio file'),
    type: String(file.type || 'application/octet-stream'),
    size: Number(file.size) || 0,
    url: url.href
  };
}

function normalizeEntry(item, index) {
  if (!item || !termIds.includes(item.term) || typeof item.title !== 'string' || !item.title.trim()) return null;
  const category = Object.prototype.hasOwnProperty.call(categoryLabels, item.category) ? item.category : 'other';
  const files = Array.isArray(item.files) ? item.files.map(normalizeAttachment).filter(Boolean) : [];
  const screenshots = Array.isArray(item.screenshots)
    ? item.screenshots.map(normalizeAttachment).filter((file) => file && file.type.startsWith('image/'))
    : [];
  return {
    id: String(item.id || `${item.term}-${index}`),
    term: item.term,
    category,
    title: item.title.trim().slice(0, 180),
    activityNumber: Number.isFinite(Number(item.activityNumber)) && Number(item.activityNumber) > 0
      ? Number(item.activityNumber)
      : null,
    description: String(item.description || ''),
    instructions: String(item.instructions || ''),
    solution: String(item.solution || ''),
    results: String(item.results || ''),
    link: safeUrl(item.link, dataUrl)?.href || '',
    createdAt: item.createdAt || '',
    files,
    screenshots,
    isDraft: Boolean(item.isDraft)
  };
}

async function loadPublishedEntries() {
  if (window.location.protocol === 'file:') {
    throw new Error('Open this portfolio with Live Server so it can read portfolio data.');
  }
  const response = await fetch(dataUrl, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Published portfolio data could not be loaded (HTTP ${response.status}).`);
  const data = await response.json();
  if (!data || !Array.isArray(data.entries)) throw new Error('The portfolio data file is missing its entries list.');
  publishedRawEntries = data.entries;
  return data.entries.map(normalizeEntry).filter(Boolean);
}

function openDraftDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support saved draft storage.'));
  if (!draftDbPromise) {
    draftDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('nikkolai-ite-portfolio-drafts', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('entries')) request.result.createObjectStore('entries', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open draft storage.'));
      request.onblocked = () => reject(new Error('Draft storage is blocked by another open portfolio tab.'));
    });
  }
  return draftDbPromise;
}

async function getDraftRecords() {
  const db = await openDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readonly');
    const request = transaction.objectStore('entries').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Could not read saved drafts.'));
    transaction.onerror = () => reject(transaction.error || new Error('Could not read saved drafts.'));
  });
}

async function putDraftRecord(record) {
  const db = await openDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    transaction.objectStore('entries').put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save this draft.'));
    transaction.onabort = () => reject(transaction.error || new Error('Saving this draft was cancelled.'));
  });
}

async function removeDraftRecord(id) {
  const db = await openDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    transaction.objectStore('entries').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not remove this draft.'));
    transaction.onabort = () => reject(transaction.error || new Error('Removing this draft was cancelled.'));
  });
}

function clearDraftObjectUrls() {
  for (const url of draftObjectUrls) URL.revokeObjectURL(url);
  draftObjectUrls.clear();
}

async function loadDraftEntries() {
  clearDraftObjectUrls();
  const records = await getDraftRecords();
  return records.map((record, index) => {
    const mapFiles = (files) => (Array.isArray(files) ? files : []).map((file) => {
      if (!(file.blob instanceof Blob)) return null;
      const src = URL.createObjectURL(file.blob);
      draftObjectUrls.add(src);
      return { name: file.name, type: file.type, size: file.size, src };
    }).filter(Boolean);
    return normalizeEntry({
      ...record,
      files: mapFiles(record.files),
      screenshots: mapFiles(record.screenshots),
      isDraft: true
    }, `draft-${index}`);
  }).filter(Boolean);
}

function getActivityNumber(entry) {
  if (entry.activityNumber) return entry.activityNumber;
  const match = entry.title.match(/\b(?:activity|act|seatwork|quiz|lab(?:oratory)?|exam|examination|project)\s*(?:no\.?|number)?\s*#?\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function compareEntries(first, second) {
  const firstNumber = getActivityNumber(first);
  const secondNumber = getActivityNumber(second);
  if (firstNumber !== null && secondNumber !== null && firstNumber !== secondNumber) return firstNumber - secondNumber;
  if (firstNumber !== null && secondNumber === null) return -1;
  if (firstNumber === null && secondNumber !== null) return 1;
  return titleCollator.compare(first.title, second.title);
}

function formatBytes(size) {
  if (!Number.isFinite(size) || size <= 0) return 'Size unavailable';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function appendTextDetail(parent, label, value) {
  if (!value) return;
  const row = createElement('p', 'entry-detail');
  row.append(createElement('strong', '', label), createElement('span', '', value));
  parent.append(row);
}

function renderDocuments(files) {
  const section = createElement('section', 'attachment-section');
  section.append(createElement('h5', '', 'Documents'));
  if (!files.length) {
    section.append(createElement('p', 'attachment-empty', 'No documents attached to this entry.'));
    return section;
  }
  const list = createElement('ul', 'document-list');
  for (const file of files) {
    const row = createElement('li', 'document-row');
    const extension = file.name.includes('.') ? file.name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE';
    row.append(createElement('span', 'document-icon', extension));
    row.append(createElement('span', 'document-name', file.name));
    row.append(createElement('span', 'document-meta', `${file.type} | ${formatBytes(file.size)}`));
    const download = createElement('a', 'document-download', 'Download');
    download.href = file.url;
    download.download = file.name;
    download.setAttribute('aria-label', `Download ${file.name}`);
    row.append(download);
    list.append(row);
  }
  section.append(list);
  return section;
}

function renderScreenshots(files) {
  const section = createElement('section', 'attachment-section');
  section.append(createElement('h5', '', 'Submission screenshots'));
  if (!files.length) {
    section.append(createElement('p', 'attachment-empty', 'No submission screenshots attached to this entry.'));
    return section;
  }
  const grid = createElement('div', 'screenshot-grid');
  for (const file of files) {
    const figure = createElement('figure', 'screenshot-card');
    const image = document.createElement('img');
    image.src = file.url;
    image.alt = `Submission screenshot: ${file.name}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.append(image, createElement('figcaption', '', file.name));
    grid.append(figure);
  }
  section.append(grid);
  return section;
}

function createEntry(entry, index) {
  const details = createElement('details', 'portfolio-entry');
  details.dataset.entryId = entry.id;
  details.open = entry.id === openEntryId;
  const summary = createElement('summary', 'entry-summary');
  summary.append(
    createElement('span', 'entry-number', String(index + 1).padStart(2, '0')),
    createElement('span', 'entry-title', entry.title),
    createElement('span', 'entry-toggle')
  );
  details.append(summary);
  const content = createElement('div', 'entry-content');
  const meta = createElement('div', 'entry-meta');
  meta.append(createElement('span', 'entry-badge', categoryLabels[entry.category]));
  if (entry.isDraft) meta.append(createElement('span', 'entry-badge entry-draft-badge', 'Draft saved in this browser'));
  const date = formatDate(entry.createdAt);
  if (date) meta.append(createElement('span', 'entry-date', `Added ${date}`));
  content.append(meta);
  if (entry.description) content.append(createElement('p', 'entry-description', entry.description));
  appendTextDetail(content, 'Instructions', entry.instructions);
  appendTextDetail(content, 'Source code or procedure', entry.solution);
  appendTextDetail(content, 'Results and reflection', entry.results);
  if (entry.link) {
    const resource = createElement('a', 'text-link entry-resource', 'Open related resource');
    resource.href = entry.link;
    resource.target = '_blank';
    resource.rel = 'noopener noreferrer';
    content.append(resource);
  }
  content.append(renderDocuments(entry.files), renderScreenshots(entry.screenshots));
  if (entry.isDraft) {
    const remove = createElement('button', 'remove-draft-button', 'Remove draft entry');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Remove the draft entry "${entry.title}" from this browser?`)) return;
      try {
        await removeDraftRecord(entry.id);
        entries = entries.filter((item) => item.id !== entry.id);
        if (openEntryId === entry.id) openEntryId = null;
        renderEntries();
        if (draftStatus) draftStatus.textContent = 'Draft entry removed from this browser.';
      } catch (error) {
        if (draftStatus) draftStatus.textContent = error.message || 'Could not remove the draft entry.';
      }
    });
    content.append(remove);
  }
  details.append(content);
  details.addEventListener('toggle', () => {
    if (!details.open) {
      if (openEntryId === entry.id) openEntryId = null;
      return;
    }
    document.querySelectorAll('details.portfolio-entry[open]').forEach((otherEntry) => {
      if (otherEntry !== details) otherEntry.open = false;
    });
    openEntryId = entry.id;
  });
  return details;
}

function entryMatches(entry, query) {
  if (!query) return true;
  const searchText = [
    entry.title, categoryLabels[entry.category], entry.description,
    entry.instructions, entry.solution, entry.results,
    ...entry.files.map((file) => file.name),
    ...entry.screenshots.map((file) => file.name)
  ].join(' ').toLocaleLowerCase();
  return searchText.includes(query);
}

function renderEntries() {
  const query = (searchInput?.value || '').trim().toLocaleLowerCase();
  const visibleEntries = entries.filter((entry) => entryMatches(entry, query));
  if (openEntryId && !visibleEntries.some((entry) => entry.id === openEntryId)) openEntryId = null;
  for (const term of termIds) {
    const list = document.querySelector(`[data-entry-list="${term}"]`);
    const empty = document.querySelector(`[data-empty-state="${term}"]`);
    const count = document.querySelector(`[data-count="${term}"]`);
    if (!list || !empty || !count) continue;
    const termEntries = visibleEntries.filter((entry) => entry.term === term);
    const allTermEntries = entries.filter((entry) => entry.term === term);
    count.textContent = `${allTermEntries.length} ${allTermEntries.length === 1 ? 'entry' : 'entries'}`;
    list.replaceChildren();
    empty.hidden = termEntries.length > 0;
    empty.textContent = query
      ? 'No entries in this term match your search.'
      : `Nikkolai's ${term} work will appear here when its portfolio entries are added.`;
    for (const category of categoryOrder) {
      const items = termEntries.filter((entry) => entry.category === category).sort(compareEntries);
      if (!items.length) continue;
      const group = createElement('section', 'entry-category-group');
      const heading = createElement('div', 'entry-category-heading');
      heading.append(
        createElement('h4', '', categoryLabels[category]),
        createElement('span', '', `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`)
      );
      group.append(heading);
      items.forEach((entry, index) => group.append(createEntry(entry, index)));
      list.append(group);
    }
  }
  if (statusMessage) {
    const total = entries.length;
    if (publishedLoadError && !query) statusMessage.textContent = `${publishedLoadError} Browser drafts remain available.`;
    else statusMessage.textContent = query
      ? `${visibleEntries.length} ${visibleEntries.length === 1 ? 'entry' : 'entries'} match your search.`
      : `${total} ${total === 1 ? 'entry' : 'entries'} available; drafts are saved in this browser.`;
  }
}

function setTheme(theme) {
  const isDark = theme === 'dark';
  document.body.dataset.theme = isDark ? 'dark' : 'light';
  if (themeButton) {
    themeButton.setAttribute('aria-pressed', String(isDark));
    themeButton.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeButton.title = isDark ? 'Switch to light theme' : 'Switch to dark theme';
  }
}

function closeNavigation() {
  if (!menuButton || !navigation) return;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
  navigation.classList.remove('is-open');
}

function setupNavigation() {
  if (menuButton && navigation) {
    menuButton.addEventListener('click', () => {
      const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
      menuButton.setAttribute('aria-expanded', String(!isOpen));
      menuButton.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
      navigation.classList.toggle('is-open', !isOpen);
    });
    navigation.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNavigation));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNavigation(); });
  }
  const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = navLinks.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((items) => {
      const visible = items.filter((item) => item.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => {
        const active = link.getAttribute('href') === `#${visible.target.id}`;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, .15, .35, .6] });
    sections.forEach((section) => observer.observe(section));
  }
}

function setupRevealAnimations() {
  const revealItems = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    revealItems.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver((items, activeObserver) => {
    items.forEach((item) => {
      if (!item.isIntersecting) return;
      item.target.classList.add('is-visible');
      activeObserver.unobserve(item.target);
    });
  }, { threshold: .12 });
  revealItems.forEach((item) => observer.observe(item));
}

function setFormStatus(form, message, isError = false) {
  const output = form.querySelector('[data-form-status]');
  if (!output) return;
  output.textContent = message;
  output.classList.toggle('is-error', isError);
}

function filesToRecords(fileList) {
  return [...fileList].map((file) => ({ name: file.name, type: file.type || 'application/octet-stream', size: file.size, blob: file }));
}

function setupUploadForms() {
  document.querySelectorAll('[data-entry-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('[type="submit"]');
      const formData = new FormData(form);
      const files = filesToRecords(form.querySelector('[name="documents"]').files);
      const screenshots = filesToRecords(form.querySelector('[name="screenshots"]').files);
      const attachments = [...files, ...screenshots];
      if (!attachments.length) {
        setFormStatus(form, 'Choose at least one document or screenshot.', true);
        return;
      }
      if (attachments.some((file) => file.size > maxFileSize)) {
        setFormStatus(form, 'Each file must be 25 MB or smaller. Please choose smaller files.', true);
        return;
      }
      if (screenshots.some((file) => !file.type.startsWith('image/'))) {
        setFormStatus(form, 'Submission screenshots must be image files.', true);
        return;
      }
      const title = String(formData.get('title') || '').trim();
      const category = String(formData.get('category') || '');
      if (!title || !Object.prototype.hasOwnProperty.call(categoryLabels, category)) {
        setFormStatus(form, 'Add a title and choose a portfolio category.', true);
        return;
      }
      const numberValue = String(formData.get('activityNumber') || '').trim();
      const record = {
        id: globalThis.crypto?.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        term: form.dataset.entryForm,
        category,
        title,
        activityNumber: numberValue ? Number(numberValue) : null,
        description: String(formData.get('description') || '').trim(),
        instructions: String(formData.get('instructions') || '').trim(),
        solution: String(formData.get('solution') || '').trim(),
        results: String(formData.get('results') || '').trim(),
        createdAt: new Date().toISOString(),
        files,
        screenshots
      };
      submitButton.disabled = true;
      setFormStatus(form, 'Saving this entry in this browser...');
      try {
        await putDraftRecord(record);
        const saved = await loadDraftEntries();
        entries = [...publishedEntries, ...saved];
        renderEntries();
        form.reset();
        setFormStatus(form, 'Entry saved. It will remain in this browser until you export or remove it.');
        if (draftStatus) draftStatus.textContent = 'Draft saved in this browser. Export the portfolio data to prepare it for publication.';
      } catch (error) {
        setFormStatus(form, error.message || 'Could not save the entry. Check this browser storage and try again.', true);
      } finally {
        submitButton.disabled = false;
      }
    });
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Could not prepare an attachment for export.'));
    reader.readAsDataURL(blob);
  });
}

async function exportPortfolioData() {
  if (!exportButton) return;
  exportButton.disabled = true;
  if (draftStatus) draftStatus.textContent = 'Preparing entries and attachments for export...';
  try {
    const drafts = await getDraftRecords();
    const preparedDrafts = await Promise.all(drafts.map(async (draft) => {
      const convertFiles = async (files) => Promise.all((files || []).map(async (file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        src: await blobToDataUrl(file.blob)
      })));
      return {
        id: draft.id,
        term: draft.term,
        category: draft.category,
        title: draft.title,
        activityNumber: draft.activityNumber,
        description: draft.description,
        instructions: draft.instructions,
        solution: draft.solution,
        results: draft.results,
        createdAt: draft.createdAt,
        files: await convertFiles(draft.files),
        screenshots: await convertFiles(draft.screenshots)
      };
    }));
    const output = {
      version: 1,
      student: 'Nikkolai Yabut',
      entries: [...publishedRawEntries, ...preparedDrafts]
    };
    const file = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'portfolio-data.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (draftStatus) draftStatus.textContent = `Export complete: ${output.entries.length} total entries. Replace the repository's portfolio-data.json with this downloaded file to publish them.`;
  } catch (error) {
    if (draftStatus) draftStatus.textContent = error.message || 'Could not export the portfolio data.';
  } finally {
    exportButton.disabled = false;
  }
}

async function initializePortfolio() {
  document.documentElement.classList.add('js-ready');
  setupNavigation();
  setupRevealAnimations();
  let savedTheme = 'light';
  try { savedTheme = localStorage.getItem('nikkolaiPortfolioTheme') || 'light'; } catch {}
  setTheme(savedTheme);
  themeButton?.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try { localStorage.setItem('nikkolaiPortfolioTheme', nextTheme); } catch {}
  });
  searchInput?.addEventListener('input', renderEntries);
  exportButton?.addEventListener('click', exportPortfolioData);
  setupUploadForms();
  try { publishedEntries = await loadPublishedEntries(); }
  catch (error) { publishedLoadError = error.message || 'Published course data could not be loaded.'; }
  try {
    const drafts = await loadDraftEntries();
    entries = [...publishedEntries, ...drafts];
    if (draftStatus) draftStatus.textContent = `${drafts.length} draft ${drafts.length === 1 ? 'entry is' : 'entries are'} saved in this browser.`;
  } catch (error) {
    entries = [...publishedEntries];
    if (draftStatus) draftStatus.textContent = error.message || 'Draft storage is unavailable in this browser.';
    document.querySelectorAll('[data-entry-form] [type="submit"]').forEach((button) => { button.disabled = true; });
  }
  renderEntries();
}

window.addEventListener('pagehide', clearDraftObjectUrls);
void initializePortfolio();