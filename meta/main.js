import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3/+esm';

const statsContainer = document.querySelector('#stats');
const chartContainer = document.querySelector('#chart');
const tooltip = document.querySelector('#commit-tooltip');
const languageBreakdown = document.querySelector('#language-breakdown');
const languageHint = document.querySelector('#language-hint');
const selectionCount = document.querySelector('#selection-count');
const slider = document.querySelector('#commit-progress');
const timeLabel = document.querySelector('#commit-time');
const storySteps = document.querySelector('#story-steps');
const fileUnits = document.querySelector('#file-units');
const unitLegend = document.querySelector('#unit-legend');
const unitsSummary = document.querySelector('#units-summary');

const STORY_NOTES = new Map([
  ['6b692b6e', 'The first tracked styles establish a visual base for the site and its pages.'],
  ['8c955cef', 'The portfolio starts telling its story with a revised introduction and a clean resume page.'],
  ['3b893b09', 'The portfolio gets its visual foundation: shared colors, spacing, and responsive page styles.'],
  ['6e83f9e8', 'JavaScript brings the site to life with shared navigation and interactive behavior.'],
  ['0b5c37ba', 'The resume and site structure take shape, turning the portfolio into a set of connected pages.'],
  ['a5ab528a', 'The project gallery adds its first data-driven chart and accessible filtering controls.'],
  ['9a572481', 'A pie chart and legend make the project collection easier to explore.'],
  ['90e758da', 'Search and chart selection begin working together, connecting two ways to explore the projects.'],
  ['8f8d5ad0', 'The repository starts describing itself with a summary, commit plot, tooltip, and brush selection.'],
  ['24481b4', 'Line-level repository data makes it possible to compare code over time and by file type.'],
  ['08ef5b2', 'The repository analytics are published as part of the portfolio.'],
  ['95792a5', 'The portfolio adds a bike traffic map, bringing geographic data into the project collection.'],
]);

const LANGUAGE_COLORS = new Map([
  ['html', '#e76f51'],
  ['css', '#4381c1'],
  ['js', '#e4b640'],
  ['json', '#8b6fc0'],
  ['md', '#4b9a83'],
]);

let allLines = [];
let commits = [];
let activeCommits = [];
let currentIndex = 0;
let xScale;
let yScale;
let timeScale;
let radiusScale;
let dots;
let brush;
let svg;

async function loadData() {
  return d3.csv('./loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(`${row.date}T00:00${row.timezone}`),
    datetime: new Date(row.datetime),
  }));
}

function processCommits(data) {
  return d3.sort(d3.groups(data, (row) => row.commit).map(([id, lines]) => {
    const first = lines[0];
    const commit = {
      id,
      url: `https://github.com/E2359/portfolio/commit/${encodeURIComponent(id)}`,
      author: first.author,
      date: first.date,
      time: first.time,
      timezone: first.timezone,
      datetime: first.datetime,
      hourFrac: first.datetime.getHours() + first.datetime.getMinutes() / 60,
      totalLines: lines.length,
      message: [...STORY_NOTES].find(([prefix]) => id.startsWith(prefix))?.[1]
        ?? 'This snapshot records another step in the portfolio’s code history.',
    };
    Object.defineProperty(commit, 'lines', {
      value: lines,
      configurable: true,
      writable: true,
      enumerable: false,
    });
    return commit;
  }), (commit) => commit.datetime);
}

function renderStats(data, commitData) {
  const files = d3.rollups(data, (rows) => d3.max(rows, (row) => row.line), (row) => row.file);
  const stats = [
    ['Lines in this analysis', d3.format(',')(data.length)],
    ['Commits represented', d3.format(',')(commitData.length)],
    ['Files represented', d3.format(',')(files.length)],
    ['Largest file', d3.greatest(files, ([, count]) => count)?.[0] ?? 'Not available'],
    ['Languages', d3.format(',')(new Set(data.map((row) => row.type)).size)],
  ];

  statsContainer.replaceChildren();
  const list = d3.select(statsContainer).append('dl').attr('class', 'stats meta-stats');
  for (const [label, value] of stats) {
    const item = list.append('div');
    item.append('dt').text(label);
    item.append('dd').text(value);
  }
}

