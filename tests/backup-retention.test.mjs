// scripts/backup-production.sh keeps production dumps for 30 days and no
// longer: the privacy page promises it. Only pruning and the refusals are
// tested here — `--prune-only` never contacts the database — against throwaway
// directories.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../scripts/backup-production.sh', import.meta.url))
const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const HOUR = 60 * 60 * 1000

// The script's own folder name for a backup taken `hoursAgo` ago (local time).
function stamp(hoursAgo) {
  const d = new Date(Date.now() - hoursAgo * HOUR)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function backupRoot() {
  const root = mkdtempSync(join(tmpdir(), 'mindful-backups-'))
  chmodSync(root, 0o700)
  return root
}

function backup(root, name, { marker = true } = {}) {
  const dir = join(root, name)
  mkdirSync(dir)
  writeFileSync(join(dir, 'backup-data.sql'), '-- dump')
  if (marker) writeFileSync(join(dir, '.mindful-backup'), '')
  return dir
}

function prune(dir) {
  return spawnSync('bash', [script, '--prune-only'], {
    env: { ...process.env, MINDFUL_BACKUP_DIR: dir },
    encoding: 'utf8',
  })
}

test('deletes a backup once its name is 29 days old, so a daily prune keeps nothing past 30', () => {
  const root = backupRoot()
  try {
    const gone = backup(root, `${stamp(29 * 24 + 1)}-pre-a`)
    const kept = backup(root, `${stamp(28 * 24)}-pre-b`)
    const r = prune(root)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(existsSync(gone), false)
    assert.equal(existsSync(kept), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('leaves alone anything it did not make: no marker, or a name that is not its own', () => {
  const root = backupRoot()
  try {
    const noMarker = backup(root, `${stamp(40 * 24)}-photos`, { marker: false })
    const notOurs = backup(root, 'notes')
    assert.equal(prune(root).status, 0)
    assert.equal(existsSync(noMarker), true)
    assert.equal(existsSync(notOurs), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a symlinked backup folder is followed, and pruned', () => {
  const root = backupRoot()
  const link = `${root}-link`
  try {
    const gone = backup(root, `${stamp(40 * 24)}-pre-c`)
    symlinkSync(root, link)
    assert.equal(prune(link).status, 0)
    assert.equal(existsSync(gone), false)
  } finally {
    rmSync(link, { force: true })
    rmSync(root, { recursive: true, force: true })
  }
})

test('refuses any folder inside the repository, however it is spelled', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'mindful-paths-'))
  const link = join(scratch, 'into-repo')
  symlinkSync(repo, link)
  try {
    for (const dir of [
      join(repo, 'bk'),
      join(repo, 'a', 'b', 'c'),
      repo.toLowerCase() + '/bk',
      join(scratch, 'nonexist') + '/../../../..' + repo + '/bk',
      join(link, 'bk'),
      'relative/bk',
    ]) {
      const r = prune(dir)
      assert.notEqual(r.status, 0, `accepted ${dir}`)
    }
    assert.equal(existsSync(join(repo, 'bk')), false)
    assert.equal(existsSync(join(repo, 'a')), false)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('refuses / and the home folder itself', () => {
  assert.notEqual(prune('/').status, 0)
  assert.notEqual(prune(homedir()).status, 0)
})

test('refuses an existing folder that is readable by others', () => {
  const root = backupRoot()
  try {
    chmodSync(root, 0o755)
    assert.notEqual(prune(root).status, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('git ignores dump files, so one cannot be committed by accident', () => {
  const r = spawnSync('git', ['check-ignore', '-q', 'backup-data.sql'], { cwd: repo })
  assert.equal(r.status, 0)
})
