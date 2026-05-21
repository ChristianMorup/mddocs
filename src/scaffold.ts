import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { workspaceDir, workspaceKey } from './paths.js';
import { generateHomepage, generateSidebar } from './tree.js';

const DOCSIFY_VERSION = '4.13.1';
const MERMAID_VERSION = '11.14.0';

export interface Scaffolded {
  workspace: string;
  /** True if the user provided their own _sidebar.md in the docs root. */
  hasUserSidebar: boolean;
  /** True if the user provided their own README.md in the docs root. */
  hasUserReadme: boolean;
}

export interface ScaffoldOptions {
  /** Max directory nesting depth for the synthetic sidebar walk. Default 5. */
  maxDepth?: number;
}

export async function scaffold(docsPath: string, opts: ScaffoldOptions = {}): Promise<Scaffolded> {
  const workspace = workspaceDir(docsPath);
  await fs.mkdir(workspace, { recursive: true });

  await ensureJunction(path.join(workspace, 'docs'), docsPath);
  await writeIfDifferent(path.join(workspace, '.nojekyll'), '');

  const hasUserSidebar = await pathExists(path.join(docsPath, '_sidebar.md'));
  const hasUserReadme = await pathExists(path.join(docsPath, 'README.md'));

  // Synthetic sidebar lives in the workspace, not in the user's docs folder.
  // Regenerated on every run so the structure reflects whatever the user
  // just added/removed under docs/.
  const workspaceSidebar = path.join(workspace, '_sidebar.md');
  if (hasUserSidebar) {
    await removeIfExists(workspaceSidebar);
  } else {
    const sidebarContent = await generateSidebar(docsPath, 'docs', { maxDepth: opts.maxDepth });
    await fs.writeFile(workspaceSidebar, sidebarContent, 'utf8');
  }

  const workspaceReadme = path.join(workspace, 'README.md');
  if (hasUserReadme) {
    await removeIfExists(workspaceReadme);
  } else {
    await fs.writeFile(workspaceReadme, generateHomepage(docsPath), 'utf8');
  }

  // homepage/sidebar paths are relative (docsify joins them with basePath
  // internally; a leading slash is interpreted as protocol-relative and
  // tries to use the value as a hostname).
  //
  // With relativePath: true, docsify probes for per-folder _sidebar.md before
  // falling back to this configured one. Those probes 404 in the browser
  // console, but they are cosmetic — the configured sidebar still loads and
  // the links inside it use absolute paths (see generateSidebar), so
  // navigation works from any page.
  const indexHtml = buildIndexHtml({
    homepage: hasUserReadme ? 'docs/README.md' : 'README.md',
    sidebar: hasUserSidebar ? 'docs/_sidebar.md' : '_sidebar.md',
    searchNamespace: 'mddocs-' + workspaceKey(docsPath),
  });
  await fs.writeFile(path.join(workspace, 'index.html'), indexHtml, 'utf8');

  return { workspace, hasUserSidebar, hasUserReadme };
}

