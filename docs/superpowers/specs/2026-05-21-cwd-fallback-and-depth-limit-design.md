# Serve cwd by default with a depth-limited markdown walk

## Problem

`mddocs` currently requires a `docs/` (or `doc/`, `documentation/`) folder in the
current working directory. When none is present, the tool throws and refuses to
run. That hurts the "just point me at a repo and let me read the markdown"
use case — plenty of repos keep their docs at the top level (`README.md`,
`CHANGELOG.md`, scattered `.md` files inside `src/` or sub-packages) without a
dedicated docs folder.

## Goals

- Make `mddocs` run in any directory, with or without a `docs/` folder.
- Keep the sidebar useful in large repos by limiting how deep the walk goes.
- Preserve the existing happy path for users who pass a path explicitly
  (`mddocs docs`, `mddocs path/to/file.md`).

## Non-goals

- No config file or `package.json` field.
- No "find a folder named docs anywhere in the tree" magic.
- No change to the docsify rendering pipeline, the static server, or the
  workspace/junction layout.

## Design

### CLI

| Invocation             | Behavior                                                                 |
| ---------------------- | ------------------------------------------------------------------------ |
| `mddocs`               | Serve **cwd**. Walk `.md` files up to depth 5.                           |
| `mddocs <dir>`         | Serve `<dir>`. Walk `.md` files up to depth 5.                           |
| `mddocs <file>.md`     | Serve `dirname(<file>.md)`, focus on the file. Walk up to depth 5.       |
| `mddocs --depth N ...` | Override the depth limit (`N >= 0`; `0` means "root-level `.md`s only"). |

The positional `[path]` argument is unchanged in shape — it just no longer
defaults to "auto-discover `./docs`".

### `src/discover.ts`

Drop the docs-folder discovery entirely:

- Remove `CANDIDATE_NAMES` and the two loops that look for `docs`/`doc`/
  `documentation` (and the `docs*` prefix fallback).
- Remove the `hasMarkdown` helper here — discovery no longer needs to verify
  markdown presence (an empty repo just renders an empty sidebar).
- No-arg case: return `{ docsPath: path.resolve(cwd) }`.
- Arg case: unchanged — resolve, `stat`, validate file-vs-dir, return.

The `realPathOrSelf` helper inside `discover.ts` becomes dead code along with
`hasMarkdown` and gets removed.

### `src/tree.ts`

Add a depth limit to the sidebar walk:

- `generateSidebar(docsPath, urlRoot, opts?)` accepts
  `opts: { maxDepth?: number }` with default `5`.
- `walk()` receives `maxDepth` and stops recursing into directories once
  `depth >= maxDepth`. Files at exactly `depth == maxDepth` are still
  emitted; only subdirectory recursion is gated.
- Existing `SKIP_DIRS` (`node_modules`, `dist`, `bin`, `obj`, `.git`,
  `.idea`, `.vscode`, `TestResults`) and dotfile skipping continue to apply
  before the depth check.
- The existing "no markdown files found" empty-sidebar message stays as the
  empty-state behavior.

### `src/scaffold.ts`

Thread the depth option through to `generateSidebar`:

- `scaffold(docsPath, opts?)` accepts `opts: { maxDepth?: number }`.
- Pass `opts.maxDepth` into `generateSidebar`.

### `src/index.ts`

- Add `.option('--depth <n>', 'max directory depth to walk for the sidebar (default: 5)', '5')` to the root command.
- Parse and validate: integer, `>= 0`. Reject negative or non-integer values
  with a clear error.
- Pass the parsed value through `scaffold(docsPath, { maxDepth })`.
- Update the positional argument description: `'markdown file or folder to serve (default: current directory)'`.

### Tests

- `test/discover.test.ts`: rewrite. Drop the "auto-discover docs/" cases. Add:
  - No-arg → returns `{ docsPath: cwd }` regardless of whether `docs/` exists.
  - No-arg in an empty directory → still returns `{ docsPath: cwd }` (no throw).
  - Explicit dir path / file path / missing path behavior unchanged.
- `test/tree.test.ts` (new or extend existing tree coverage):
  - Files at depth 0 are emitted; files at depth `maxDepth` are emitted;
    directories beyond `maxDepth` are not descended into.
  - `maxDepth: 0` emits only root-level `.md` files.
  - `SKIP_DIRS` are still skipped regardless of depth.
- Index/integration tests (if any exercise the CLI): update for the new
  default behavior.

### Docs

- Update `README.md`:
  - Describe the new default (serve cwd, depth 5).
  - Document `--depth N`.
  - Remove references to the `docs/` auto-discovery convention.

## Impact and risk

- **Behavior change for existing users.** Anyone relying on `mddocs` finding
  `./docs` from a parent or sibling no longer gets that. The replacement —
  pass `mddocs docs` — is one extra token and is documented.
- **Sidebar noise in large repos with no docs folder.** Mitigated by the
  depth-5 default and the existing `SKIP_DIRS` list. A user who hits noise
  can scope down with `mddocs <subdir>` or `--depth N`.
- **No persisted state migrations** — the workspace layout, server contract,
  and skill file are unchanged.
