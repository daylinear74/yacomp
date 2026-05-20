# yacomp viewer fixture

This fixture is a local development page for checking the fullscreen viewer
without installing the userscript into tracker pages.

It uses the first six comparisons and three sources from
`https://slow.pics/c/soQpR0zy`. The page sets `window.collection` in the same
shape as slow.pics and opens yacomp through `openSlowPicsViewer()`, so row
numbers and source labels come from the real viewer code.

Run it from the repository root:

```bash
bun run fixture
```

Then open:

```text
http://127.0.0.1:4173/tests/fixtures/viewer/basic.html
```

The fixture is not imported by `src/index.ts`, is not included in
`dist/yacomp.user.js`, and does not affect release builds.
