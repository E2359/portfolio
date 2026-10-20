console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const BASE_PATH = isLocal ? '/' : '/portfolio/';

export async function fetchJSON(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
    throw error;
  }
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function resolveProjectImage(image = '') {
  if (/^(?:https?:|data:|\/)/.test(image)) {
    return image;
  }

  return `${BASE_PATH}${image}`;
}

export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  if (!containerElement) {
    console.warn('Project container was not found.');
    return;
  }

  const safeHeadingLevel = /^h[1-6]$/.test(headingLevel) ? headingLevel : 'h2';
  containerElement.replaceChildren();

  for (const project of projects ?? []) {
    const article = document.createElement('article');
    const title = escapeHTML(project.title || 'Untitled project');
    const description = escapeHTML(project.description || 'Description coming soon.');
    const year = escapeHTML(project.year || 'In progress');
    const image = escapeHTML(resolveProjectImage(project.image));

    article.innerHTML = `
      <${safeHeadingLevel}>${title}</${safeHeadingLevel}>
      <img src="${image}" alt="Abstract chart thumbnail for ${title}">
      <p class="project-year">${year}</p>
      <p>${description}</p>
    `;
    containerElement.append(article);
  }
}

export async function fetchGithubData(username) {
  return fetchJSON(`https://api.github.com/users/${encodeURIComponent(username)}`);
}

const pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'contact/', title: 'Contact' },
  { url: 'resume/', title: 'Resume' },
  { url: 'https://github.com/E2359', title: 'GitHub' },
];

const nav = document.createElement('nav');
nav.setAttribute('aria-label', 'Main navigation');
document.body.prepend(nav);

for (const page of pages) {
  const url = page.url.startsWith('http') ? page.url : BASE_PATH + page.url;
  const link = document.createElement('a');

  link.href = url;
  link.textContent = page.title;

  const isCurrent =
    link.host === location.host && link.pathname === location.pathname;
  link.classList.toggle('current', isCurrent);
  if (isCurrent) {
    link.setAttribute('aria-current', 'page');
  }

  if (link.host !== location.host) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  nav.append(link);
}

const prefersDark = matchMedia('(prefers-color-scheme: dark)');

document.body.insertAdjacentHTML(
  'afterbegin',
  `<label class="color-scheme">
    Theme:
    <select aria-label="Choose color theme">
      <option value="light dark">Automatic (${prefersDark.matches ? 'Dark' : 'Light'})</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`,
);

const themeSelect = document.querySelector('.color-scheme select');

function setColorScheme(colorScheme) {
  document.documentElement.style.setProperty('color-scheme', colorScheme);
  themeSelect.value = colorScheme;
}

const savedColorScheme = localStorage.getItem('colorScheme');
if (savedColorScheme) {
  setColorScheme(savedColorScheme);
}

themeSelect.addEventListener('input', (event) => {
  const colorScheme = event.target.value;
  setColorScheme(colorScheme);
  localStorage.setItem('colorScheme', colorScheme);
});

prefersDark.addEventListener('change', (event) => {
  const automaticOption = themeSelect.options[0];
  automaticOption.textContent = `Automatic (${event.matches ? 'Dark' : 'Light'})`;
});

const contactForm = document.querySelector('form[action^="mailto:"]');

contactForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const data = new FormData(contactForm);
  const query = Array.from(data, ([name, value]) =>
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
  ).join('&');

  location.href = `${contactForm.action}?${query}`;
});

// Keep the helper exercised and available while learning DOM selection.
const navLinks = $$('nav a');
console.log(`Navigation initialized with ${navLinks.length} links.`);
