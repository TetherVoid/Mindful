# Packet A: guard bypass fixes and read-only for-loops (not applied)

Patch: `guard-bypasses.patch` (`git diff --no-index --no-prefix a b`, repo-relative, -p1).
`a/` is an untouched copy of the installed guards. Only `b/` was edited. Nothing in
the real repo was changed. The human applies the patch: guard-migrations refuses
`git apply` of a patch that touches scripts/hooks/.

What is excluded, as the gated review asked: `lib/code.mjs`, `heredocQuoted` and the
heredoc relaxation. Heredoc code is as strict as today. A Python heredoc that has
`supabase db push` inside a string is still blocked, and a test asserts it.

## Revision 4.1

This revision closes the reviewer's two LOW notes:
- **sed:** every argument other than the script must now be exactly `-n` or a
  file (not starting with `-`). This covers GNU sed options after the script.
  Test: `sed -n 1p -e 'w x' "$f"` in a migrations loop is BLOCKED.
- **file:** dropped from `LOOP_READERS`. Test: `file -C -m x "$f"` in a migrations
  loop is BLOCKED.

**Results:**
- New tests vs packetA/a: 240 tests, 211 pass, 29 fail (the same 29 as before).
- New tests vs packetA/b: 240/240 pass.
- Original tests vs packetA/b: 149/149 pass.
- oxlint: exit 0.

**Patch:** 4 files changed, 356 insertions(+), 24 deletions(-).

## Revision 4 (final): the waiver has its own reader list

This revision follows the gated review's finding 1. `readOnlyLoopCall` no longer
uses `READERS`/`readsOnly`. It uses `LOOP_READERS` / `loopReads()`:
- **Allowed:** cat, head, tail, wc, grep, egrep, fgrep, ls, stat, file, diff, cmp,
  md5, shasum, sha256sum, cut, nl, basename, dirname, realpath, readlink, echo,
  printf (not `-v`), test, `[`.
- **Also allowed:** cp/install (target checked as before), a plain `cd`, and the
  bare loop keywords.
- **sed:** only when every option is `-n` and the script (the first operand)
  matches `^[0-9,]+p$`. So `sed -n 1,3p "$f"` passes, but `sed -n "w $f"` and
  `sed -e …` do not.
- **Everything else refuses the waiver.** That includes awk, rg, ag, sort, uniq,
  tree, jq, bat, less, more, du, git (any subcommand), node, claude, open, code,
  psql, and find outside `$(…)`. Inside `$(…)`, ls and find without actions are
  still accepted, as in revision 3.
- The global `READERS`/`readsOnly` is unchanged. Tightening it is a separate
  follow-up.

**New block tests.** Each is a loop over `supabase/migrations/*.sql` whose body is:
- `sed -n "w $f" /dev/null`
- `sort -o "$f" "$f"`
- `git diff --output="$f"`
- `rg --pre=rm x "$f"`
- `awk 'BEGIN{print "" > ARGV[1]}' "$f"`
- `uniq "$f" "$f"`
- `tree -o "$f"`

**Allow cases.** All kept unchanged. The `sed -n 1,3p "$f"` case already fits the
allowed sed form, so no test needed rewriting.

**Results (revision 4).**
- New test file against **packetA/a**: 238 tests, 209 pass, 29 fail. These are
  the same 29 failures as revision 3. a/ already blocks the seven new cases,
  because it checks the loop header.
- New test file against **packetA/b**: 238/238 pass.
- Original test file against **packetA/b**: 149/149 pass.
- oxlint on packetA/b: exit 0.

## Revision 3: a whole-call rule replaces the per-body rule

The reviewer found two more regressions. Both came from dropping a/'s check of the
loop header:
- a quoted or escaped `done` (or `done)` in a `case`) ends the body early in the
  guard's view but not in bash's;
- a shell function such as `cat() { rm "$@"; }` makes a "reader" in the body
  delete files.

**Change (guard-migrations.mjs).**
- **Header restored.** The `for` header is classified exactly as in a/: it is not a
  reader, so its list goes through the generic "names a protected path" check from
  the tracked folder. So a loop over a protected list is blocked by default, as
  today.
- **Stricter header checks.** The list is also classified from the repo root, which
  catches `(cd /tmp); for f in supabase/migrations/*…`. The header is refused
  outright when the folder can't be followed:
  - `pushd`, `popd` or `CDPATH` appears anywhere in the call;
  - a `cd` has an option, `$`, `~`, `-`, more than one target, or an assignment
    in front.
