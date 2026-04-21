(() => {
  const w = window;
  if (w.__roidToolLoaded) return;
  w.__roidToolLoaded = true;

  const WRAPPER_SEL = "[data-roid-tool]";
  const TAG = "roid-tool";
  const MIN_OPTIONS = 2;
  const MAX_OPTIONS = 5;

  const ATTR_WATCH = [
    "data-roid-tool",
    "data-roid-option",
    "hidden",
  ];

  const trim = (v, fb) => (v ?? "").trim() || fb;

  /** True when focus is in a control that should keep Left/Right for itself. */
  function isArrowKeyReservedForTarget(el) {
    if (!(el instanceof Element)) return false;
    if (el.isContentEditable || el.closest("[contenteditable='true']")) return true;
    if (el.closest("textarea, select")) return true;
    const inp = el.closest("input");
    if (!inp) return false;
    const type = (inp.type || "text").toLowerCase();
    const nonText = [
      "button",
      "checkbox",
      "color",
      "file",
      "hidden",
      "image",
      "radio",
      "reset",
      "submit",
    ];
    return !nonText.includes(type);
  }

  /** True if node is or contains roid markup we care about */
  function touchesRoid(node) {
    return (
      node instanceof Element &&
      (node.matches(`${WRAPPER_SEL},[data-roid-option]`) ||
        !!node.querySelector(`${WRAPPER_SEL},[data-roid-option]`))
    );
  }

  function parseTool() {
    const toolEl = document.querySelector(WRAPPER_SEL);
    if (!toolEl) return null;

    const raw = Array.from(toolEl.children).filter((el) =>
      el.hasAttribute("data-roid-option")
    );
    if (raw.length < MIN_OPTIONS) return null;

    const overflow = raw.length > MAX_OPTIONS;
    const slice = raw.slice(0, MAX_OPTIONS);
    const options = slice.map((el, i) => ({
      label: trim(el.getAttribute("data-roid-option"), `Option ${i + 1}`),
      element: el,
    }));

    return {
      label: trim(toolEl.getAttribute("data-roid-tool"), "Decision"),
      toolEl,
      options,
      overflow,
      activeIndex: Math.max(
        0,
        options.findIndex((o) => !o.element.hidden)
      ),
    };
  }

  function resolveActiveIndex(state) {
    const { activeIndex, options } = state;
    if (
      activeIndex >= 0 &&
      activeIndex < options.length &&
      !options[activeIndex].element.hidden
    ) {
      return activeIndex;
    }
    return (state.activeIndex = Math.max(
      0,
      options.findIndex((o) => !o.element.hidden)
    ));
  }

  /** Hide direct children with data-roid-option that are not in the active list (e.g. beyond max 5). */
  function hideExcludedOptions(toolEl, options) {
    const keep = new Set(options.map((o) => o.element));
    for (const child of toolEl.children) {
      if (!child.hasAttribute("data-roid-option")) continue;
      if (keep.has(child)) continue;
      child.hidden = true;
      child.removeAttribute("data-roid-active");
      if (child.style.display !== "none") child.style.display = "none";
    }
  }

  /**
   * Show exactly one option: `active` must be the same object as one of `state.options[i]` (not a raw element).
   * @param {WeakSet|null} tracked - optional set to track nodes we set `hidden` on for observer
   */
  function applyVisibility(state, active, tracked) {
    let changed = false;
    let idx = 0;
    for (let i = 0; i < state.options.length; i++) {
      const { element } = state.options[i];
      const hide = state.options[i] !== active;
      if (!hide) idx = i;
      if (element.hidden !== hide) {
        tracked?.add(element);
        element.hidden = hide;
        changed = true;
      }
      if (hide) {
        if (element.style.display !== "none") element.style.display = "none";
        element.removeAttribute("data-roid-active");
      } else {
        if (element.style.display) element.style.removeProperty("display");
        element.setAttribute("data-roid-active", "");
      }
    }
    state.activeIndex = idx;
    return changed;
  }

  class RoidTool extends HTMLElement {
    group = null;
    onSelect = null;

    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
      this.root.innerHTML = `
<style>
  :host {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    display: block;
    width: auto;
    max-width: calc(100vw - 16px);
    z-index: 2147483647;
    color: #fff;
    font-family: "Outfit", ui-sans-serif, system-ui, sans-serif;
    line-height: 1;
  }
  *, *::before, *::after { box-sizing: border-box; }
  [hidden] { display: none !important; }
  dialog {
    display: block;
    position: static;
    inset: auto;
    margin: 0;
    padding: 0;
    border: 0;
    width: 100%;
    max-width: none;
    background: transparent;
    color: inherit;
    overflow: visible;
    outline: none;
  }
  [data-panel] {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 44px;
    min-width: 0;
    border-radius: 14px;
    padding: 5px;
    background: rgba(12, 12, 14, 0.72);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.85),
      inset 0 0 0 1px rgba(255, 255, 255, 0.09),
      0 24px 48px -14px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }
  [data-nav] {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    background: transparent;
    cursor: pointer;
    transition: color 140ms ease, background-color 140ms ease, opacity 140ms ease;
    flex-shrink: 0;
  }
  [data-nav]:hover,
  [data-nav]:focus-visible {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
    outline: none;
  }
  [data-nav]:disabled {
    opacity: 0.45;
    cursor: default;
  }
  [data-divider] {
    flex-shrink: 0;
    width: 1px;
    height: 56%;
    max-height: 20px;
    align-self: center;
    margin: 0 2px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 0.5px;
  }
  [data-center] {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    gap: 10px;
    flex: 1;
  }
  [data-meta] {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 10px;
    justify-content: center;
  }
  [data-pos] {
    flex-shrink: 0;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 11px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.45);
  }
  [data-lbl] {
    min-width: 0;
    flex: 1;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: -0.01em;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: rgba(255, 255, 255, 0.88);
  }
  [data-measure-wrap] {
    position: absolute;
    left: 0;
    top: 0;
    visibility: hidden;
    pointer-events: none;
    width: max-content;
    max-width: none;
    height: auto;
    overflow: visible;
    white-space: nowrap;
  }
  [data-measure-wrap] [data-measure] {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
  }
  [data-measure-pos] {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 11px;
    font-weight: 500;
  }
  [data-measure-lbl] {
    font-family: "Outfit", ui-sans-serif, system-ui, sans-serif;
    font-size: 13px;
    font-weight: 400;
    letter-spacing: -0.01em;
  }
  @media (max-width: 640px) {
    :host {
      left: 8px;
      bottom: 8px;
      transform: none;
    }
  }
</style>
<dialog aria-label="Roid Tool" tabindex="-1">
  <section data-panel role="toolbar" aria-orientation="horizontal">
    <button type="button" data-nav data-previous aria-label="Previous variant">
      <svg viewBox="0 0 5 6" fill="currentColor" width="6" height="7" aria-hidden="true">
        <path d="M0.75 3L4.25 5.25L4.25 0.75L0.75 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    </button>
    <span data-divider aria-hidden="true"></span>
    <div data-center>
      <span data-meta>
        <span data-pos></span>
        <span data-lbl></span>
      </span>
    </div>
    <span data-divider aria-hidden="true"></span>
    <button type="button" data-nav data-next aria-label="Next variant">
      <svg viewBox="0 0 5 6" fill="currentColor" width="6" height="7" aria-hidden="true">
        <path d="M4.25 3L0.75 5.25L0.75 0.75L4.25 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    </button>
  </section>
  <div data-measure-wrap aria-hidden="true">
    <span data-measure>
      <span data-measure-pos></span>
      <span data-measure-lbl></span>
    </span>
  </div>
</dialog>`;

      const r = this.root;
      this.dialog = r.querySelector("dialog");
      this.panel = r.querySelector("[data-panel]");
      this.prev = r.querySelector("[data-previous]");
      this.next = r.querySelector("[data-next]");
      this.posText = r.querySelector("[data-pos]");
      this.labelText = r.querySelector("[data-lbl]");
      this.metaEl = r.querySelector("[data-meta]");
      this.measurePos = r.querySelector("[data-measure-pos]");
      this.measureLbl = r.querySelector("[data-measure-lbl]");

      this.dialog.addEventListener("pointerdown", (ev) => {
        if (
          ev.button === 0 &&
          ev.target instanceof Element &&
          !ev.target.closest("button")
        ) {
          this.dialog.focus({ preventScroll: true });
        }
      });
      this.prev.addEventListener("click", () => this._move(-1));
      this.next.addEventListener("click", () => this._move(1));
    }

    connectedCallback() {
      document.addEventListener("keydown", this.onDocumentKeyDown, true);
      if (!this.dialog.open) this.dialog.show();
      this._focusDialog();
    }

    disconnectedCallback() {
      document.removeEventListener("keydown", this.onDocumentKeyDown, true);
    }

    _toolEl() {
      return this.group?.toolEl ?? null;
    }

    _dispatchChange(detail) {
      const tool = this._toolEl();
      if (!tool) return;
      const payload = { kind: "option", tool, ...detail };
      tool.dispatchEvent(
        new CustomEvent("roid-tool-change", {
          bubbles: true,
          composed: true,
          detail: payload,
        })
      );
      tool.dispatchEvent(
        new CustomEvent("roid-tool-option-change", {
          bubbles: true,
          composed: true,
          detail: payload,
        })
      );
    }

    emitOptionChange() {
      if (!this.group) return;
      const i = resolveActiveIndex(this.group);
      const opt = this.group.options[i];
      if (!opt) return;
      this._syncWrapperAttrs();
      this._dispatchChange({
        value: opt.label,
        label: opt.label,
        index: i,
        target: opt.element,
        element: opt.element,
      });
    }

    _syncWrapperAttrs() {
      const tool = this._toolEl();
      if (!tool || !this.group) return;
      const i = resolveActiveIndex(this.group);
      const opt = this.group.options[i];
      if (opt) {
        tool.setAttribute("data-roid-active-option", opt.label);
        tool.setAttribute("data-roid-active-option-index", String(i));
      }
    }

    _focusDialog() {
      const ae = this.root.activeElement;
      if (ae instanceof HTMLElement && ae !== this.dialog) ae.blur();
      this.dialog.focus({ preventScroll: true });
    }

    update(group, onSelect) {
      this.group = group;
      this.onSelect = onSelect;
      this._syncWrapperAttrs();
      this._render();
      if (!this.dialog.open) this.dialog.show();
      this._focusDialog();
    }

    _measureMetaMinWidth() {
      const g = this.group;
      if (!g || !this.measurePos || !this.measureLbl || !this.metaEl) return;
      const n = g.options.length;
      let maxPosW = 0;
      for (let i = 0; i < n; i++) {
        this.measurePos.textContent = `${i + 1}/${n}`;
        maxPosW = Math.max(maxPosW, this.measurePos.scrollWidth);
      }
      let maxLblW = 0;
      for (const o of g.options) {
        this.measureLbl.textContent = o.label;
        maxLblW = Math.max(maxLblW, this.measureLbl.scrollWidth);
      }
      const gap = 10;
      this.metaEl.style.minWidth = `${Math.ceil(maxPosW + gap + maxLblW)}px`;
    }

    _render() {
      const g = this.group;
      if (!g) return;
      const i = resolveActiveIndex(g);
      const n = g.options.length;
      this.posText.textContent = `${i + 1}/${n}`;
      this.posText.title = g.label;
      this.labelText.textContent = g.options[i].label;
      this.panel?.setAttribute(
        "aria-label",
        g.label ? `${g.label}: choose variant` : "Choose variant"
      );
      const multi = n > 1;
      this.prev.disabled = this.next.disabled = !multi;
      this._measureMetaMinWidth();
      if (typeof document !== "undefined" && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          if (this.group === g) this._measureMetaMinWidth();
        });
      }
    }

    _move(delta) {
      const g = this.group;
      if (!g || g.options.length <= 1) return;
      const len = g.options.length;
      const nextIdx = (resolveActiveIndex(g) + delta + len) % len;
      const opt = g.options[nextIdx];
      if (opt) {
        this.onSelect?.(opt);
        this._focusDialog();
      }
    }

    /**
     * Arrow keys work from anywhere on the page (except text fields and similar)
     * so users do not need focus on the bar.
     */
    onDocumentKeyDown = (ev) => {
      if (!this.group || this.group.options.length <= 1) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      if (isArrowKeyReservedForTarget(ev.target)) return;
      ev.preventDefault();
      this._move(ev.key === "ArrowRight" ? 1 : -1);
    };
  }

  let host = null;
  let raf = false;
  const hiddenTracked = new WeakSet();

  function schedule() {
    if (raf) return;
    raf = true;
    requestAnimationFrame(() => {
      raf = false;
      sync();
    });
  }

  function sync() {
    const state = parseTool();
    if (!state) {
      host?.remove();
      host = null;
      return;
    }

    hideExcludedOptions(state.toolEl, state.options);
    applyVisibility(
      state,
      state.options[resolveActiveIndex(state)] ?? state.options[0],
      hiddenTracked
    );

    if (!host) {
      host = document.createElement(TAG);
      (document.body ?? document.documentElement).appendChild(host);
    }

    const onPick = (opt) => {
      applyVisibility(state, opt, hiddenTracked);
      host?.update(state, onPick);
      host?.emitOptionChange();
    };

    host.update(state, onPick);
  }

  function boot() {
    new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type !== "attributes") {
          for (const node of rec.addedNodes) {
            if (touchesRoid(node)) return schedule();
          }
          for (const node of rec.removedNodes) {
            if (touchesRoid(node)) return schedule();
          }
        } else {
          if (
            rec.attributeName === "hidden" &&
            hiddenTracked.delete(rec.target)
          ) {
            continue;
          }
          if (
            rec.target instanceof Element &&
            (touchesRoid(rec.target) ||
              rec.target.matches(WRAPPER_SEL) ||
              rec.target.hasAttribute("data-roid-option"))
          ) {
            return schedule();
          }
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ATTR_WATCH,
    });

    sync();
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, RoidTool);
  }

  (function injectFonts() {
    const root = document.documentElement;
    if (root.hasAttribute("data-roid-tool-ui-fonts")) return;
    root.setAttribute("data-roid-tool-ui-fonts", "");
    const preG = Object.assign(document.createElement("link"), {
      rel: "preconnect",
      href: "https://fonts.googleapis.com",
    });
    const preS = Object.assign(document.createElement("link"), {
      rel: "preconnect",
      href: "https://fonts.gstatic.com",
      crossOrigin: "",
    });
    const sheet = Object.assign(document.createElement("link"), {
      rel: "stylesheet",
      href:
        "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Outfit:wght@400;500;600&display=swap",
    });
    document.head.append(preG, preS, sheet);
  })();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
