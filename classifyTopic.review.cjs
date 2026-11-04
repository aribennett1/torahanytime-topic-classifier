#!/usr/bin/env node
'use strict';
/** Interactive local review of the actual production classifier's quarantine.
 * Node 18+, no dependencies, network, email or spreadsheet writes.
 * Decisions persist atomically. --apply embeds them into the self-contained .gs.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');
const HELP = `Usage:
  node classifyTopic.review.cjs
  node classifyTopic.review.cjs --title vayakhel
  node classifyTopic.review.cjs --list
  node classifyTopic.review.cjs --all
  node classifyTopic.review.cjs --apply

Default: review unresolved historical conflicts, grouping the same textual evidence
and historical labels. Shows a suggested classification, alternatives, or Ambiguous.
--title TEXT    Filter titles; also show conflicts the matcher now resolves itself.
--all           Include all quarantine reasons, not just historical conflicts.
--list          Preview groups and choices without making decisions.
--apply         Apply saved decisions to the .gs; back up original first. No prompts.
--script FILE   Default: classifyTopicNew.gs beside this script.
--state FILE    Default: .classifier-review/decisions.json beside this script.

During review:
  NUMBER        Pick a displayed choice for the displayed group.
  id:NUMBER     Assign any existing subtopic ID (use ? to list taxonomy).
  a             Mark group ambiguous; production will fail and notify administrator.
  s             Skip for now (will appear next run).
  t             Review this group's titles individually.
  l             List all titles in this group.
  ?             List supported subtopics.
  q             Quit; decisions already made are saved.

Decisions change the classifier only when you run --apply. Group choices apply to
ALL displayed group members; use t if they need different answers.
`;
function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp-' + process.pid;
  try { fs.writeFileSync(temporary, text); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function load(script) {
  const source = fs.readFileSync(script, 'utf8');
  const context = vm.createContext({ console });
  vm.runInContext(source, context, { filename: script, timeout: 10000 });
  vm.runInContext('this.review={normalizeTitle,deterministicClassification,textualEvidence,fuzzyCandidates,classifyTitle,taxonomy:CLASSIFIER_TAXONOMY,combinations:CLASSIFIER_COMBINATIONS,verified:VERIFIED_GROUPS,unverified:UNVERIFIED_GROUPS};', context);
  return { source, api: context.review };
}
function parseArgs(args) {
  const options = { script: path.join(__dirname, 'classifyTopicNew.gs'), state: path.join(__dirname, '.classifier-review', 'decisions.json') };
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    const assigned = arg.match(/^(--(?:title|script|state))=(.*)$/);
    if (assigned) { arg = assigned[1]; args.splice(i + 1, 0, assigned[2]); }
    if (['--title', '--script', '--state'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error('Missing value for ' + arg);
      options[arg.slice(2)] = args[++i];
    } else if (['--all', '--list', '--apply'].includes(arg)) options[arg.slice(2)] = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw Error('Unknown option: ' + arg);
  }
  options.script = path.resolve(options.script); options.state = path.resolve(options.state);
  if (options.script === options.state) throw Error('State and script must be separate files');
  return options;
}
function readState(options) {
  if (!fs.existsSync(options.state)) return { version: 1, script: options.script, decisions: {} };
  const state = JSON.parse(fs.readFileSync(options.state, 'utf8'));
  if (state.version !== 1 || state.script !== options.script || !state.decisions || typeof state.decisions !== 'object') throw Error('Review state belongs to another script or has invalid format');
  return state;
}
function saveState(file, state, previousHash) {
  const current = fs.existsSync(file) ? sha(fs.readFileSync(file)) : null;
  if (current !== previousHash) throw Error('Review state changed in another session. Restart to avoid overwriting decisions.');
  atomicWrite(file, JSON.stringify(state, null, 2) + '\n');
  return sha(fs.readFileSync(file));
}
function historicalLabels(api) {
  const labels = new Map();
  for (const [file, categoryId] of [['Parasha-Torah-Portion.json', 23], ['Holidays.json', 8]]) {
    const filePath = path.join(__dirname, 'subtopics', file);
    if (!fs.existsSync(filePath)) { console.error('Historical labels unavailable: ' + filePath); continue; }
    for (const row of JSON.parse(fs.readFileSync(filePath, 'utf8'))) {
      const taxon = api.taxonomy.find(t => t.categoryId === categoryId && t.subCategoryName === row.topic);
      if (!taxon || typeof row.title !== 'string') continue;
      const title = api.normalizeTitle(row.title);
      if (!labels.has(title)) labels.set(title, new Set());
      labels.get(title).add(taxon.subCategoryId);
    }
  }
  return labels;
}
function buildGroups(api, labels, state, options) {
  const groups = new Map();
  const filter = options.title ? api.normalizeTitle(options.title) : null;
  let automaticallyResolved = 0;
  for (const [reason, titles] of Object.entries(api.unverified)) {
    if (!options.all && !filter && !/conflict|competing|vayeira-tie/i.test(reason)) continue;
    for (const title of titles) {
      if (filter && !title.includes(filter)) continue;
      if (Object.hasOwn(state.decisions, title)) continue;
      const automatic = api.classifyTitle({ title });
      if (automatic.ok && !filter) { automaticallyResolved++; continue; }
      const direct = api.deterministicClassification(title);
      const textual = [...api.textualEvidence(title)].sort((a,b) => a-b);
      const fuzzy = api.fuzzyCandidates(title);
      const strongest = fuzzy.filter(c => c.distance === 1);
      const soleReference = textual.length === 1 && direct.reason === 'Parsha name without an explicit Parsha marker';
      const suggestion = direct.ok ? direct.classification.subCategoryId : soleReference ? textual[0] : textual.length === 0 && strongest.length === 1 ? strongest[0].id : null;
      const historical = [...(labels.get(title) || [])].sort((a,b) => a-b);
      const key = JSON.stringify([reason, suggestion, textual, historical, strongest.map(c=>c.id).sort((a,b)=>a-b)]);
      if (!groups.has(key)) groups.set(key, { reason, suggestion, evidence: direct.ok ? direct.reason : soleReference ? 'One explicit name, but no Parsha marker; reviewer confirmation required' : suggestion ? 'Unique one-edit textual match' : 'No unambiguous textual suggestion', textual, historical, fuzzy: fuzzy.map(c=>c.id), titles: [], automatic: automatic.ok });
      groups.get(key).titles.push(title);
    }
  }
  return { groups: [...groups.values()].sort((a,b) => b.titles.length-a.titles.length), automaticallyResolved };
}
function choicesFor(group, api) {
  const ids = new Set([group.suggestion, ...group.textual, ...group.historical, ...group.fuzzy].filter(Number.isInteger));
  for (const combo of api.combinations) if (ids.has(combo[0]) || ids.has(combo[1]) || ids.has(combo[2])) combo.forEach(id=>ids.add(id));
  return [...ids].map(id=>api.taxonomy.find(t=>t.subCategoryId===id)).filter(Boolean);
}
function showGroup(group, api, index) {
  const describe = id => api.taxonomy.find(t=>t.subCategoryId===id)?.subCategoryName || '(none)';
  console.log(`\nGroup ${index}: ${group.titles.length} title(s)`);
  console.log('Reason: ' + group.reason);
  console.log('Suggestion: ' + (group.suggestion ? describe(group.suggestion) : 'Ambiguous — no reliable textual suggestion'));
  console.log('Evidence: ' + group.evidence);
  console.log('Historical labels (unverified): ' + (group.historical.map(describe).join(', ') || 'No subtopic labels found'));
  for (const title of group.titles.slice(0, 5)) console.log('  • ' + title);
  if (group.titles.length > 5) console.log(`  … ${group.titles.length - 5} more; enter l to list all, t for individual review.`);
  const choices = choicesFor(group, api);
  choices.forEach((t,i)=>console.log(`${i+1}. ${t.subCategoryName} [${t.categoryName}; ID ${t.subCategoryId}]${t.subCategoryId===group.suggestion?' — suggested':''}`));
  console.log('a. Ambiguous — require manual classification');
  return choices;
}
function applyDecisions(options, state, source, api) {
  const verified = JSON.parse(JSON.stringify(api.verified));
  const unverified = JSON.parse(JSON.stringify(api.unverified));
  const known = new Set([...Object.values(verified).flat(), ...Object.values(unverified).flat()]);
  for (const [title, decision] of Object.entries(state.decisions)) {
    if (title !== api.normalizeTitle(title) || !known.has(title)) throw Error('State title no longer exists in classifier: ' + title);
    if (decision.action !== 'ambiguous' && !(decision.action === 'classify' && api.taxonomy.some(t=>t.subCategoryId===decision.subCategoryId))) throw Error('Invalid saved decision for ' + title);
  }
  const decided = new Set(Object.keys(state.decisions));
  if (!decided.size) { console.log('No saved decisions to apply.'); return; }
  for (const groups of [verified, unverified]) for (const key of Object.keys(groups)) groups[key] = groups[key].filter(title=>!decided.has(title));
  for (const [title, decision] of Object.entries(state.decisions)) {
    if (decision.action === 'classify') (verified[decision.subCategoryId] ||= []).push(title);
    else (unverified['Administrator marked title ambiguous; manual classification required'] ||= []).push(title);
  }
  for (const groups of [verified,unverified]) for (const key of Object.keys(groups)) groups[key] = [...new Set(groups[key])].sort();
  // Replace only the generated data declarations; preserve the current logic verbatim.
  const updated = source.replace(/^const VERIFIED_GROUPS = .*;$/m, () => 'const VERIFIED_GROUPS = ' + JSON.stringify(verified) + ';')
    .replace(/^const UNVERIFIED_GROUPS = .*;$/m, () => 'const UNVERIFIED_GROUPS = ' + JSON.stringify(unverified) + ';');
  if (updated === source) { console.log('Decisions already applied.'); return; }
  const check = vm.createContext({ console }); vm.runInContext(updated, check);
  for (const [title, decision] of Object.entries(state.decisions)) {
    const r = check.classifyTitle({title});
    if (decision.action === 'classify' ? !r.ok || r.classification.subCategoryId !== decision.subCategoryId : r.ok) throw Error('Decision validation failed for ' + title);
  }
  if (fs.readFileSync(options.script,'utf8') !== source) throw Error('Classifier changed during review. Retry --apply.');
  const backup = path.join(path.dirname(options.state), 'backups', path.basename(options.script) + '.' + Date.now() + '.bak');
  fs.mkdirSync(path.dirname(backup), {recursive:true}); fs.copyFileSync(options.script, backup, fs.constants.COPYFILE_EXCL);
  atomicWrite(options.script, updated);
  console.log(`Applied ${decided.size} saved decisions to ${options.script}\nBackup: ${backup}`);
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const {source,api} = load(options.script), state = readState(options);
  if (options.apply) { applyDecisions(options,state,source,api); return; }
  const {groups,automaticallyResolved} = buildGroups(api,historicalLabels(api),state,options);
  console.log(`${groups.length} pending groups; ${groups.reduce((n,g)=>n+g.titles.length,0)} titles. ${automaticallyResolved} now resolve automatically and were omitted.`);
  if (!groups.length) { console.log('No matching unresolved titles. Use --all or --title TEXT to broaden review.'); return; }
  if (options.list) { groups.forEach((group,i)=>showGroup(group,api,i+1)); return; }
  if (!process.stdin.isTTY) throw Error('Interactive review needs a terminal. Use --list for a read-only preview.');
  let stateHash = fs.existsSync(options.state) ? sha(fs.readFileSync(options.state)) : null;
  const terminal = readline.createInterface({input:process.stdin,output:process.stdout});
  let quit = false, saved = 0;
  async function review(group,index) {
    const choices = showGroup(group,api,index);
    for (;;) {
      const answer = (await terminal.question('Choose number / id:ID / a / s / t / l / ? / q: ')).trim().toLowerCase();
      if (answer==='q') {quit=true;return;}
      if (answer==='s') return;
      if (answer==='l') {group.titles.forEach(title=>console.log('  '+title));continue;}
      if (answer==='?') {api.taxonomy.forEach(t=>console.log(`id:${t.subCategoryId} ${t.categoryName} / ${t.subCategoryName}`));continue;}
      if (answer==='t') {
        if(group.titles.length===1){console.log('Already reviewing one title.');continue;}
        for (let i=0;i<group.titles.length&&!quit;i++) await review({...group,titles:[group.titles[i]]},`${index}.${i+1}`);
        return;
      }
      let decision;
      if(answer==='a') decision={action:'ambiguous'};
      else {
        const id=answer.startsWith('id:')?Number(answer.slice(3)):/^[1-9]\d*$/.test(answer)?choices[Number(answer)-1]?.subCategoryId:null;
        if(!Number.isInteger(id)||!api.taxonomy.some(t=>t.subCategoryId===id)){console.log('Choose a displayed number, id:ID, a, s, t, l, ?, or q.');continue;}
        decision={action:'classify',subCategoryId:id};
      }
      for(const title of group.titles) state.decisions[title]={...decision,reviewedAt:new Date().toISOString(),reason:group.reason};
      stateHash=saveState(options.state,state,stateHash);saved+=group.titles.length;
      console.log(`Saved ${group.titles.length} decision(s).`);return;
    }
  }
  try {for(let i=0;i<groups.length&&!quit;i++)await review(groups[i],i+1);}
  finally {terminal.close();}
  console.log(`Saved ${saved} decisions this session to ${options.state}.\nTo update the classifier, run: node classifyTopic.review.cjs --apply${options.script!==path.join(__dirname,'classifyTopicNew.gs')?' --script '+JSON.stringify(options.script):''}${options.state!==path.join(__dirname,'.classifier-review','decisions.json')?' --state '+JSON.stringify(options.state):''}`);
}
if(require.main===module)main().catch(error=>{console.error('Error: '+error.message);process.exitCode=1;});
module.exports={load,buildGroups,choicesFor,applyDecisions,readState,saveState,parseArgs};