- **One exception, `readOnlyLoopCall(cmd, commands, loops)`.** The header block is
  waived only when all of these hold across the whole call, meaning every command
  `parseCommands` returns:
  - every command is either:
    - a reader from `readsOnly`, except node, claude, code, open and psql, which
      run other code;
    - a `cd` with one plain target;
    - `cp`/`install` (its target is still checked as before);
    - the loop header;
    - a command made only of for/do/done/in;
  - no wrappers (xargs, exec, env, sudo, …), and none of eval, source, `.`,
    alias, pushd, popd, exec, xargs, read, `function`, or `printf -v`;
  - no variable assignment (`NAME=…`), and no `IFS` or `CDPATH` anywhere in the
    text;
  - no function definition in the text (`name()` or `function`);
  - no quoted or escaped do/done in the text: `"done"`, `\done`, a line
    continuation before `done`, `done "…`, or `done)`. As a fallback for what the
    parser can't tell, the counts of `do` and of `done` words must each equal the
    number of `for` loops. I used "equal to the number of loops" rather than "more
    than once" so nested loops still work. It is at least as strict for a single
    loop;
  - every `$` in the text is a loop variable (`$f`, `${f}`) or a `$(`. Every
    `$(…)`/backtick segment parses to only `ls`, or `find` without
    -exec/-delete/…, with no redirects or wrappers. Anything else (`${f%.sql}`,
    `$HOME`, `$1`, a lone `$`) refuses the waiver.
- The revision-2 per-body rule and its `cwdAt` pass are gone. Kept unchanged:
  - `cd` tracking;
  - inner-first expansion of nested loops;
  - the `$SUB` heredoc-tag refusal;
  - the shell.mjs changes (RESERVED, `inlineCode`, versioned interpreters,
    heredoc terminator);
  - guard-remote's inline-code check;
  - the glob/`$` rule and the `fromSub` rules.
- `fromSub` now also applies to a non-waived header, so
  `for f in $(…)` in a call naming protected paths is refused unless the call is
  read-only.

**New block tests:**
- `do echo "done"; g=$f; rm $g`
- `do echo \done; g=$f; rm $g`
- a line continuation before `done`
- `cat() { rm "$@"; }; for … do cat "$f"; done`
- `function cat { … }`
- `pushd supabase; for …`
- `IFS=, ; for …`
- `CDPATH=supabase cd migrations && for …`
- `cd -P supabase && for … rm`
- `${f%.sql}` in the body
- `$(ls … | xargs rm)` in the list

All allow cases from revision 2 still fit the whole-call rule and pass: grep, head,
wc, the `sed -n` redirect to /tmp, cp to /tmp, and the two `cd` variants with
readers. None needed loosening.

## Revision 2: the gated re-review's HIGH regression, fixed (superseded in part by revision 3)

**Bug.** The loop rule decided whether a loop's list was protected from the repo
root, never from the folder the shell was in. The loop header itself was not
checked, and only the loop variable was expanded. So
`cd supabase && for f in migrations/*.sql; do g=$f; rm $g; done` was allowed, while
the original guard blocks it.

**Fix (guard-migrations.mjs, `checkBash`).**
- (a) **Folder at the header.** Before the loop rule runs, `cwdAt[i]` records the
  folder at each command, following `cd` the same way as the main loop. A loop's
  list counts as protected if it is protected seen from the root **or** from the
  folder at its header. The "or" also covers a subshell `(cd /tmp); …`, where the
  tracked folder is wrong. A `cd` whose target cannot be read (contains `$` or `~`,
  or is `-`) makes the folder unknown from there on. Any loop after it then counts
  as protected.
- (b) **Belt and braces.** If the list is protected, each body command must:
  - be a reader, `cd`, `cp`/`install`, or a bare keyword. Anything else is refused.
  - not set a variable. That rules out a leading `NAME=…` and `printf -v`; `read`
    is not a reader, so it is refused too.
  - not use any `$` variable other than the loop variables (this loop's and any
    loop nested in its body) or a `$(…)` placeholder. `$OTHER`, `$g`, `$1` and
    `$@` are refused.
- Nested loops are expanded inner first, so `for g in $f` inside `for f in …`
  ends with real paths.
- **Computed heredoc tag (reviewer follow-up).** In shell.mjs, a heredoc tag
  containing `$(…)` or a backtick (`$SUB`) emits the opaque marker. guard-remote
  refuses the call, because where the body ends, and so what follows it, cannot be
  known.

## Hunks

