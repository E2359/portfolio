import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

const statsContainer = document.querySelector('#stats');
const chartContainer = document.querySelector('#chart');
const tooltip = document.querySelector('#commit-tooltip');
const languageBreakdown = document.querySelector('#language-breakdown');
const languageHint = document.querySelector('#language-hint');
const selectionCount = document.querySelector('#selection-count');

let commits = [];
let xScale;
let yScale;

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
  return d3.groups(data, (row) => row.commit).map(([id, lines]) => {
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
    };

    Object.defineProperty(commit, 'lines', {
      value: lines,
      configurable: true,
      writable: true,
      enumerable: false,
    });

    return commit;
  });
}

function renderStats(data, commitData) {
  const files = d3.rollups(
    data,
    (rows) => d3.max(rows, (row) => row.line),
    (row) => row.file,
  );
  const averageFileLength = d3.mean(files, ([, lineCount]) => lineCount) ?? 0;
  const averageLineLength = d3.mean(data, (row) => row.length) ?? 0;
  const busiestDay = d3.greatest(
    d3.rollups(data, (rows) => rows.length, (row) => row.date.toLocaleDateString('en', { weekday: 'long' })),
    ([, count]) => count,
  )?.[0] ?? 'Not available';

  const stats = [
    ['Lines in current codebase', d3.format(',')(data.length)],
    ['Commits represented', d3.format(',')(commitData.length)],
    ['Files represented', d3.format(',')(files.length)],
    ['Average file length', `${d3.format(',.0f')(averageFileLength)} lines`],
    ['Average line length', `${d3.format('.1f')(averageLineLength)} characters`],
    ['Busiest weekday', busiestDay],
  ];

  statsContainer.replaceChildren();
  const list = d3.select(statsContainer).append('dl').attr('class', 'stats meta-stats');
  for (const [label, value] of stats) {
    const item = list.append('div');
    item.append('dt').text(label);
    item.append('dd').text(value);
  }
}

function renderTooltipContent(commit) {
  document.querySelector('#commit-link').href = commit.url;
  document.querySelector('#commit-link').textContent = commit.id;
  document.querySelector('#commit-date').textContent = commit.datetime.toLocaleDateString('en', {
    dateStyle: 'full',
  });
  document.querySelector('#commit-time').textContent = `${commit.datetime.toLocaleTimeString('en', {
    hour: 'numeric',
    minute: '2-digit',
  })} (${commit.timezone})`;
  document.querySelector('#commit-author').textContent = commit.author;
  document.querySelector('#commit-lines').textContent = d3.format(',')(commit.totalLines);
}

function updateTooltipVisibility(isVisible) {
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const gap = 14;
  const bounds = tooltip.getBoundingClientRect();
  const left = Math.min(event.clientX + gap, window.innerWidth - bounds.width - gap);
  const top = Math.min(event.clientY + gap, window.innerHeight - bounds.height - gap);
  tooltip.style.left = `${Math.max(gap, left)}px`;
  tooltip.style.top = `${Math.max(gap, top)}px`;
}

function showTooltip(event, commit) {
  renderTooltipContent(commit);
  updateTooltipVisibility(true);
  if (event.clientX !== undefined) {
    updateTooltipPosition(event);
  }
}

function renderLanguageBreakdown(selection) {
  const selectedCommits = selection
    ? commits.filter((commit) => isCommitSelected(selection, commit))
    : [];
  const lines = selectedCommits.flatMap((commit) => commit.lines);
  languageBreakdown.replaceChildren();

  if (lines.length === 0) {
    languageHint.hidden = false;
    return;
  }

  languageHint.hidden = true;
  const breakdown = d3.rollups(lines, (rows) => rows.length, (row) => row.type)
    .sort((a, b) => d3.descending(a[1], b[1]));

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = language.toUpperCase();
    dd.textContent = `${d3.format(',')(count)} lines · ${d3.format('.1~%')(proportion)}`;
    languageBreakdown.append(dt, dd);
  }
}

function renderSelectionCount(selection) {
  const count = selection
    ? commits.filter((commit) => isCommitSelected(selection, commit)).length
    : 0;
  selectionCount.textContent = count
    ? `${d3.format(',')(count)} commit${count === 1 ? '' : 's'} selected`
    : 'No commits selected';
}

