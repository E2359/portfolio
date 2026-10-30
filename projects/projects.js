import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');
const summary = document.querySelector('.results-summary');
const clearButton = document.querySelector('.clear-filters');
const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const colors = d3.scaleOrdinal(d3.schemeTableau10);
const arcGenerator = d3.arc().innerRadius(0).outerRadius(49);
const sliceGenerator = d3.pie().value(d => d.value).sort(null);
let projects = [];
let query = '';
// Use a year instead of an index because slice positions change after searching.
let selectedYear = null;

function selectYear(year) {
  selectedYear = selectedYear === year ? null : year;
  updateView();
}

function renderPieChart(matchingProjects) {
  const data = d3.rollups(matchingProjects, group => group.length, d => String(d.year))
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => d3.descending(a.label, b.label));
  document.querySelector('.chart-empty').hidden = data.length > 0;
  svg.attr('hidden', data.length ? null : true);
  // Keyed joins update existing elements and remove stale chart/legend entries.
  const slices = svg.selectAll('path').data(sliceGenerator(data), d => d.data.label)
    .join('path')
    .attr('d', arcGenerator)
    .attr('fill', d => colors(d.data.label))
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', d => `${d.data.label}: ${d.data.value} project${d.data.value === 1 ? '' : 's'}`)
    .attr('aria-pressed', d => String(d.data.label === selectedYear))
    .classed('selected', d => d.data.label === selectedYear)
    .on('click', (_, d) => selectYear(d.data.label))
    .on('keydown', (event, d) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectYear(d.data.label);
      }
    });
  slices.selectAll('title').data(d => [d]).join('title')
    .text(d => `${d.data.label}: ${d.data.value} project${d.data.value === 1 ? '' : 's'}`);
  const entries = legend.selectAll('li').data(data, d => d.label).join('li')
    .attr('class', 'legend-item')
    .classed('selected', d => d.label === selectedYear)
    .style('--color', d => colors(d.label));
  const buttons = entries.selectAll('button').data(d => [d]).join('button')
    .attr('type', 'button')
    .attr('aria-label', d => `${d.label}: ${d.value} project${d.value === 1 ? '' : 's'}`)
    .attr('aria-pressed', d => String(d.label === selectedYear))
    .on('click', (_, d) => selectYear(d.label));
  buttons.selectAll('.swatch').data(d => [d]).join('span')
    .attr('class', 'swatch').attr('aria-hidden', 'true');
  buttons.selectAll('.legend-label').data(d => [d]).join('span')
    .attr('class', 'legend-label').text(d => `${d.label} (${d.value})`);
}

function updateView() {
  // Shared pipeline: both search and year filters apply, regardless of input order.
  const matchingProjects = projects.filter(project =>
    Object.values(project).join('\n').toLowerCase().includes(query),
  );
  const visibleProjects = matchingProjects.filter(project =>
    selectedYear === null || String(project.year) === selectedYear,
  );
  renderProjects(visibleProjects, projectsContainer, 'h2');
  if (!visibleProjects.length) {
    const message = document.createElement('p');
    message.className = 'empty-message';
    message.textContent = 'No projects match these filters. Try another search or clear the filters.';
    projectsContainer.append(message);
  }
  // Keep search-matching years available for switching and deselecting the year.
  renderPieChart(matchingProjects);
  projectsTitle.textContent = `${visibleProjects.length} Project${visibleProjects.length === 1 ? '' : 's'}`;
  summary.textContent = `Showing ${visibleProjects.length} of ${projects.length} projects${selectedYear ? ` · Year: ${selectedYear}` : ''}${query ? ` · Search: “${searchInput.value.trim()}”` : ''}`;
  clearButton.hidden = !query && selectedYear === null;
}

searchInput.addEventListener('input', event => {
  query = event.target.value.trim().toLowerCase();
  updateView();
});
clearButton.addEventListener('click', () => {
  query = '';
  selectedYear = null;
  searchInput.value = '';
  updateView();
  searchInput.focus();
});

try {
  projects = await fetchJSON('../lib/projects.json');
  colors.domain([...new Set(projects.map(d => String(d.year)))].sort().reverse());
  updateView();
} catch (error) {
  console.error('Unable to load projects:', error);
  projectsContainer.innerHTML = '<p class="error-message">Projects could not be loaded. Please refresh to try again.</p>';
  summary.textContent = 'Project data could not be loaded.';
  searchInput.disabled = true;
}
