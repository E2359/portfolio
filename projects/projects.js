import { fetchJSON, renderProjects } from '../global.js';

const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');

try {
  const projects = await fetchJSON('../lib/projects.json');
  renderProjects(projects, projectsContainer, 'h2');
  projectsTitle.textContent = `${projects.length} Projects`;
} catch (error) {
  console.error('Unable to load projects:', error);
  projectsContainer.innerHTML =
    '<p class="error-message">Projects could not be loaded right now.</p>';
}