function isCommitSelected(selection, commit) {
  if (!selection) return false;
  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function brushed(event) {
  const selection = event.selection;
  d3.select(chartContainer)
    .selectAll('circle.commit-dot')
    .classed('selected', (commit) => isCommitSelected(selection, commit));
  renderSelectionCount(selection);
  renderLanguageBreakdown(selection);
}

function renderScatterPlot(commitData) {
  const width = 1000;
  const height = 600;
  const margin = { top: 22, right: 28, bottom: 58, left: 78 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  chartContainer.replaceChildren();
  const svg = d3.select(chartContainer)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'group')
    .attr('aria-label', 'Scatterplot of commit dates and times. Use the brush to select commits.');

  const [minDate, maxDate] = d3.extent(commitData, (commit) => commit.datetime);
  const [minLines, maxLines] = d3.extent(commitData, (commit) => commit.totalLines);
  const safeMinDate = minDate ?? new Date(0);
  const safeMaxDate = maxDate && maxDate > safeMinDate
    ? maxDate
    : new Date(safeMinDate.getTime() + 24 * 60 * 60 * 1000);
  const safeMaxLines = Math.max(maxLines ?? 1, (minLines ?? 0) + 1);

  xScale = d3.scaleTime()
    .domain([safeMinDate, safeMaxDate])
    .range([usableArea.left, usableArea.right])
    .nice();
  yScale = d3.scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const radiusScale = d3.scaleSqrt()
    .domain([minLines ?? 0, safeMaxLines])
    .range([5, 22]);
  const colorScale = d3.scaleSequential(d3.interpolateWarm).domain([0, 24]);

  svg.append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width));

  const sortedCommits = d3.sort(commitData, (commit) => -commit.totalLines);
  const dots = svg.append('g').attr('class', 'dots');
  dots.selectAll('circle')
    .data(sortedCommits, (commit) => commit.id)
    .join('circle')
    .attr('class', 'commit-dot')
    .attr('cx', (commit) => xScale(commit.datetime))
    .attr('cy', (commit) => yScale(commit.hourFrac))
    .attr('r', (commit) => radiusScale(commit.totalLines))
    .attr('fill', (commit) => colorScale(commit.hourFrac))
    .attr('fill-opacity', 0.72)
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', (commit) => `${commit.author}, ${commit.datetime.toLocaleString()}, ${commit.totalLines} lines changed`)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).attr('fill-opacity', 1);
      showTooltip(event, commit);
    })
    .on('mousemove', (event) => updateTooltipPosition(event))
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).attr('fill-opacity', 0.72);
      updateTooltipVisibility(false);
    })
    .on('focus', (event, commit) => showTooltip(event, commit))
    .on('blur', () => updateTooltipVisibility(false));

  svg.append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(xScale).ticks(6));
  svg.append('g')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(d3.axisLeft(yScale).tickFormat((hour) => `${String(hour % 24).padStart(2, '0')}:00`));

  svg.append('text')
    .attr('class', 'axis-label')
    .attr('x', usableArea.left + usableArea.width / 2)
    .attr('y', height - 12)
    .attr('text-anchor', 'middle')
    .text('Commit date');
  svg.append('text')
    .attr('class', 'axis-label')
    .attr('transform', `translate(20, ${usableArea.top + usableArea.height / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .text('Time of day');

  const brush = d3.brush()
    .extent([[usableArea.left, usableArea.top], [usableArea.right, usableArea.bottom]])
    .on('start brush end', brushed);
  svg.append('g').attr('class', 'brush').call(brush);
  svg.selectAll('.dots, .overlay ~ *').raise();
}

try {
  const data = await loadData();
  if (!data.length) {
    throw new Error('The code analysis file is empty. Regenerate meta/loc.csv after committing your code.');
  }

  commits = processCommits(data);
  renderStats(data, commits);
  renderScatterPlot(commits);
} catch (error) {
  console.error('Unable to load repository analysis:', error);
  statsContainer.innerHTML = '<p class="error-message">Repository statistics could not be loaded.</p>';
  chartContainer.innerHTML = '<p class="error-message">Generate <code>meta/loc.csv</code> and refresh this page.</p>';
  selectionCount.textContent = 'Commit selection is unavailable.';
}
