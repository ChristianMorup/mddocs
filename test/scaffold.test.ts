import { describe, it, expect } from 'vitest';
import { buildIndexHtml } from '../src/scaffold.js';

describe('buildIndexHtml', () => {
  it('uses pinned HTTPS assets and strict mermaid security', () => {
    const html = buildIndexHtml({
      homepage: 'README.md',
      sidebar: '_sidebar.md',
      searchNamespace: 'test',
    });

    expect(html).toContain('https://cdn.jsdelivr.net/npm/docsify@4.13.1/lib/themes/vue.css');
    expect(html).toContain('https://cdn.jsdelivr.net/npm/docsify@4.13.1/lib/docsify.min.js');
    expect(html).toContain('https://cdn.jsdelivr.net/npm/docsify@4.13.1/lib/plugins/search.min.js');
    expect(html).toContain('https://cdn.jsdelivr.net/npm/mermaid@11.14.0/dist/mermaid.min.js');
    expect(html).toContain("securityLevel: 'strict'");
    expect(html).not.toMatch(/(?:src|href)="\/\//);
    expect(html).not.toContain("securityLevel: 'loose'");
  });
});