export function buildIndexHtml(cfg: { homepage: string; sidebar: string; searchNamespace: string }): string {
  // Mermaid integration:
  //   1. Load the mermaid library from CDN.
  //   2. Initialize with startOnLoad: false so we control rendering.
  //   3. In an afterEach plugin, rewrite any <pre><code class="lang-mermaid">…</code></pre>
  //      that docsify produced into <div class="mermaid">…</div>. We do this
  //      at the HTML-string level rather than via docsify's markdown.renderer
  //      hook because the renderer override doesn't reliably intercept in
  //      docsify v4 + marked combinations we've seen in the wild.
  //   4. In a doneEach hook (runs after the new HTML is in the DOM), call
  //      mermaid.run() to render every .mermaid div into SVG.
  //
  // The plugin value is a function literal, so the whole $docsify config is
  // hand-written rather than serialized through JSON.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Docs</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/docsify@${DOCSIFY_VERSION}/lib/themes/vue.css">
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      // mddocs theme — light Nordic palette: dark green ink on beige-light
      // surface, soft green node fills, blue for accents, yellow/bordeaux
      // reserved for notes/errors.
      themeVariables: {
        fontFamily: '"Inter", Arial, system-ui, sans-serif',
        background: '#F5F0F0',

        // Flowchart / class / state nodes
        primaryColor: '#D7F5C3',
        primaryTextColor: '#00412D',
        primaryBorderColor: '#00412D',
        secondaryColor: '#DCD2C8',
        secondaryTextColor: '#00412D',
        secondaryBorderColor: '#00412D',
        tertiaryColor: '#AFCDFF',
        tertiaryTextColor: '#0b2c66',
        tertiaryBorderColor: '#0b2c66',

        // Edges and labels
        lineColor: '#00412D',
        textColor: '#00412D',
        titleColor: '#00412D',
        edgeLabelBackground: '#F5F0F0',
        nodeTextColor: '#00412D',

        // Subgraphs / clusters
        clusterBkg: '#ffffff',
        clusterBorder: '#00412D',

        // Sequence diagrams
        actorBkg: '#D7F5C3',
        actorBorder: '#00412D',
        actorTextColor: '#00412D',
        actorLineColor: '#00412D',
        signalColor: '#00412D',
        signalTextColor: '#00412D',
        labelBoxBkgColor: '#AFCDFF',
        labelBoxBorderColor: '#0b2c66',
        labelTextColor: '#0b2c66',
        loopTextColor: '#00412D',
        noteBkgColor: '#FFD791',
        noteTextColor: '#5a3e00',
        noteBorderColor: '#FFD791',
        activationBkgColor: '#9BCDA0',
        activationBorderColor: '#00412D',

        // State / ER / Gantt accents
        errorBkgColor: '#4B1932',
        errorTextColor: '#ffffff'
      }
    });
    window.$docsify = {
      basePath: '/',
      homepage: ${JSON.stringify(cfg.homepage)},
      loadSidebar: ${JSON.stringify(cfg.sidebar)},
      subMaxLevel: 3,
      auto2top: true,
      name: 'Docs',
      // The docsify-search plugin caches its index in localStorage. Every
      // mddocs run serves from http://localhost:3000, so without a per-repo
      // namespace, repo A's cached index leaks into repo B's search results.
      // We key the namespace by the same hash used for the workspace dir so
      // each repo gets its own slot. maxAge: 60_000 keeps the cache short
      // enough that edits become searchable after a one-minute wait.
      search: {
        namespace: ${JSON.stringify(cfg.searchNamespace)},
        paths: 'auto',
        maxAge: 60000,
        placeholder: 'Type to search',
        noData: 'No results found.',
        depth: 6
      },
      relativePath: true,
      plugins: [
        function (hook) {
          var parser = new DOMParser();
          // Azure DevOps wiki uses ':::mermaid … :::' fence syntax for mermaid
          // blocks instead of standard markdown ' \`\`\`mermaid … \`\`\` '. Translate
          // ADO-style fences to standard fences before marked sees them so the
          // same source renders correctly in both places without modifying the
          // file. The pattern accepts ':::mermaid' or '::: mermaid', any trailing
          // whitespace on the fence lines, and CRLF or LF line endings.
          // (Backticks are encoded as \\u0060 to avoid terminating our outer
          // template literal in the index.html generator.)
          var FENCE = '\\u0060\\u0060\\u0060';
          hook.beforeEach(function (markdown) {
            return markdown.replace(
              /^:::[ \\t]*mermaid[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n:::[ \\t]*(?=\\r?\\n|$)/gm,
              function (_, body) { return FENCE + 'mermaid\\n' + body + '\\n' + FENCE; }
            );
          });
          hook.afterEach(function (html, next) {
            // By the time afterEach fires, Prism has already syntax-highlighted
            // the code block: the inner <code> is studded with <span class="token …">
            // wrappers around the original tokens. A naive regex would capture
            // that HTML and feed it to mermaid as source — mermaid then tries
            // to parse <span …> as graph syntax and errors out.
            //
            // Parsing the rendered HTML via DOMParser and reading textContent
            // of the <code> element gives us back the plain text the author
            // wrote, with exactly one level of HTML-entity decoding applied
            // (marked's &amp; → &, &lt; → <, etc.). The author's intentional
            // numeric entities like &#40; survive because marked encoded the
            // leading & as &amp; and textContent only unwinds that one step.
            var doc = parser.parseFromString(html, 'text/html');
            var codes = doc.querySelectorAll('pre code.lang-mermaid');
            if (codes.length === 0) { next(html); return; }
            codes.forEach(function (code) {
              var src = code.textContent;
              var div = doc.createElement('div');
              div.className = 'mermaid';
              div.textContent = src;
              var pre = code.closest('pre');
              if (pre && pre.parentNode) pre.parentNode.replaceChild(div, pre);
            });
            next(doc.body.innerHTML);
          });
          hook.doneEach(function () {
            if (!window.mermaid) return;
            // mermaid.run() returns a promise that rejects on parse errors in
            // individual diagrams. Catch it so a single bad diagram doesn't
            // produce an uncaught rejection in the console — the .mermaid div
            // with the failing source stays in the DOM as a visible fallback.
            try {
              var p = window.mermaid.run({ querySelector: '.mermaid' });
              if (p && typeof p.catch === 'function') {
                p.catch(function (err) { console.warn('mddocs: mermaid render failed', err); });
              }
            } catch (err) {
              console.warn('mddocs: mermaid render failed', err);
            }
          });
        }
      ]
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@${DOCSIFY_VERSION}/lib/docsify.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/docsify@${DOCSIFY_VERSION}/lib/plugins/search.min.js"></script>
</body>
</html>
`;
}

async function ensureJunction(linkPath: string, target: string): Promise<void> {
  const absTarget = path.resolve(target);

  let existing: import('node:fs').Stats | undefined;
  try {
    existing = await fs.lstat(linkPath);
  } catch {
    // not present
  }

  if (existing) {
    let currentTarget: string | null = null;
    try {
      currentTarget = await fs.readlink(linkPath);
    } catch {
      // not a symlink/junction
    }
    if (currentTarget !== null) {
      const resolvedCurrent = path.isAbsolute(currentTarget)
        ? path.resolve(currentTarget)
        : path.resolve(path.dirname(linkPath), currentTarget);
      if (resolvedCurrent === absTarget) {
        return;
      }
    }
    await fs.rm(linkPath, { recursive: true, force: true });
  }

  await fs.symlink(absTarget, linkPath, 'junction');
}

async function writeIfDifferent(filePath: string, contents: string): Promise<void> {
  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing === contents) return;
  } catch {
    // missing — fall through
  }
  await fs.writeFile(filePath, contents, 'utf8');
}

async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // already gone
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
