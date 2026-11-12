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
let entries = [];
let openEntryId = null;

function safeUrl(value, baseUrl, sameOriginOnly = true) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (sameOriginOnly && url.origin !== window.location.origin) return null;
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
    link: safeUrl(item.link, dataUrl, false)?.href || '',
    createdAt: item.createdAt || '',
    files,
    screenshots
  };
}

async function loadEntries() {
  if (window.location.protocol === 'file:') {
    throw new Error('Open this portfolio with Live Server so it can read its course entries.');
  }
  const response = await fetch(dataUrl, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`The course portfolio data could not be loaded (HTTP ${response.status}).`);
  const data = await response.json();
  if (!data || !Array.isArray(data.entries)) throw new Error('The portfolio data file is missing its entries list.');
  const usedIds = new Map();
  return data.entries.map(normalizeEntry).filter(Boolean).map((entry) => {
    const occurrence = (usedIds.get(entry.id) || 0) + 1;
    usedIds.set(entry.id, occurrence);
    if (occurrence > 1) entry.id = `${entry.id}-${occurrence}`;
    return entry;
  });
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
    entry.title,
    categoryLabels[entry.category],
    entry.description,
    entry.instructions,
    entry.solution,
    entry.results,
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

    const groups = new Map();
    for (const category of categoryOrder) {
      const items = termEntries.filter((entry) => entry.category === category).sort(compareEntries);
      if (!items.length) continue;
      groups.set(category, items);
    }

    for (const [category, items] of groups) {
      const group = createElement('section', 'entry-category-group');
      group.append(createElement('div', 'entry-category-heading', ''));
      const heading = group.querySelector('.entry-category-heading');
      heading.append(
        createElement('h4', '', categoryLabels[category]),
        createElement('span', '', `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`)
      );
      items.forEach((entry, index) => group.append(createEntry(entry, index)));
      list.append(group);
    }
  }

  if (statusMessage) {
    const total = entries.length;
    statusMessage.textContent = query
      ? `${visibleEntries.length} ${visibleEntries.length === 1 ? 'entry' : 'entries'} match your search.`
      : `${total} ${total === 1 ? 'entry' : 'entries'} published across the portfolio.`;
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
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeNavigation();
    });
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

  try {
    entries = await loadEntries();
    renderEntries();
  } catch (error) {
    if (statusMessage) statusMessage.textContent = error.message || 'Portfolio entries could not be loaded.';
    for (const term of termIds) {
      const empty = document.querySelector(`[data-empty-state="${term}"]`);
      if (empty) empty.textContent = 'Portfolio entries could not be loaded. Please refresh the page or contact the portfolio owner.';
    }
  }
}

void initializePortfolio();
