// Public roadmap status (decision 0012): turns project-board items into per-milestone progress.
// Items are {title, status} with the board's Status (Backlog, Todo, In Progress, Waiting, Done).
// Only counts leave this function: item titles are never published.
const ROADMAP = /^Roadmap (\d+):/;

export function itemsOf(milestone, items) {
  const numbers = new Set(milestone.roadmap || []);
  const titles = new Set(milestone.issues || []);
  return items.filter(item => {
    const m = ROADMAP.exec(item.title);
    return (m && numbers.has(Number(m[1]))) || titles.has(item.title) ||
      (milestone.issuePrefix && item.title.startsWith(milestone.issuePrefix));
  });
}

// shipped: everything done. in_progress: some done or being worked on. planned: nothing started.
export function milestoneStatus(milestone, items) {
  const mine = itemsOf(milestone, items);
  const done = mine.filter(i => i.status === 'Done').length;
  const started = mine.some(i => i.status === 'In Progress' || i.status === 'Waiting'); // Waiting: started, blocked on someone else
  let status = milestone.status || (!mine.length ? 'planned' : done === mine.length ? 'shipped' : done || started ? 'in_progress' : 'planned');
  if (!['shipped', 'in_progress', 'planned'].includes(status)) status = 'planned';
  return {id: milestone.id, status, done: milestone.status ? null : done, total: milestone.status ? null : mine.length};
}

// hidden: how many board items the token could not read (issues in the private repository appear
// redacted to a token without repository access). Then milestones built from issues keep their
// previous status instead of dropping to wrong counts; a publish with full access refreshes them.
export function roadmapStatus(config, items, now = new Date(), {previous = null, hidden = 0} = {}) {
  const before = Object.fromEntries((previous?.milestones || []).map(m => [m.id, m]));
  const usesIssues = m => Boolean(m.issues?.length || m.issuePrefix);
  return {updated: now.toISOString(), milestones: config.milestones.map(m =>
    hidden > 0 && usesIssues(m) && before[m.id] ? before[m.id] : milestoneStatus(m, items))};
}
