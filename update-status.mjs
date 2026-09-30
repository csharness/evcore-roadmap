// Writes status.json for roadmap.csharness.com from the CS Harness project board (decision 0012).
//   ROADMAP_TOKEN=<token with read access to the project> node update-status.mjs [out-dir]
// Run hourly by .github/workflows/update-status.yml in the published repository, and by
// scripts/publish-roadmap.ps1 before each publish. Without a token it leaves status.json alone.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {roadmapStatus} from './status.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || here);
const OWNER = 'csharness', PROJECT = 1;
const QUERY = `query($cursor: String) { user(login: "${OWNER}") { projectV2(number: ${PROJECT}) { items(first: 100, after: $cursor) {
  pageInfo { hasNextPage endCursor }
  nodes { content { ... on DraftIssue { title } ... on Issue { title } }
    status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } } } } } } }`;

async function boardItems(token) {
  const items = [];
  let hidden = 0, cursor = null;
  do {
    const response = await fetch('https://api.github.com/graphql', {method: 'POST',
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'csharness-roadmap'},
      body: JSON.stringify({query: QUERY, variables: {cursor}})});
    const body = await response.json();
    if (!response.ok || body.errors) throw new Error(`GitHub: ${response.status} ${JSON.stringify(body.errors || body.message)}`);
    const page = body.data.user.projectV2.items;
    for (const node of page.nodes) {
      if (node.content?.title) items.push({title: node.content.title, status: node.status?.name || 'Backlog'});
      else hidden++; // an issue in a repository this token cannot read
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return {items, hidden};
}

const token = process.env.ROADMAP_TOKEN || '';
if (!token) {
  console.log('ROADMAP_TOKEN is not set: status.json left as it is.');
} else {
  const config = JSON.parse(await readFile(path.join(here, 'milestones.json'), 'utf8'));
  const {items, hidden} = await boardItems(token);
  const file = path.join(out, 'status.json');
  let previous = null;
  try { previous = JSON.parse(await readFile(file, 'utf8')); } catch { /* first run */ }
  if (hidden) console.log(`${hidden} board items are issues this token cannot read; milestones built from issues keep their last status.`);
  const status = roadmapStatus(config, items, new Date(), {previous, hidden});
  // Rewrite only when a milestone changed, so the hourly job does not commit a new time every hour.
  if (JSON.stringify(previous?.milestones) === JSON.stringify(status.milestones)) console.log('No roadmap change.');
  else { await writeFile(file, `${JSON.stringify(status, null, 2)}\n`); console.log(`status.json updated from ${items.length} board items.`); }
}
