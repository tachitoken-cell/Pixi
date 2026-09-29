const input = document.querySelector('#wiki-search');
const results = document.querySelector('#results');
const status = document.querySelector('#search-status');
const panel = document.querySelector('.search-results');
const page = document.querySelector('.page-content');
let indexPromise;
let request = 0;

async function search() {
  const version = ++request;
  const query = input.value.trim().slice(0, 160);
  panel.hidden = !query;
  page.hidden = !!query;
  const url = new URL(location.href);
  if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
  history.replaceState(null, '', url);
  if (!query) return;
  status.textContent = 'Searching articles…';
  results.replaceChildren();
  try {
    indexPromise ||= fetch('/search-index.json').then(response => {
      if (!response.ok) throw new Error('Search unavailable');
      return response.json();
    }).catch(error => { indexPromise = null; throw error; });
    const index = await indexPromise;
    if (version !== request) return;
    const terms = query.toLocaleLowerCase().split(/\s+/);
    const matches = index.filter(article => terms.every(term => `${article.title} ${article.summary} ${article.category} ${article.text}`.toLocaleLowerCase().includes(term)))
      .sort((a, b) => Number(b.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())) - Number(a.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    status.textContent = matches.length ? `${matches.length} ${matches.length === 1 ? 'article' : 'articles'} found for “${query}”` : `No articles found for “${query}”. Try a creature’s name, a place, or a shorter phrase.`;
    for (const article of matches) {
      const link = document.createElement('a');
      link.className = 'search-result';
      link.href = `/${article.slug}/`;
      const category = document.createElement('span'); category.textContent = article.category;
      const title = document.createElement('h2'); title.textContent = article.title;
      const summary = document.createElement('p'); summary.textContent = article.summary;
      link.append(category, title, summary); results.append(link);
    }
  } catch {
    if (version === request) status.textContent = 'Search could not load. Try again, or browse the chapters in the navigation.';
  }
}
input.addEventListener('input', search);
document.querySelector('.search').addEventListener('submit', event => { event.preventDefault(); search(); });
document.querySelector('#clear-search').addEventListener('click', () => { input.value = ''; search(); input.focus(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.activeElement === input) { input.value = ''; search(); }
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { event.preventDefault(); input.focus(); }
});
const chapters = document.querySelector('.chapters');
const mobile = matchMedia('(max-width: 760px)');
function navigation() { chapters.open = !mobile.matches; }
navigation(); mobile.addEventListener('change', navigation);
input.value = new URLSearchParams(location.search).get('q') || '';
if (input.value) search();
