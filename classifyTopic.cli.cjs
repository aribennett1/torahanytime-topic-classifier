#!/usr/bin/env node
'use strict';
/** Terminal adapter for the actual Apps Script classifier. Node 18+, no packages.
 * No email, spreadsheet writes, or publishing. Hebcal reads are enabled unless
 * --offline or --calendar FILE is supplied. Calendar cache lasts for this session.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const readline = require('node:readline/promises');

const help = `Usage:
  node classifyTopic.cli.cjs "Parshas Breishis"
  node classifyTopic.cli.cjs --date 2026-02-09 "Parshas Mishpatmi"
  node classifyTopic.cli.cjs --interactive

Options:
  --date DATE           Publication date: YYYY-MM-DD, M/D/YYYY, or M-D-YYYY
                       (US month/day order; defaults to today in New York).
  --today DATE          Override NOW for the Vayeira/Va'eira calendar tiebreaker.
  --israel             Use Israel's calendar.
  --diaspora           Use the diaspora calendar (otherwise require agreement).
  --offline            Disable Hebcal; definite matches still work.
  --calendar FILE      Use saved Hebcal JSON instead of the network. For two
                       regions, provide {"israel": {...}, "diaspora": {...}}.
  --no-history         Bypass verified AND quarantined titles to test rules alone.
  --script FILE        Apps Script path (default: classifyTopicNew.gs beside CLI).
  --interactive, -i    Prompt repeatedly; enter :quit to exit.
  --help, -h           Show this help.

Results are JSON with certainty, evidence score, reason and candidate IDs.
Unique strong spelling matches work offline; calendar resolves competing matches.
Evidence scores are not probabilities. No emails or spreadsheet logs are sent.
Exit codes: 0 = success, 2 = manual review, 1 = command/setup error.
Interactive mode continues after individual failures.
`;

function localToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function main() {
  const options = { script: path.join(__dirname, 'classifyTopicNew.gs'), date: localToday(), today: localToday() };
  const titleParts = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    // Accept --date=value as well as --date value for all value-taking options.
    const assignment = arg.match(/^(--(?:date|today|script|calendar))=(.*)$/);
    if (assignment) {
      arg = assignment[1];
      args.splice(i + 1, 0, assignment[2]);
    }
    if (arg === '--') { titleParts.push(...args.slice(i + 1)); break; }
    if (arg === '--help' || arg === '-h') { process.stdout.write(help); return; }
    if (['--date', '--today', '--script', '--calendar'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = args[++i];
    } else if (arg === '--israel' || arg === '--diaspora') {
      const region = arg === '--israel';
      if (options.israel !== undefined && options.israel !== region) throw Error('Choose --israel or --diaspora');
      options.israel = region;
    } else if (arg === '--offline') options.offline = true;
    else if (arg === '--no-history') options.noHistory = true;
    else if (arg === '--interactive' || arg === '-i') options.interactive = true;
    else if (arg.startsWith('-')) throw Error(`Unknown option: ${arg}`);
    else titleParts.push(arg);
  }
  if (options.offline && options.calendar) throw Error('Choose --offline or --calendar');
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(options.script, 'utf8'), context, { filename: options.script, timeout: 10000 });
  if (typeof context.classifyTitle !== 'function') throw Error('Selected script does not expose classifyTitle; use classifyTopicNew.gs');
  const normalizeDateOption = (value, flag) => {
    const us = value.match(/^(\d{1,2})([/-])(\d{1,2})\2(\d{4})$/);
    const normalized = us ? `${us[4]}-${us[1].padStart(2, '0')}-${us[3].padStart(2, '0')}` : value;
    if (!context.validDate(normalized)) throw Error(`${flag} must be a valid date: YYYY-MM-DD, M/D/YYYY, or M-D-YYYY (US month/day order)`);
    return normalized;
  };
  options.date = normalizeDateOption(options.date, '--date');
  options.today = normalizeDateOption(options.today, '--today');
  if (options.noHistory) vm.runInContext(`
    Object.keys(VERIFIED_TITLES).forEach(key => delete VERIFIED_TITLES[key]);
    Object.keys(UNVERIFIED_TITLES).forEach(key => delete UNVERIFIED_TITLES[key]);
  `, context);
  const fixture = options.calendar ? JSON.parse(fs.readFileSync(options.calendar, 'utf8')) : null;
  const cache = new Map();

  async function classify(title) {
    const request = { title, publicationDate: options.date };
    if (options.israel !== undefined) request.israel = options.israel;
    let result;
    // Apps Script calls calendar synchronously. Discover each requested range, fetch
    // asynchronously in Node, then rerun the SAME production logic with cached JSON.
    for (let attempt = 0; attempt < 5; attempt++) {
      let pending;
      result = context.classifyTitle(request, {
        today: () => options.today,
        calendar(start, end, israel) {
          if (options.offline) throw Error('Hebcal disabled by --offline');
          if (fixture) {
            const data = fixture.items ? fixture : fixture[israel ? 'israel' : 'diaspora'];
            if (!data) throw Error(`Fixture is missing ${israel ? 'israel' : 'diaspora'} calendar`);
            return data;
          }
          const key = `${start}:${end}:${israel}`;
          if (cache.has(key)) {
            const entry = cache.get(key);
            if (entry.error) throw Error(entry.error);
            return entry.data;
          }
          pending = { start, end, israel, key };
          throw Error('Calendar fetch pending');
        }
      });
      if (!pending) break;
      const { start, end, israel, key } = pending;
      const params = new URLSearchParams({ v: '1', cfg: 'json', s: 'on', maj: 'on', min: 'on', mf: 'on', lg: 's', leyning: 'off', i: israel ? 'on' : 'off', start, end });
      try {
        const response = await fetch(`https://www.hebcal.com/hebcal?${params}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error(`Hebcal HTTP ${response.status}`);
        cache.set(key, { data: await response.json() });
      } catch (error) {
        cache.set(key, { error: `Hebcal request failed: ${error.message}` });
      }
    }
    console.log(JSON.stringify({ request, today: options.today, history: !options.noHistory, calendar: options.offline ? 'offline' : options.calendar || 'live Hebcal', ...result }, null, 2));
    return result.ok;
  }

  const title = titleParts.join(' ');
  if (title) {
    const ok = await classify(title);
    if (!options.interactive) { process.exitCode = ok ? 0 : 2; return; }
  }
  if (!options.interactive && !process.stdin.isTTY) throw Error('Supply a title or use --interactive. Run --help for examples.');
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.error(`Manual testing; publication date ${options.date}. Enter :quit to exit. No emails or spreadsheet writes.`);
  try {
    for (;;) {
      let line;
      try { line = await terminal.question('Title> '); }
      catch (error) { if (error.code === 'ERR_USE_AFTER_CLOSE') break; throw error; }
      if (line.trim() === ':quit') break;
      if (line.trim()) await classify(line);
    }
  } finally { terminal.close(); }
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
