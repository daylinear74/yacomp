# HDBits comparison-detection fixtures

This directory drives the regression test suite for yacomp's HDBits grid
detector. Each `cases/*.html` file is a small, self-contained snippet
mounted into a sanitized HDBits page chrome. Playwright opens the
rendered page, lets the userscript run, and asserts on the resulting
"Show comparison" links.

## Why this exists

The detector spans `src/grid/parser.ts` and `src/sites/hdbits.ts`. It
has to:

- find genuine image comparison grids inside torrent descriptions,
  comments, and forum posts
- pick out source names from a tangle of bold tags, color spans,
  surrounding headings, and inline labels
- reject random screenshots (avatars, single rebuttal pics, joke gifs)

The corner cases are real-world DOM shapes that don't fit a tidy spec.
A case here is the only way to lock down behavior so a fix to one
shape doesn't quietly break another.

## Directory layout

```
tests/fixtures/hdbits/
├── README.md              ← you are here
├── test-entry.ts          ← bootstraps the parser without a real hdbits.org host
├── templates/
│   ├── torrent.html       ← sanitized chrome for /details.php pages
│   └── forum.html         ← sanitized chrome for /forums/viewtopic pages
└── cases/                 ← one .html per case (this is where you add things)
```

## Case file format

Every case is one `.html` file with a metadata header comment at the
top, then the slot HTML body:

```html
<!--
slot: torrent.description
expected_grids: 1
expected_names: [["Source", "Encode"]]
torrent_title: "Demo 2024 1080p BluRay x264-FOO"
notes: free text — what scenario this exercises
-->

<div align="center">
  <strong>Source vs. Encode</strong><br>
  <a href="https://img.hdbits.org/x"><img src="https://t.hdbits.org/x.jpg"></a>
  <a href="https://img.hdbits.org/y"><img src="https://t.hdbits.org/y.jpg"></a><br>
</div>
```

### Header fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `slot` | enum | yes | `torrent.description`, `torrent.comment`, or `forum.post`. Tells the runner which template chrome to wrap the body in. |
| `expected_grids` | int | yes | Number of `_scf_comp_link` elements the parser must insert. `0` means the parser must **not** detect anything (false-positive guard). |
| `expected_names` | JSON | no | One inner array per detected grid, listing source names in order. Use `null` for a grid the parser detects without names. Omit the field entirely to skip names assertion. |
| `torrent_title` | string | no | Sets the H1 (torrent slots). Lets you exercise or guard against the H1-fallback name strategy. |
| `thread_title` | string | no | Same idea for forum slots. The runner renders it as `Comparisons > {thread_title}` to mirror real HDBits chrome. |
| `notes` | string | no | Free text — what this case is for, future-you will thank you. |

## Extracting a case from a real HDBits page

Open the real HDBits page in your browser, run the relevant DevTools
snippet, then sanitize before committing. **Read the next section
before pasting.**

### `torrent.description`

On any `/details.php?id=…` page:

```js
copy(
  [...document.querySelectorAll("#details td")]
    .find(td => /Description wrote:/.test(td.innerText))
    ?.innerHTML
)
```

The clipboard now holds the entire description `<td>` content — quote
block, dashed-border BBCode tables, and the trailing `<div align=center>`
with the screenshot grids. Save as
`tests/fixtures/hdbits/cases/NNN-short-name.html`, prepend a metadata
header, fill `expected_grids` / `expected_names`, done.

### `torrent.comment`

On the same `/details.php` page, every comment body lives in a
`<td class="text">`:

```js
[...document.querySelectorAll("td.text")]
  .filter(td => td.querySelector('img[src*="//t.hdbits.org/"]'))
  .forEach((td, i) => console.log(`--- comment ${i} ---\n` + td.innerHTML))
```

Pick the one you want, paste it as the body of a case file with
`slot: torrent.comment`. The runner wraps it in a comment row
(avatar td + content td) so the parser sees a realistic structure.

### `forum.post`