function renderStory() {
  storySteps.replaceChildren();
  commits.forEach((commit, index) => {
    const step = document.createElement('article');
    step.className = 'story-step';
    step.dataset.index = String(index);
    step.innerHTML = `<p class="eyebrow">Milestone ${String(index + 1).padStart(2, '0')}</p>
      <h3>${commit.message}</h3>
      <p class="story-meta"><time datetime="${commit.datetime.toISOString()}">${commit.datetime.toLocaleDateString('en', { dateStyle: 'medium' })}</time>
      <span aria-hidden="true"> · </span>${commit.id.slice(0, 8)}</p>`;
    storySteps.append(step);
  });
}

function renderTooltipContent(commit) {
  document.querySelector('#commit-link').href = commit.url;
  document.querySelector('#commit-link').textContent = commit.id;
  document.querySelector('#commit-date').textContent = commit.datetime.toLocaleDateString('en', { dateStyle: 'full' });
  document.querySelector('#commit-time').textContent = `${commit.datetime.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })} (${commit.timezone})`;
  document.querySelector('#commit-author').textContent = commit.author;
  document.querySelector('#commit-lines').textContent = d3.format(',')(commit.totalLines);
}

function positionTooltip(event) {
  const gap = 14;
  const bounds = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(gap, Math.min(event.clientX + gap, window.innerWidth - bounds.width - gap))}px`;
  tooltip.style.top = `${Math.max(gap, Math.min(event.clientY + gap, window.innerHeight - bounds.height - gap))}px`;
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderLanguageBreakdown(selection) {
  const selected = selection ? activeCommits.filter((commit) => isCommitSelected(selection, commit)) : [];
  const lines = selected.flatMap((commit) => commit.lines);
  languageBreakdown.replaceChildren();
  if (!lines.length) {
    languageHint.hidden = false;
    return;
  }
  languageHint.hidden = true;
  d3.rollups(lines, (rows) => rows.length, (row) => row.type)
    .sort((a, b) => d3.descending(a[1], b[1]))
    .forEach(([language, count]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = language.toUpperCase();
      dd.textContent = `${d3.format(',')(count)} lines · ${d3.format('.1~%')(count / lines.length)}`;
      languageBreakdown.append(dt, dd);
    });
}

function renderSelection(selection) {
  dots.classed('selected', (commit) => isCommitSelected(selection, commit));
  const count = selection ? activeCommits.filter((commit) => isCommitSelected(selection, commit)).length : 0;
  selectionCount.textContent = count ? `${count} commit${count === 1 ? '' : 's'} selected` : 'No commits selected';
  renderLanguageBreakdown(selection);
}

function brushed(event) {
  renderSelection(event.selection);
}

function createScatterPlot() {
  const width = 1000;
  const height = 510;
  const margin = { top: 20, right: 26, bottom: 55, left: 72 };
  const area = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };
  chartContainer.replaceChildren();
  svg = d3.select(chartContainer).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'group')
    .attr('aria-label', 'Commit scatterplot that updates as the story advances.');
  const [minDate, maxDate] = d3.extent(commits, (commit) => commit.datetime);
  const minLines = d3.min(commits, (commit) => commit.totalLines) ?? 1;
  const maxLines = d3.max(commits, (commit) => commit.totalLines) ?? minLines + 1;
  xScale = d3.scaleTime().domain([minDate ?? new Date(0), maxDate ?? new Date()]).range([area.left, area.right]).nice();
  yScale = d3.scaleLinear().domain([0, 24]).range([area.bottom, area.top]);
  radiusScale = d3.scaleSqrt().domain([minLines, Math.max(maxLines, minLines + 1)]).range([5, 20]);

  svg.append('g').attr('class', 'gridlines').attr('transform', `translate(${area.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-area.width));
  dots = svg.append('g').attr('class', 'dots').selectAll('circle');
  svg.append('g').attr('class', 'x-axis').attr('transform', `translate(0, ${area.bottom})`).call(d3.axisBottom(xScale).ticks(5));
  svg.append('g').attr('class', 'y-axis').attr('transform', `translate(${area.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat((hour) => `${String(hour % 24).padStart(2, '0')}:00`));
  svg.append('text').attr('class', 'axis-label').attr('x', area.left + area.width / 2).attr('y', height - 10)
    .attr('text-anchor', 'middle').text('Commit date');
  svg.append('text').attr('class', 'axis-label')
    .attr('transform', `translate(18, ${area.top + area.height / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle').text('Time of day');
  brush = d3.brush().extent([[area.left, area.top], [area.right, area.bottom]]).on('start brush end', brushed);
  svg.append('g').attr('class', 'brush').call(brush);
  updateScatterPlot(false);
}

function updateScatterPlot(animate = true) {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const duration = animate && !reduceMotion ? 420 : 0;
  dots = svg.select('.dots').selectAll('circle.commit-dot')
    .data(activeCommits, (commit) => commit.id)
    .join(
      (enter) => enter.append('circle').attr('class', 'commit-dot')
        .attr('cx', (commit) => xScale(commit.datetime)).attr('cy', (commit) => yScale(commit.hourFrac))
        .attr('r', 0).attr('fill-opacity', 0)
        .call((selection) => selection.transition().duration(duration)
          .attr('r', (commit) => radiusScale(commit.totalLines)).attr('fill-opacity', 0.78)),
      (update) => update.call((selection) => selection.transition().duration(duration)
        .attr('cx', (commit) => xScale(commit.datetime)).attr('cy', (commit) => yScale(commit.hourFrac))
        .attr('r', (commit) => radiusScale(commit.totalLines))),
      (exit) => exit.call((selection) => selection.transition().duration(duration).attr('r', 0).attr('fill-opacity', 0).remove()),
    )
    .attr('fill', (commit) => d3.interpolateWarm(commit.hourFrac / 24))
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', (commit) => `${commit.author}, ${commit.datetime.toLocaleString()}, ${commit.totalLines} current lines attributed to this commit`)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).attr('fill-opacity', 1);
      renderTooltipContent(commit);
      tooltip.hidden = false;
      positionTooltip(event);
    })
    .on('mousemove', positionTooltip)
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).attr('fill-opacity', 0.78);
      tooltip.hidden = true;
    })
    .on('focus', (event, commit) => {
      renderTooltipContent(commit);
      tooltip.hidden = false;
      const box = event.currentTarget.getBoundingClientRect();
      positionTooltip({ clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 });
    })
    .on('blur', () => { tooltip.hidden = true; });
  svg.select('.dots').raise();
  svg.select('.brush .selection').raise();
}

