// roadmap.csharness.com (decision 0012): milestones.json (what we plan, in plain words) joined with
// status.json (progress from the project board, refreshed hourly), plus the latest Studio releases
// straight from the public releases repository. Everything is inserted as text, never as HTML.
const RELEASES = 'https://api.github.com/repos/csharness/evcore-studio-releases/releases?per_page=5';
const LABEL = {shipped: 'Shipped', in_progress: 'In progress', planned: 'Planned'};
const ORDER = {in_progress: 0, shipped: 1, planned: 2};

const el = (tag, {dataset, ...props} = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset); // dataset itself is read-only
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
};

// The bar's width is set through the CSSOM, which the page's style-src policy allows.
function progress(percent, label) {
  const bar = el('span');
  bar.style.width = `${percent}%`;
  const box = el('div', {className: 'progress'}, bar);
  box.setAttribute('role', 'img'); box.setAttribute('aria-label', label);
  return box;
}

function card(m, s) {
  const status = s?.status || 'planned';
  const counted = Number.isInteger(s?.total) && s.total > 0;
  const percent = counted ? Math.round(100 * s.done / s.total) : status === 'shipped' ? 100 : 0;
  return el('li', {className: `milestone ${status}`, dataset: {status}},
    el('div', {className: 'm-head'}, el('h3', {textContent: m.title}), el('span', {className: `pill ${status}`, textContent: LABEL[status]})),
    el('p', {textContent: m.summary}),
    progress(percent, counted ? `${s.done} of ${s.total} tasks done` : LABEL[status]),
    el('p', {className: 'm-foot'}, counted ? `${s.done} of ${s.total} tasks done` : status === 'shipped' ? 'Available now' : '',
      m.target ? el('span', {className: 'target', textContent: ` · Target: ${m.target}`}) : null));
}

function render(config, status) {
  const byId = Object.fromEntries((status?.milestones || []).map(s => [s.id, s]));
  const statusOf = m => byId[m.id]?.status || 'planned';
  const counts = {shipped: 0, in_progress: 0, planned: 0};
  for (const m of config.milestones) counts[statusOf(m)]++;
  document.getElementById('summary').replaceChildren(...['shipped', 'in_progress', 'planned'].map(key =>
    el('div', {className: `stat ${key}`}, el('b', {textContent: String(counts[key])}), el('span', {textContent: LABEL[key]}))));
  if (status?.updated) {
    const when = new Date(status.updated);
    document.getElementById('updated').textContent = Number.isNaN(when.getTime()) ? '' :
      `Progress last changed ${when.toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'})}. Checked every hour.`;
  }
  document.getElementById('products').replaceChildren(...config.products.map(p => {
    const mine = config.milestones.filter(m => m.product === p.id)
      .sort((a, b) => ORDER[statusOf(a)] - ORDER[statusOf(b)]);
    return el('section', {className: 'product', id: p.id},
      el('div', {className: 'p-head'}, el('h2', {textContent: p.name}), el('p', {textContent: p.tagline})),
      el('ol', {className: 'milestones'}, mine.map(m => card(m, byId[m.id]))));
  }));
  applyFilter(document.querySelector('.filters .on')?.dataset.filter || 'all');
}

function applyFilter(filter) {
  for (const button of document.querySelectorAll('.filters button')) {
    const on = button.dataset.filter === filter;
    button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on));
  }
  for (const card of document.querySelectorAll('.milestone')) card.hidden = filter !== 'all' && card.dataset.status !== filter;
  for (const product of document.querySelectorAll('.product'))
    product.hidden = ![...product.querySelectorAll('.milestone')].some(c => !c.hidden);
}

// Release notes are markdown: show their first bullet points as plain text.
const plain = text => {
  const lines = String(text || '').split('\n').map(l => l.trim());
  const bullets = [];
  for (const l of lines) { // a bullet may wrap onto the following lines
    if (/^[-*] /.test(l)) bullets.push(l);
    else if (l && bullets.length && !l.startsWith('#')) bullets[bullets.length - 1] += ` ${l}`;
    else if (!l && bullets.length) bullets.push('');
  }
  bullets.splice(0, bullets.length, ...bullets.filter(Boolean));
  return (bullets.length ? bullets : lines.filter(l => l && !l.startsWith('#'))).slice(0, 3)
    .map(l => l.replace(/^[-*] /, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`>#]/g, '').trim()).join(' · ').slice(0, 320);
};

async function releases() {
  const list = document.getElementById('releases');
  try {
    const response = await fetch(RELEASES, {headers: {Accept: 'application/vnd.github+json'}});
    if (!response.ok) throw new Error(String(response.status));
    const items = (await response.json()).filter(r => !r.draft && !r.prerelease);
    list.replaceChildren(...items.map(r => el('li', {},
      el('div', {className: 'r-head'}, el('b', {textContent: `Studio ${String(r.tag_name).replace(/^v/, '')}`}),
        el('time', {dateTime: r.published_at, textContent: new Date(r.published_at).toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'})})),
      el('p', {textContent: plain(r.body) || 'Improvements and fixes.'}))));
    if (!items.length) list.replaceChildren(el('li', {className: 'loading', textContent: 'No releases yet.'}));
  } catch {
    list.replaceChildren(el('li', {className: 'loading', textContent: 'Releases could not be loaded right now.'}));
  }
}

async function start() {
  document.querySelector('.filters').addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]');
    if (button) applyFilter(button.dataset.filter);
  });
  releases();
  try {
    const [config, status] = await Promise.all([
      fetch('./milestones.json', {cache: 'no-cache'}).then(r => r.json()),
      fetch('./status.json', {cache: 'no-cache'}).then(r => (r.ok ? r.json() : null)).catch(() => null)]);
    render(config, status);
  } catch {
    document.getElementById('products').replaceChildren(el('p', {className: 'loading', textContent: 'The roadmap could not be loaded. Please try again later.'}));
  }
}

start();
