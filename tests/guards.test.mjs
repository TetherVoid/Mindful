// The PreToolUse guards in scripts/hooks/, fed the JSON Claude Code sends them.
//
// A guard that silently stops matching is worse than none, because everyone
// goes on trusting it. Each case here is either something that must be blocked
// (exit 2) or something ordinary that must still work (exit 0). Several of the
// blocked cases are bypasses the gated-reviewer found on 2026-09-28; keep them.
//
// GUARD_HOOKS_DIR points the suite at a copy of the hooks, so a change to a
// guard can be tested before it is installed (the installed guards stop Claude
// editing scripts/hooks/ itself).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const hooks = process.env.GUARD_HOOKS_DIR ?? path.join(cwd, 'scripts/hooks')
const MIG = path.join(hooks, 'guard-migrations.mjs')
const REMOTE = path.join(hooks, 'guard-remote.mjs')

const OLD = 'supabase/migrations/20260911000300_classes.sql'

// Patch files for the `git apply` cases.
const scratch = mkdtempSync(path.join(tmpdir(), 'mindful-guards-'))
const badPatch = path.join(scratch, 'bad.patch')
const okPatch = path.join(scratch, 'ok.patch')
writeFileSync(badPatch, `diff --git a/${OLD} b/${OLD}\n--- a/${OLD}\n+++ b/${OLD}\n@@ -1 +1 @@\n-x\n+y\n`)
writeFileSync(okPatch, 'diff --git a/src/app/main.jsx b/src/app/main.jsx\n--- a/src/app/main.jsx\n+++ b/src/app/main.jsx\n')

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } })
const file = (tool_name, rel) => ({ tool_name, tool_input: { file_path: `${cwd}/${rel}` } })
const mcp = (tool_name) => ({ tool_name, tool_input: {} })

function blocked(hook, input) {
  const r = spawnSync('node', [hook], { cwd, input: JSON.stringify({ ...input, cwd }), encoding: 'utf8' })
  assert.ok(r.status === 0 || r.status === 2, `${hook} exited ${r.status}: ${r.stderr}`)
  return r.status === 2
}

