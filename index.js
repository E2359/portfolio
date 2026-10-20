import { fetchJSON, renderProjects, fetchGithubData } from './global.js';

const projectsContainer = document.querySelector('.latest-projects');
const profileStats = document.querySelector('#profile-stats');

try {
  const projects = await fetchJSON('./lib/projects.json');
  renderProjects(projects.slice(0, 3), projectsContainer, 'h3');
} catch (error) {
  console.error('Unable to load latest projects:', error);
  projectsContainer.innerHTML =
    '<p class="error-message">Latest projects could not be loaded right now.</p>';
}

try {
  const githubData = await fetchGithubData('E2359');

  profileStats.innerHTML = `
    <dl>
      <div><dt>Public repos</dt><dd>${githubData.public_repos}</dd></div>
      <div><dt>Public gists</dt><dd>${githubData.public_gists}</dd></div>
      <div><dt>Followers</dt><dd>${githubData.followers}</dd></div>
      <div><dt>Following</dt><dd>${githubData.following}</dd></div>
    </dl>
  `;
} catch (error) {
  console.error('Unable to load GitHub profile:', error);
  profileStats.innerHTML =
    '<p class="error-message">GitHub statistics are temporarily unavailable.</p>';
}