On a `/forums/viewtopic?topicid=…` page:

```js
[...document.querySelectorAll("td.comment")]
  .filter(td => td.querySelector('img[src*="//t.hdbits.org/"]'))
  .forEach((td, i) => console.log(`--- post ${i} ---\n` + td.innerHTML))
```

Same pattern — pick a body, drop it in a case file with
`slot: forum.post`. Set `thread_title` if your case depends on
H1-fallback name detection.

## Sanitization checklist

Real HDBits pages carry identifying details that don't belong in this
repo. Before committing a case, scrub:

- **Usernames** in `@mentions` ("Thanks @real_user!"). Replace with
  generic stand-ins (`@Alice`, `@Bob`).
- **Passkeys** in download links (`?passkey=…`). Strip the link entirely
  or replace the value with `PASSKEY`. The parser never reads this.
- **Real torrent IDs / user IDs** in hrefs (`id=818402`,
  `userdetails.php?id=1120620`). Replace with `999999`, `100001` etc.
  Parser doesn't read these.
- **External image hosts** that aren't `*.hdbits.org`. If a comment
  links elsewhere (imgur, slow.pics, gifyu), keep only what's relevant
  to the parser; the rest is noise.
- **Encoder watermarks / signatures** in `<strong>` tags ("Encoded by
  RealName") if they identify someone. Replace with `Encoder1`.
- **Avatars**. Real avatars come from `i.hdbits.org`; the fixture
  chrome uses `<div class="default_avatar">` placeholders. The
  parser's image trigger only fires on `t.hdbits.org`, so avatar
  cleanup is purely about not leaking pics, not about test behavior.

Things you should keep:

- The structural HTML (every `<br>`, `<strong>`, `<a>`, `<div align>`).
  These are what the parser walks.
- `t.hdbits.org` thumb URLs. The runner stubs both `t.hdbits.org` and
  `i.hdbits.org` at the Playwright route layer (see
  `tests/e2e/hdbits.spec.ts`), so no real requests fire.
- Source labels (`Source vs. Encode`, color spans, bold tags). Those
  are what the parser is trying to recognize.

## Picking `expected_grids` and `expected_names`

The simplest workflow:

1. Drop your sanitized snippet in `cases/`.
2. Pick header values based on what the user-facing result *should* be
   on a real HDBits page.
3. Run `bun run test:e2e` — failing tests print actual vs expected.
4. If the parser is wrong, file/fix it. If the expectation was wrong,
   adjust the header.

Example expectations:

- A description with **three labeled comparison sections** (`Source vs.
  Filtered vs. Encode`, then `Banding Frames`, then `Screenshots`) →
  `expected_grids: 3`, one inner array of names per section.
- A description with **one** comparison and several rows of thumbs →
  `expected_grids: 1`, one inner array.
- A comment with **`Encode vs. 2160p`** followed by two thumbs →
  `expected_grids: 1`, names `[["Encode", "2160p"]]`.
- A comment with **a single rebuttal screenshot** and no comparison
  language → `expected_grids: 0`. This is a false-positive guard; the
  parser must reject it.

## Running the suite

```bash
bun run test:e2e                          # entire e2e suite
bunx playwright test tests/e2e/hdbits     # just the hdbits cases
bunx playwright test --ui                 # watch what each case does
```

The runner waits for `window.__yacomp_test_ready` so it knows the
parser has finished. Cases with `expected_grids: 0` assert the count
**after** the ready signal — no flaky polling.

## Adding a regression case after a fix

When you fix a parser bug, add the failing input as a case **before**
landing the fix. This locks the behavior in:

1. Reduce the original HTML to the smallest snippet that reproduces.
2. Sanitize per the checklist above.
3. Save as `cases/NNN-short-description-of-the-bug.html` with header
   values set to the **correct** outcome.
4. Confirm `bun run test:e2e` fails on `main`, then ship the fix on a
   branch.

The case stays in the suite forever as a regression guard.