function renderUnits(cutoff) {
  const visibleLines = allLines.filter((line) => line.datetime <= cutoff);
  const files = d3.rollups(visibleLines, (rows) => rows, (line) => line.file)
    .map(([file, lines]) => ({ file, lines, count: lines.length }))
    .sort((a, b) => d3.descending(a.count, b.count) || d3.ascending(a.file, b.file));
  fileUnits.replaceChildren();
  unitsSummary.textContent = `${d3.format(',')(visibleLines.length)} lines across ${d3.format(',')(files.length)} files through ${cutoff.toLocaleDateString('en', { dateStyle: 'medium' })}.`;
  for (const file of files) {
    const row = document.createElement('article');
    row.className = 'file-row';
    const header = document.createElement('div');
    header.className = 'file-row-heading';
    const name = document.createElement('h3');
    name.textContent = file.file;
    const count = document.createElement('span');
    count.textContent = `${d3.format(',')(file.count)} lines`;
    header.append(name, count);
    const units = document.createElement('div');
    units.className = 'code-units';
    units.setAttribute('role', 'img');
    const typeCounts = d3.rollups(file.lines, (rows) => rows.length, (line) => line.type)
      .map(([type, n]) => `${type.toUpperCase()} ${n}`).join(', ');
    units.setAttribute('aria-label', `${file.file}: ${file.count} lines. ${typeCounts}.`);
    units.setAttribute('title', `${file.file}: one square per line`);
    const fragment = document.createDocumentFragment();
    for (const line of file.lines) {
      const unit = document.createElement('span');
      unit.className = `code-unit language-${line.type}`;
      unit.style.setProperty('--unit-color', LANGUAGE_COLORS.get(line.type) ?? '#738197');
      unit.setAttribute('aria-hidden', 'true');
      fragment.append(unit);
    }
    units.append(fragment);
    row.append(header, units);
    fileUnits.append(row);
  }
}