const cases = {
  [MIG]: {
    block: [
      file('Edit', 'supabase/migrations/20260911000200_roles.sql'),
      file('Edit', 'supabase/migrations/20260911000800_ADMIN_USER_DIRECTORY.SQL'),
      file('Write', 'supabase/migrations/20260927000200_report_slot_eligibility.sql'),
      file('Write', 'supabase/migrations/20260101000000_sorts_too_early.sql'),
      file('Write', 'supabase/migrations/new-thing.sql'),
      file('Edit', '.claude/settings.json'),
      file('Write', '.claude/settings.local.json'),
      file('Edit', 'scripts/hooks/guard-remote.mjs'),
      file('Write', 'scripts/hooks/lib/shell.mjs'),
      bash(`rm ${OLD}`),
      bash(`sed -i '' 's/a/b/' ${OLD}`),
      bash('rm -rf supabase/migrations/*'),
      bash('git checkout -- supabase/migrations'),
      bash(`cd supabase/migrations && rm ${OLD.split('/').at(-1)}`),
      bash(`python3 -c "open('${OLD}','w').write('')"`),
      bash(`node -e "require('fs').writeFileSync('${OLD}', '')"`),
      bash(`git apply ${badPatch}`),
      bash(`patch -p1 < ${badPatch}`),
      bash('git apply'),
      bash(`echo x > ${OLD}`),
      bash('printf x > supabase/migrations/0001_x.sql'),
      bash(`mv ${OLD} /tmp/`),
      bash('echo "{}" > .claude/settings.json'),
      bash("sed -i '' 's/push/pull/' scripts/hooks/guard-remote.mjs"),
      bash('rm -rf scripts/hooks'),
      bash('git checkout -- .claude/settings.json'),
      file('Edit', 'scripts/lint-baseline.json'),
      bash(`echo '{"warnings": 99}' > scripts/lint-baseline.json`),
    ],
    allow: [
      file('Write', 'supabase/migrations/29990101000000_a_new_file.sql'),
      file('Edit', 'supabase/tests/010_roles_and_escalation_test.sql'),
      file('Edit', 'src/app/main.jsx'),
      file('Edit', '.claude/agents/reviewer.md'),
      file('Write', '.claude/skills/task-workflow/SKILL.md'),
      bash(`cat ${OLD}`),
      bash('grep -rn policy supabase/migrations/'),
      bash('grep -rn policy supabase/migrations/ | tee /tmp/out.txt'),
      bash(`cp ${OLD} /tmp/`),
      bash(`git diff HEAD -- ${OLD}`),
      bash(`git add supabase/migrations/29990101000000_a_new_file.sql && git commit -m "Mention ${OLD}"`),
      bash(`git apply ${okPatch}`),
      bash('cat > supabase/migrations/29990101000000_a_new_file.sql <<EOF\nselect 1;\nEOF'),
      bash('node scripts/hooks/guard-remote.mjs < /tmp/input.json'),
      bash('cat .claude/settings.json'),
      bash('npm run verify'),
    ],
  },
  [REMOTE]: {
    block: [
      bash('git push'),
      bash('git push origin main --force'),
      bash('cd /tmp && git -C /repo push'),
      bash("bash -c 'git push'"),
      bash('eval "git push"'),
      bash('echo $(git push)'),
      bash('supabase db push'),
      bash('npx supabase db push'),
      bash('npx supabase@latest db push --linked'),
      bash('/opt/homebrew/bin/supabase db push'),
      bash('./node_modules/.bin/supabase db push'),
      bash("sh -c 'supabase db push'"),
      bash('sudo npx supabase db push'),
      bash('supabase db push --dry-run -h'),
      bash('supabase link --project-ref abcdefghijklmnopqrst'),
      bash('supabase migration list'),
      bash('supabase db reset --linked'),
      bash('supabase db dump --linked -f out.sql'),
      bash('supabase migration repair --status applied 20260911000100'),
      bash('supabase functions deploy report'),
      bash('psql "postgresql://postgres@db.czvejcytunugftbspxmr.supabase.co:5432/postgres"'),
      bash('psql -h db.example.com -U postgres'),
      bash('curl https://example.supabase.co/rest/v1/profiles'),
      bash('curl "$VITE_SUPABASE_URL/rest/v1/profiles"'),
      bash('node --env-file=.env.local api/report.js'),
      bash('vercel'),
      bash('vercel --prod'),
      bash('vercel pull'),
      bash('vercel env add ANTHROPIC_API_KEY production'),
      bash('curl -X POST https://api.vercel.com/v13/deployments'),
      mcp('mcp__bc386342-62f9-4235-8afa-9d60dd7d9ee9__execute_sql'),
      mcp('mcp__bc386342-62f9-4235-8afa-9d60dd7d9ee9__list_tables'),
      mcp('mcp__bc386342-62f9-4235-8afa-9d60dd7d9ee9__some_future_tool'),
      mcp('mcp__0000-unknown__apply_migration'),
      mcp('mcp__plugin_vercel_vercel__create_deployment'),
      mcp('mcp__plugin_vercel_vercel__delete_project_env'),
      mcp('mcp__plugin_vercel_vercel__get_project_env'),
      mcp('mcp__fc1a17ec-07c5-4849-be48-9e0ae07755a3__update_project'),
    ],
    allow: [
      bash('git commit -m "Record the change"'),
      bash('git commit -m "guard: block git push"'),
      bash('git status && git log --oneline -3'),
      bash('supabase test db --local'),
      bash('supabase db reset'),
      bash('supabase migration new add_a_thing'),
      bash('supabase migration list --local'),
      bash('supabase status -o json'),
      bash('supabase functions serve'),
      bash('supabase inspect db bloat --local'),
      bash('supabase db push --help'),
      bash('psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select 1"'),
      bash('vercel dev'),
      bash('vercel build'),
      bash('vercel logs https://example.vercel.app'),
      bash('vercel deploy -h'),
      bash('cat vercel.json && grep -rn vercel src/'),
      bash('cat > notes.txt <<EOF\ngit push happens later\nEOF'),
      bash('npm run verify'),
      mcp('mcp__bc386342-62f9-4235-8afa-9d60dd7d9ee9__search_docs'),
      mcp('mcp__plugin_vercel_vercel__get_runtime_logs'),
      mcp('mcp__plugin_vercel_vercel__list_deployments'),
      mcp('mcp__9df21b6f-6344-49fe-877f-473cf3cca41e__search_threads'),
    ],
  },
}

const labelOf = (input) =>
  input.tool_input.command?.replace(/\n/g, '⏎') ??
  input.tool_input.file_path?.replace(`${cwd}/`, '') ??
  input.tool_name

for (const [hook, { block, allow }] of Object.entries(cases)) {
  const name = path.basename(hook)
  for (const input of block) test(`${name} blocks: ${labelOf(input)}`, () => assert.equal(blocked(hook, input), true))
  for (const input of allow) test(`${name} allows: ${labelOf(input)}`, () => assert.equal(blocked(hook, input), false))
}

test('unreadable hook input blocks rather than failing open', () => {
  for (const hook of [MIG, REMOTE]) {
    const r = spawnSync('node', [hook], { cwd, input: 'not json', encoding: 'utf8' })
    assert.equal(r.status, 2)
  }
})