### `scripts/hooks/lib/shell.mjs`
1. **RESERVED in `normalise()`.** It now skips `do then else elif if while until ! {`,
   so the program is the word after them. This closes the `do git push`,
   `then git push` and `{ git push; }` bypasses.
2. **`inlineCode`.** For an interpreter given `-c`, `-e`, `--eval` or `--print`, the
   code argument is now recorded on the command.
3. **Versioned interpreters (finding 7b).** Names that match
   `/^(python|node|ruby|perl)[\d.]*$/` are treated as interpreters.
4. **Heredoc terminator (finding 3).** A body ends only at a line that is exactly the
   tag. With `<<-`, leading tabs are stripped first, and the dash is tracked per tag.
5. **Computed heredoc tag.** A `$(…)` or backtick tag emits the opaque marker, so the
   call is refused (new in revision 2).

### `scripts/hooks/guard-remote.mjs`
6. Applies `REMOTE_IN_CODE` to `inlineCode`, strictly. The header comment is updated.

### `scripts/hooks/guard-migrations.mjs`
7. **`classify()`.** A migrations file name containing `* ? [ $` counts as the whole
   folder.
8. **`$(…)` rules.** A non-reader that gets a `$(…)` path (as an argument, a redirect
   target, a `cp`/`install` target or an `mv` operand) is refused when the call names
   a protected path other than the repo root.
9. **Read-only `for` loops.**
   - `loopsOf()` finds each loop and its body.
   - `expandLoops()` checks each command once per list value, inner loops first.
   - The header is not classified.
   - Strict body rule as in revision 2 above: list checked from the root or the
     folder at the header, no assignments, no foreign variables, readers only.

### `tests/guards.test.mjs`
10. Cases for all of the above. All earlier cases are kept. Revision 2 adds:
    - BLOCK:
      - `cd supabase && for f in migrations/*.sql; do g=$f; rm $g; done`
      - `cd supabase && for f in migrations/*.sql; do rm "$f"; done`
      - `cd supabase/migrations && for f in *.sql; do rm "$f"; done`
      - `(cd /tmp); for f in supabase/migrations/*.sql; do g=$f; rm $g; done`
      - `cd "$HOME/x" && for f in *.sql; do g=$f; rm $g; done`
      - a loop body using `printf -v g`
      - a loop body using `read g <<< "$f"`
      - a loop body using `"$OTHER"`
      - nested `for d in supabase/migrations; do for f in $d/*.sql; do rm "$f"; done; done`
      - `cat > /tmp/n.txt <<$(echo EOF)…`
      - ``cat > /tmp/n.txt <<`echo EOF`…``
    - ALLOW:
      - `cd supabase && for f in migrations/*.sql; do grep -l x "$f"; done`
      - `cd supabase/migrations && for f in *.sql; do head -1 "$f"; done`

## Test results (revision 3)

- New test file against **packetA/a**: 231 tests, 202 pass, 29 fail. That is the
  26 from revision 2 below plus three revision-3 cases a/ lets through:
  - `CDPATH=supabase cd migrations && for f in *.sql; do rm "$f"; done`
  - `cd -P supabase && for f in migrations/*.sql; do rm "$f"; done`
  - `pushd supabase; for f in migrations/*.sql; do rm "$f"; done`

  The other new block cases (quoted/escaped `done`, the `cat()` and `function cat`
  shadowing, `IFS=,`, `${f%.sql}`, `$(… | xargs rm)`) are already blocked by a/,
  because a/ classifies the header. They are regression tests for b/.
- New test file against **packetA/b**: 231/231 pass.
- Original test file against **packetA/b**: 149/149 pass.
- oxlint on packetA/b: exit 0, no diagnostics.

One run took 393s because a single spawn of guard-remote stalled. That hook takes
0.04s when run directly, and a re-run of the full b/ suite took 12s, so the stall
was the environment, not the code.

## Test results (revision 2, for reference)

New test file against **packetA/a** (original hooks): 220 tests, 194 pass, 26 fail.
The three `cd` block cases the review asked for pass on a/: the original already
blocks them, because it classifies the list. In b/ they guard against the
regression. The failures are:
- new block cases;
- the for-loop allow cases (including the two `cd` allow cases);
- one heredoc-terminator allow case: the original reads `  EOF` as the end, then
  parses `git push is mentioned here` as a command.

