# mddocs

[![npm version](https://img.shields.io/npm/v/@christianmorup/mddocs.svg)](https://www.npmjs.com/package/@christianmorup/mddocs)
[![CI](https://github.com/ChristianMorup/mddocs/actions/workflows/ci.yml/badge.svg)](https://github.com/ChristianMorup/mddocs/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Browse a markdown docs folder in your browser without touching the source repo.

`mddocs` wraps [docsify](https://docsify.js.org/) so that pointing it at any folder of `.md` files renders a navigable site at `http://127.0.0.1:3000`. The trick: it scaffolds docsify's required `index.html` in an out-of-tree workspace and uses a directory junction (Windows) or symlink (Unix) to point at your real docs folder. Your repo is never modified.

## Install

```bash
npm install -g @christianmorup/mddocs
```

Or run ad hoc:

```bash
npx @christianmorup/mddocs
```

The installed binary is just `mddocs` — the scope only matters at install time.

## Usage

```bash
mddocs                  # serve the current directory (sidebar walks up to 5 levels deep)
mddocs ./guides         # serve a specific folder
mddocs ./plans/PLAN.md  # serve the parent folder and open the browser on this file
mddocs --depth 2        # cap the sidebar walk at 2 nested levels (0 = root-only)
mddocs status           # show what's running
mddocs stop             # halt the server
```

Pointing at a `.md` file serves its containing directory (so the sidebar shows whatever else is next to it) and navigates straight to that file. Useful for reviewing a plan in a real renderer while you wait.

By default `mddocs` walks `.md` files up to 5 directory levels deep, skipping common build, VCS, and dependency folders (`node_modules`, `dist`, `build`, `target`, `.git`, etc.). Use `--depth N` to widen or narrow the walk (`--depth 0` shows only the root-level files).

## Claude Code integration (optional)

If you use Claude Code, mddocs can install a small skill that nudges agents to offer `mddocs <plan-path>` whenever they write a plan or design doc to disk:

```bash
mddocs skill install             # writes ~/.claude/skills/mddocs-plan-review/SKILL.md (all repos)
mddocs skill install --local     # writes ./.claude/skills/mddocs-plan-review/SKILL.md (this repo only)
mddocs skill uninstall           # removes the user-scoped skill
mddocs skill uninstall --local   # removes the repo-scoped skill
```

The skill never auto-launches anything — it just teaches the agent to ask first. Add `--force` to either command to overwrite or remove a hand-edited skill file. `--local` and the default user scope are independent — you can install one without affecting the other.


The first form starts a detached docsify server, opens your default browser, and exits. The server keeps running until `mddocs stop` (or until you reboot).

## Where state lives

| Item | Location |
|---|---|
| State file (pid, port, token, paths) | `%LOCALAPPDATA%\mddocs\state.json` (Win) / `~/.local/state/mddocs/state.json` (Linux) / `~/Library/Application Support/mddocs/state.json` (macOS) |
| Per-repo workspace | `<appData>/mddocs/workspaces/<sha256-of-docs-path>/` |

Workspaces persist between runs so subsequent invocations are fast. They contain only generated shell files, a per-run server marker, and a junction back to your real docs folder.

## How navigation is built

If your docs folder has a `_sidebar.md`, mddocs uses it as-is. If it doesn't, mddocs walks the folder tree and writes a synthetic `_sidebar.md` **into the workspace** (never your repo). Folder headers link to their `README.md` when one exists, otherwise they're plain labels. The same applies to the homepage: your `README.md` is used if present, else a synthetic placeholder lands in the workspace.

The synthetic files are regenerated on every `mddocs` run, so the structure stays in sync with whatever you've added or removed under `docs/`.

## Constraints (v1)

- One server per host. Run `mddocs stop` before starting a second.
- Ports 3000–3010 are tried in order; if all are busy, `mddocs` exits with an error.
- The local server binds to `127.0.0.1` only.
- The docsify shell uses pinned HTTPS CDN assets (`cdn.jsdelivr.net`). No internet → no rendering.

## Development

```bash
npm install         # install dependencies
npm run build       # compile TypeScript to dist/
npm run watch       # rebuild on change
npm test            # run vitest suite
```

Source lives in `src/`, tests in `test/`, output in `dist/` (gitignored — CI rebuilds before publish).

## Releasing

Releases are published to npm by GitHub Actions when a `v*` tag is pushed:

```bash
# bump version in package.json, commit, then:
git tag v0.2.0
git push --tags
```

The workflow runs the test matrix, builds, publishes via npm trusted publishing (OIDC — no long-lived token), and cuts a GitHub Release.

## License

[MIT](./LICENSE) © Christian Mørup
