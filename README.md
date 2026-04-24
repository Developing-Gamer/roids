# Roids

Compare UI directions side by side in the browser.

Roids is an open-source skill + runtime for AI coding agents (Cursor, Claude Code, Codex, and similar tools). When an agent generates more than one version of a layout, component, or page, Roids wires those variants into a single page with a small bar at the bottom that lets you flip between them. You pick a winner, the agent keeps that one and removes the rest.

- **Runtime:** `roid-tool.js` (~16 KB, no dependencies, single file)
- **Contract:** `data-roid-`* attributes on plain HTML
- **Skill:** `skills/roids/SKILL.md` + `SKILL.txt` tell the agent how to produce variants correctly
- **Site:** [tryroids.com](https://tryroids.com)

## Launch

Remotion render used for the on-site / static landing in this repo (`index.html`).

<video src="https://github.com/Developing-Gamer/roids/releases/download/launch-v1/launch.mp4" controls width="100%"></video>

---

## Why

Agents tend to commit to one version too early or, worse, invent their own comparison UI (tabs, selects, ad-hoc buttons) that breaks the next time you refresh. Roids gives agents a single, consistent way to present options and a single, consistent way for you to choose between them.

---

## Install

Roids is distributed as a skill. The `skills` CLI pulls it from this repository and installs it into your local skills directory so any compatible agent can use it.

```bash
npx skills add https://github.com/developing-gamer/roids
```

That’s it. No config, no API key, no build step.

To remove it later:

```bash
npx skills remove roids
```

### Requirements

- Node.js 18+ (only to run `npx skills`)
- An agent that supports the [skills format](https://github.com/anthropic-experimental/skills) (Cursor, Claude Code, Codex, etc.)

---

## Using Roids

### With an agent

Ask for comparable directions in plain English:

- *“Give me 3 hero variations, same content.”*
- *“Show me 4 pricing table layouts.”*
- *“Two dashboard options — denser vs. more whitespace.”*

The agent reads the skill, generates the variants, and wires `roid-tool.js` into the page. Refresh and use the bar at the bottom of the browser to switch between options. Reply with the one you want. The agent keeps that variant and strips out the rest (including the preview script and scaffolding attributes).

### By hand

You can also use the runtime directly without an agent.

```html
<section data-roid-tool="Hero directions">
  <article data-roid-option="A — Editorial">
    <!-- variant A -->
  </article>

  <article data-roid-option="B — Product-led">
    <!-- variant B -->
  </article>

  <article data-roid-option="C — Minimal">
    <!-- variant C -->
  </article>
</section>

<script src="https://tryroids.com/roid-tool.js"></script>
```

Open the page. The Roids bar appears at the bottom with the active label in the middle and prev / next controls on either side. Left/Right arrow keys work too.

### Contract reference


| Attribute                       | Where                                    | Purpose                                                     |
| ------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `data-roid-tool="…"`            | Wrapper                                  | Label for the decision (appears as a hint near the counter) |
| `data-roid-option="…"`          | Direct child of the wrapper, 2+ siblings | One per variant; value becomes the label in the Roids bar   |
| `data-roid-active`              | Written by runtime                       | Marks the currently visible option                          |
| `data-roid-active-option`       | Written by runtime on the wrapper        | The active label                                            |
| `data-roid-active-option-index` | Written by runtime on the wrapper        | Zero-based index                                            |


Roids dispatches a `roid-tool-change` event on both the wrapper and `document` each time the user switches variants. Use it if you want to sync other UI to the current selection.

```js
document.addEventListener('roid-tool-change', (e) => {
  console.log(e.detail); // { kind: 'option', value, label, index, ... }
});
```

### What the runtime does *not* do

- It does not bundle or run Tailwind / React / any framework.
- It does not write to `localStorage`, send telemetry, or hit the network.
- It does not transform your CSS. You style each variant however you like.
- It does not ship a theme or font switcher — variants are layout-level.

---

## Self-hosting the runtime

The repo ships the runtime as a single file you can host anywhere:

```bash
# serve it from your own domain
cp roid-tool.js /path/to/your/static/site/roid-tool.js
```

Then replace the script tag:

```html
<script src="/roid-tool.js"></script>
```

The hosted copy at `https://tryroids.com/roid-tool.js` is the canonical build and is what the skill references by default.

---

## Repository layout

```
.
├── roid-tool.js        # the runtime (single file, no deps)
├── SKILL.txt           # source of truth for the agent-facing skill
├── skills/roids/       # installable skill package consumed by `npx skills add`
├── index.html          # the tryroids.com landing page
├── demo.html           # minimal demo wiring 3 variants
└── README.md
```

- `roid-tool.js` — the bar, keyboard handling, variant visibility, state attributes, and events.
- `SKILL.txt` — rules an agent must follow to produce a correct preview (wrapper shape, required attributes, finalization steps).
- `skills/roids/SKILL.md` — thin skill manifest consumed by the skills CLI; it points at `SKILL.txt`.
- `index.html` — the marketing page.
- `demo.html` — a ~70-line example you can open locally.

---

## Local development

Clone the repo and serve it over any static server:

```bash
git clone https://github.com/developing-gamer/roids.git
cd roids
python3 -m http.server 8000
# open http://localhost:8000/demo.html
```

Edit `roid-tool.js` and refresh. There is no build step.

To test changes against an agent that normally loads the hosted runtime, point your page at the local file:

```html
<script src="./roid-tool.js"></script>
```

---

## Contributing

Contributions are welcome — bug fixes, accessibility improvements, better keyboard behavior, and clearer docs in particular.

### Before you open a PR

1. **Open an issue first for anything non-trivial.** It’s faster than rewriting a PR.
2. **Keep the runtime small.** `roid-tool.js` is intentionally a single file with zero dependencies. New features should justify their byte cost.
3. **Don’t break the contract.** The `data-roid-`* attributes, the event name (`roid-tool-change`), and the wrapper / option structure are part of the public API. Changing them breaks every page that uses Roids. If you need to change behavior, add to the contract rather than modifying existing surface area.
4. **Match the skill.** If you change runtime behavior, update `SKILL.txt` (and `skills/roids/SKILL.md` if needed) in the same PR. The skill and the runtime ship together.
5. **Test with 2 and with many variants.** The bar should render identically whether the page has 2 or 8 `data-roid-option` children.

### Pull request checklist

- `demo.html` still works (open locally, flip between variants, no console errors)
- `SKILL.txt` reflects any behavior change
- No new runtime dependencies
- No new global variables beyond `window.__roidToolLoaded`
- Commit messages describe *why*, not just *what*

### Reporting bugs

Include:

- Browser + version
- A screenshot that shows the problem (page and Roids bar when relevant)
- Expected vs. actual behavior
- Console output if any

### Suggesting changes to the skill

`SKILL.txt` is what agents read. It should stay short, specific, and free of marketing language. When proposing changes:

- Keep instructions imperative (“Do X”, “Do not Y”).
- Prefer adding a rule to removing one.
- Explain in the PR description what agent failure mode your change prevents.

---

## License

MIT.