```
✖ guard-migrations.mjs allows: cd supabase && for f in migrations/*.sql; do grep -l x "$f"; done
✖ guard-migrations.mjs allows: cd supabase/migrations && for f in *.sql; do head -1 "$f"; done
✖ guard-migrations.mjs allows: for f in supabase/migrations/*.sql; do cp "$f" /tmp/; done
✖ guard-migrations.mjs allows: for f in supabase/migrations/*.sql; do echo "== $f"; sed -n 1,3p "$f"; done > /tmp/heads.txt
✖ guard-migrations.mjs allows: for f in supabase/migrations/*.sql; do grep -l "class_overview" "$f"; done
✖ guard-migrations.mjs allows: for f in supabase/migrations/*.sql⏎do⏎  wc -l "$f"⏎done
✖ guard-migrations.mjs allows: for f in supabase/migrations/*; do head -3 "$f"; done
✖ guard-migrations.mjs blocks: (cd /tmp); for f in supabase/migrations/*.sql; do g=$f; rm $g; done
✖ guard-migrations.mjs blocks: cd "$HOME/x" && for f in *.sql; do g=$f; rm $g; done
✖ guard-migrations.mjs blocks: for f in $(ls supabase/migrations/*.sql); do rm $f; done
✖ guard-migrations.mjs blocks: rm $(find supabase -name '*.sql')
✖ guard-migrations.mjs blocks: rm $(ls supabase/migrations/*.sql)
✖ guard-migrations.mjs blocks: rm supabase/migrations/2026*.sql
✖ guard-remote.mjs allows: cat > notes.txt <<EOF⏎  EOF⏎git push is mentioned here⏎EOF
✖ guard-remote.mjs blocks: cat > /tmp/n.txt <<$(echo EOF)⏎hello⏎EOF⏎git push
✖ guard-remote.mjs blocks: cat > /tmp/n.txt <<`echo EOF`⏎hello⏎EOF
✖ guard-remote.mjs blocks: for x in 1; do git push; done
✖ guard-remote.mjs blocks: if true; then git push; fi
✖ guard-remote.mjs blocks: node -e "require('child_process').execSync('vercel deploy')"
✖ guard-remote.mjs blocks: node22 -e "require('child_process').execSync('vercel deploy')"
✖ guard-remote.mjs blocks: python3 - <<'EOF'⏎import subprocess⏎ EOF ⏎subprocess.run(['git', 'push'])⏎EOF
✖ guard-remote.mjs blocks: python3 - <<EOF⏎  EOF⏎import subprocess⏎subprocess.run(['git', 'push'])⏎EOF
✖ guard-remote.mjs blocks: python3 -c "import os; os.system('git push')"
✖ guard-remote.mjs blocks: python3.12 - <<'EOF'⏎import subprocess⏎subprocess.run(['git', 'push'])⏎EOF
✖ guard-remote.mjs blocks: python3.12 -c "import os; os.system('git push')"
✖ guard-remote.mjs blocks: true && { git push; }
```

- New test file against **packetA/b**: 220/220 pass.
- Original test file against **packetA/b**: 149/149 pass, so nothing regressed.
- oxlint on packetA/b (`scripts/hooks`, `tests`): exit 0, no diagnostics.

How the tests were run: from the scratch clone `../repo` (HEAD 0eeac42), with
`GUARD_HOOKS_DIR=packetA/<a|b>/scripts/hooks node --test tests/guards.test.mjs`.
The clone's test file was restored afterwards.

## Residual / still open
- **Pre-existing, outside loops:** `pushd supabase; rm migrations/<committed>.sql`
  is allowed by both a/ and b/. Revision 3 refuses loops after pushd/popd/CDPATH,
  but not plain commands.
- **Pre-existing, outside loops.** `cd` inside a subshell leaks into later
  commands in the guard's folder tracking. So
  `(cd /tmp); rm supabase/migrations/<committed>.sql` is **allowed** by both a/ and
  b/. Loops are covered by the root-or-folder rule; plain commands are not. A
  follow-up could resolve every path from both the root and the tracked folder.
- `pushd`/`popd` are not tracked, as before.
- The body of an unquoted heredoc to a non-shell is not scanned for `$(…)` or
  backticks. `cat > f <<EOF\n$(git push)\nEOF` is still allowed. This is not in
  Packet A.
- `sed 'w file'` and `awk > file` count as readers, including in loop bodies.
- New refusals:
  - a loop over migrations whose body does anything other than read;
  - a loop whose body uses a variable other than the loop variable;
  - any loop that comes after a `cd` to an unreadable target, unless its body
    only reads;
  - a `$(…)` path given to a non-reader in a call that names `supabase`,
    `scripts`, `.claude` or a migration path;
  - `-c`/`-e` code that mentions a remote command;
  - a computed heredoc tag.