function updateToIndex(index, { fromScroll = false } = {}) {
  currentIndex = Math.max(0, Math.min(index, commits.length - 1));
  const cutoffCommit = commits[currentIndex];
  activeCommits = commits.slice(0, currentIndex + 1);
  slider.value = String(Math.round(timeScale(cutoffCommit.datetime)));
  timeLabel.dateTime = cutoffCommit.datetime.toISOString();
  timeLabel.textContent = cutoffCommit.datetime.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
  storySteps.querySelectorAll('.story-step').forEach((step, stepIndex) => {
    step.classList.toggle('is-active', stepIndex === currentIndex);
    if (fromScroll) step.setAttribute('aria-current', stepIndex === currentIndex ? 'step' : 'false');
    else step.removeAttribute('aria-current');
  });
  if (brush && svg) svg.select('.brush').call(brush.move, null);
  updateScatterPlot(true);
  renderUnits(cutoffCommit.datetime);
  selectionCount.textContent = 'No commits selected';
  renderLanguageBreakdown(null);
}

function setupScrollytelling() {
  const scroller = scrollama();
  scroller.setup({
    container: '#commit-story',
    step: '#commit-story .story-step',
    offset: 0.55,
    threshold: 0.5,
    progress: false,
  }).onStepEnter(({ element }) => updateToIndex(Number(element.dataset.index), { fromScroll: true }));
  window.addEventListener('resize', scroller.resize);
}

try {
  allLines = await loadData();
  if (!allLines.length) throw new Error('The repository analysis file is empty. Regenerate meta/loc.csv.');
  commits = processCommits(allLines);
  renderStats(allLines, commits);
  renderStory();
  const [firstCommitTime, lastCommitTime] = d3.extent(commits, (commit) => commit.datetime);
  timeScale = d3.scaleTime().domain([firstCommitTime, lastCommitTime]).range([0, 100]);
  createScatterPlot();
  slider.addEventListener('input', () => {
    const cutoff = timeScale.invert(Number(slider.value));
    const latestVisible = d3.bisector((commit) => commit.datetime).right(commits, cutoff) - 1;
    updateToIndex(Math.max(0, latestVisible));
  });
  updateToIndex(commits.length - 1);
  setupScrollytelling();

  const types = [...new Set(allLines.map((line) => line.type))].sort();
  unitLegend.replaceChildren();
  for (const type of types) {
    const item = document.createElement('span');
    item.className = 'legend-item';
    const swatch = document.createElement('i');
    swatch.style.setProperty('--unit-color', LANGUAGE_COLORS.get(type) ?? '#738197');
    swatch.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = type.toUpperCase();
    item.append(swatch, label);
    unitLegend.append(item);
  }
} catch (error) {
  console.error('Unable to load repository analysis:', error);
  statsContainer.innerHTML = '<p class="error-message">Repository statistics could not be loaded.</p>';
  chartContainer.innerHTML = '<p class="error-message">Generate <code>meta/loc.csv</code> and refresh this page.</p>';
  storySteps.innerHTML = '<p class="error-message">The commit story could not be loaded.</p>';
  fileUnits.innerHTML = '<p class="error-message">The file map could not be loaded.</p>';
  selectionCount.textContent = 'Commit selection is unavailable.';
}
