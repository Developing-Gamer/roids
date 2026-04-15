(() => {
  const w = window;
  if (w.__roidToolLoaded) return;
  w.__roidToolLoaded = true;

  const TOOL_SEL = "[data-roid-tool]";
  const OPTION_SEL = "[data-roid-option]";
  const THEMES_SEL = "[data-roid-themes]";
  const THEME_ENTRY_SEL = "[data-roid-theme]";
  const OBSERVED_SEL = `${TOOL_SEL},${OPTION_SEL},${THEMES_SEL},${THEME_ENTRY_SEL}`;
  const TOOL_TAG = "roid-tool";
  const THEME_KEY = "roid-tool-theme";
  const ATTR_FILTER = [
    "data-roid-tool",
    "data-roid-option",
    "data-roid-fonts",
    "data-roid-font-target",
    "data-roid-themes",
    "data-roid-theme",
    "data-roid-theme-label",
    "data-roid-theme-accent",
    "hidden",
  ];

  function ensureUiFonts() {
    if (document.documentElement.hasAttribute("data-roid-tool-ui-fonts")) return;
    document.documentElement.setAttribute("data-roid-tool-ui-fonts", "");

    const a = document.createElement("link");
    a.rel = "preconnect";
    a.href = "https://fonts.googleapis.com";

    const b = document.createElement("link");
    b.rel = "preconnect";
    b.href = "https://fonts.gstatic.com";
    b.crossOrigin = "";

    const c = document.createElement("link");
    c.rel = "stylesheet";
    c.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Outfit:wght@500;600&display=swap";

    document.head.append(a, b, c);
  }

  function text(v, fallback) {
    const out = (v ?? "").trim();
    return out ? out : fallback;
  }

  function directChildrenWith(el, attr) {
    return Array.from(el.children).filter(child => child.hasAttribute(attr));
  }

  function directChildWith(el, attr) {
    return Array.from(el.children).find(child => child.hasAttribute(attr)) || null;
  }

  function readThemes(toolEl) {
    const themesRoot = directChildWith(toolEl, "data-roid-themes");
    if (!themesRoot) return [];

    return Array.from(themesRoot.children)
      .filter(child => child.hasAttribute("data-roid-theme"))
      .map(child => {
        const id = text(child.getAttribute("data-roid-theme"), "");
        const accent = text(child.getAttribute("data-roid-theme-accent"), "");
        if (!id || !accent) return null;
        return {
          id,
          label: text(child.getAttribute("data-roid-theme-label"), id),
          accent,
          source: child,
        };
      })
      .filter(Boolean);
  }

  function scan() {
    const toolEl = document.querySelector(TOOL_SEL);
    if (!toolEl) return null;

    const options = directChildrenWith(toolEl, "data-roid-option").map((element, index) => ({
      label: text(element.getAttribute("data-roid-option"), `Option ${index + 1}`),
      element,
    }));
    const themes = readThemes(toolEl);
    const fonts = (toolEl.getAttribute("data-roid-fonts") || "")
      .split(",")
      .map(part => part.trim())
      .filter(Boolean);
    const fontTarget = text(toolEl.getAttribute("data-roid-font-target"), "");
    const activeIndex = options.findIndex(option => !option.element.hidden);
    const showLayout = options.length >= 2;
    const showTheme = themes.length > 0;
    const hasFonts = fonts.length > 0;

    if (!showLayout && !showTheme && !hasFonts) return null;

    return {
      label: text(toolEl.getAttribute("data-roid-tool"), "Decision 1"),
      toolEl,
      options,
      themes,
      fonts,
      fontTarget: fontTarget || null,
      showLayout,
      showTheme,
      hasFonts,
      activeIndex: Math.max(0, activeIndex),
    };
  }

  function activeIdx(group) {
    const idx = group.activeIndex;
    if (idx >= 0 && idx < group.options.length && !group.options[idx].element.hidden) return idx;
    const next = group.options.findIndex(option => !option.element.hidden);
    return (group.activeIndex = Math.max(0, next));
  }

  function applyVis(group, chosen, selfMutated) {
    let changed = false;
    let chosenIndex = 0;

    for (let i = 0; i < group.options.length; i++) {
      const option = group.options[i];
      const el = option.element;
      const hide = option !== chosen;
      if (!hide) chosenIndex = i;

      if (el.hidden !== hide) {
        selfMutated?.add(el);
        el.hidden = hide;
        changed = true;
      }

      if (hide) {
        if (el.style.display !== "none") el.style.display = "none";
        el.removeAttribute("data-roid-active");
      } else {
        if (el.style.display) el.style.removeProperty("display");
        el.setAttribute("data-roid-active", "");
      }
    }

    group.activeIndex = chosenIndex;
    return changed;
  }

  function relevant(node) {
    return node instanceof Element
      ? node.matches(OBSERVED_SEL) || node.querySelector(OBSERVED_SEL) !== null
      : false;
  }

  function readAccentValue(fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || fallback || "#fff";
  }

  class RoidTool extends HTMLElement {
    root;
    dialog;
    prev;
    next;
    posText;
    labelText;
    panel;
    segTheme;
    segLayout;
    segFontDd;
    divThemeTrail;
    divFontLead;
    centerDiv;
    metaEl;
    themeCluster;
    themeTrigger;
    themeSwatchWrap;
    fontTrigger;
    fontDropdown;
    fontWrap;
    fontLabel;
    group = null;
    onSelect = null;
    themeExpanded = false;
    fontExpanded = false;
    _hoverInTimer = null;
    _hoverOutTimer = null;
    _themePinned = false;
    _lastThemePinned = false;
    _navMode = "idle";
    _currentFont = "";
    _fontTargetEl = null;
    _fontDocClick;
    onDocKey;
    themeObserver;

    constructor() {
      super();
      this.root = this.attachShadow({ mode: "open" });
      this.root.innerHTML = `<style>
        :host{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:block;width:auto;max-width:calc(100vw - 16px);z-index:2147483647;color:#fff;font-family:"Outfit",ui-sans-serif,system-ui,sans-serif;line-height:1}
        *,*::before,*::after{box-sizing:border-box}
        [hidden]{display:none!important}
        dialog{display:block;position:static;inset:auto;margin:0;padding:0;border:0;width:100%;max-width:none;background:transparent;color:inherit;overflow:visible;outline:none}
        [data-panel]{display:flex;flex-direction:row;align-items:stretch;height:44px;min-width:0;border-radius:14px;padding:5px;background:rgba(12,12,14,.72);box-shadow:0 0 0 1px rgba(0,0,0,.85),inset 0 0 0 1px rgba(255,255,255,.09),0 24px 48px -14px rgba(0,0,0,.55);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);transition:min-width .36s cubic-bezier(0.4,0,0.2,1),width .36s cubic-bezier(0.4,0,0.2,1)}
        [data-panel][data-theme-open]{min-width:min(calc(100vw - 16px),30rem)}
        [data-seg]{display:flex;flex-direction:row;align-items:center;flex-shrink:0}
        [data-seg][hidden]{display:none!important}
        [data-seg="layout"]{flex:1;min-width:0}
        [data-dw]{display:flex;align-items:center;padding:0 5px}
        [data-dw][hidden]{display:none!important}
        [data-d]{width:1px;height:18px;background:rgba(255,255,255,.12)}
        [data-theme-cluster]{display:flex;align-items:center;flex-shrink:0;padding:0 5px;overflow:visible}
        [data-theme-trigger]{width:22px;height:22px;border-radius:50%;border:2px solid rgba(255,255,255,.55);padding:0;cursor:pointer;flex-shrink:0;box-shadow:0 0 0 1px rgba(0,0,0,.25),0 1px 6px rgba(0,0,0,.4);transition:transform .2s ease,border-color .2s ease}
        [data-theme-trigger]:hover{transform:scale(1.08);border-color:rgba(255,255,255,.8);outline:none}
        [data-theme-trigger]:focus-visible{outline:2px solid #fff;outline-offset:2px}
        [data-swatches-clip]{overflow-x:hidden;overflow-y:visible;max-width:0;flex-shrink:0;transition:max-width .38s cubic-bezier(0.4,0,0.2,1) .05s}
        [data-theme-cluster][data-expanded="true"] [data-swatches-clip]{max-width:300px;transition:max-width .38s cubic-bezier(0.4,0,0.2,1)}
        [data-theme-cluster][data-pinned="true"] [data-swatches-clip]{max-width:300px;transition:none}
        [data-swatches]{display:flex;align-items:center;gap:5px;opacity:0;padding:4px 6px 4px 8px;transition:opacity .24s ease .08s}
        [data-theme-cluster][data-expanded="true"] [data-swatches]{opacity:1;transition:opacity .24s ease .04s}
        [data-theme-cluster][data-pinned="true"] [data-swatches]{opacity:1;transition:none}
        [data-swatch]{width:22px;height:22px;border-radius:50%;border:1.5px solid transparent;padding:0;cursor:pointer;flex-shrink:0;transition:transform .16s cubic-bezier(0.34,1.56,0.64,1),border-color .14s,box-shadow .14s}
        [data-swatch]:hover{transform:scale(1.14)}
        [data-swatch][aria-pressed="true"]{border-color:#fff;box-shadow:0 0 0 2.5px rgba(255,255,255,.3)}
        [data-theme-cluster][data-pinned="false"] [data-swatch][data-active]{display:none}
        [data-theme-cluster][data-pinned="true"] [data-theme-trigger]{display:none!important}
        [data-swatch]:focus-visible{outline:2px solid #fff;outline-offset:2px}
        [data-nav]{width:34px;height:34px;border:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:#9ca3af;background:transparent;cursor:pointer;transition:color 140ms ease,background-color 140ms ease,opacity 140ms ease}
        [data-nav]:hover,[data-nav]:focus-visible{color:#fff;background:rgba(255,255,255,.1);outline:none}
        [data-nav]:disabled{opacity:.45;cursor:default}
        [data-center]{min-width:0;display:flex;align-items:center;padding:0 10px;gap:10px;flex:1}
        [data-meta]{min-width:0;flex:1;display:flex;align-items:baseline;gap:10px}
        [data-pos]{flex-shrink:0;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;font-weight:500;color:rgba(255,255,255,.45)}
        [data-lbl]{min-width:0;flex:1;font-size:13px;font-weight:600;letter-spacing:-.01em;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f4f4f5}
        [data-lbl][data-empty]{color:rgba(255,255,255,.5)}
        [data-panel][data-font-only] [data-center]{padding:0;gap:0;align-items:stretch;overflow:visible}
        [data-panel][data-font-only] [data-font-wrap]{flex:1;display:flex;justify-content:center;align-items:center;padding:0;position:relative}
        [data-panel][data-font-only] [data-font-trigger]{max-width:none}
        [data-panel][data-font-only] [data-font-dd]{left:50%;right:auto;transform:translateX(-50%) scale(.92) translateY(6px);transform-origin:bottom center}
        [data-panel][data-font-only] [data-font-dd][data-open]{transform:translateX(-50%) scale(1) translateY(0)}
        [data-font-wrap]{display:flex;align-items:center;flex-shrink:0;padding:0 5px;position:relative}
        [data-font-trigger]{-webkit-appearance:none;appearance:none;display:inline-block;vertical-align:middle;margin:0;padding:0;border:0;border-radius:10px;overflow:hidden;background:transparent;color:#9ca3af;cursor:pointer;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11px;font-weight:500;line-height:1;max-width:120px;transition:color 140ms ease}
        [data-font-face]{display:grid;grid-template-columns:22px auto 22px;align-items:center;column-gap:6px;min-height:34px;padding:0 10px;border-radius:10px;box-sizing:border-box;transition:background-color 140ms ease,color 140ms ease}
        [data-font-trigger]:hover [data-font-face],[data-font-trigger]:focus-visible [data-font-face],[data-font-trigger][aria-expanded="true"] [data-font-face]{color:#fff;background:rgba(255,255,255,.1);outline:none}
        [data-font-slot]{display:flex;align-items:center;justify-content:center;min-width:0}
        [data-font-slot] svg{display:block;width:14px;height:14px;flex-shrink:0}
        [data-font-label]{min-width:0;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        [data-font-chevron]{transition:transform .2s ease}
        [data-font-trigger][aria-expanded="true"] [data-font-chevron]{transform:rotate(180deg)}
        [data-font-dd]{position:absolute;right:0;bottom:calc(100% + 8px);min-width:180px;max-width:240px;background:rgba(18,18,20,.96);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:5px;box-shadow:0 0 0 1px rgba(0,0,0,.7),0 16px 48px rgba(0,0,0,.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);overflow:hidden;transform-origin:bottom right;transform:scale(.92) translateY(6px);opacity:0;pointer-events:none;transition:transform .2s cubic-bezier(0.34,1.3,0.64,1),opacity .18s ease}
        [data-font-dd][data-open]{transform:scale(1) translateY(0);opacity:1;pointer-events:auto;transition:transform .22s cubic-bezier(0.34,1.3,0.64,1),opacity .16s ease}
        [data-font-item]{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 10px;border:0;background:transparent;border-radius:8px;cursor:pointer;text-align:left;color:#d1d5db;font-size:14px;transition:background .12s ease,color .12s ease}
        [data-font-item]:hover,[data-font-item]:focus-visible{background:rgba(255,255,255,.08);color:#fff;outline:none}
        [data-font-item][aria-selected="true"]{color:#fff}
        [data-font-item] [data-check]{width:14px;height:14px;flex-shrink:0;opacity:0;color:rgba(255,255,255,.6)}
        [data-font-item][aria-selected="true"] [data-check]{opacity:1}
        @media(max-width:640px){:host{left:8px;bottom:8px;transform:none}}
      </style>
      <dialog aria-label="Roid Tool" tabindex="-1">
        <section data-panel>
          <div data-seg="theme">
            <div data-theme-cluster data-expanded="false" data-pinned="false">
              <button type="button" data-theme-trigger aria-label="Theme" aria-expanded="false" title="Theme"></button>
              <div data-swatches-clip><div data-swatches role="group" aria-label="Theme choices"></div></div>
            </div>
            <div data-dw data-div="theme-trail"><div data-d></div></div>
          </div>
          <div data-seg="layout">
            <button type="button" data-nav data-previous aria-label="Previous">
              <svg viewBox="0 0 5 6" fill="currentColor" width="6" height="7" aria-hidden="true"><path d="M0.75 3L4.25 5.25L4.25 0.75L0.75 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
            </button>
            <div data-dw><div data-d></div></div>
            <div data-center><span data-meta><span data-pos></span><span data-lbl data-empty></span></span></div>
            <div data-dw><div data-d></div></div>
            <button type="button" data-nav data-next aria-label="Next">
              <svg viewBox="0 0 5 6" fill="currentColor" width="6" height="7" aria-hidden="true"><path d="M4.25 3L0.75 5.25L0.75 0.75L4.25 3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div data-seg="font-dd">
            <div data-dw data-div="font-lead"><div data-d></div></div>
            <div data-font-wrap>
              <button type="button" data-font-trigger aria-haspopup="listbox" aria-expanded="false" aria-label="Font">
                <span data-font-face>
                  <span data-font-slot><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg></span>
                  <span data-font-label>Font</span>
                  <span data-font-slot><svg data-font-chevron width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg></span>
                </span>
              </button>
              <div data-font-dd role="listbox" aria-label="Choose font"></div>
            </div>
          </div>
        </section>
      </dialog>`;

      const dialog = this.root.querySelector("dialog");
      const prev = this.root.querySelector("[data-previous]");
      const next = this.root.querySelector("[data-next]");
      const posText = this.root.querySelector("[data-pos]");
      const labelText = this.root.querySelector("[data-lbl]");

      if (!(dialog instanceof HTMLDialogElement) || !(prev instanceof HTMLButtonElement) ||
          !(next instanceof HTMLButtonElement) || !(posText instanceof HTMLElement) ||
          !(labelText instanceof HTMLElement)) {
        throw new Error("roid-tool: dom init failed");
      }

      this.dialog = dialog;
      this.prev = prev;
      this.next = next;
      this.posText = posText;
      this.labelText = labelText;
      this.panel = this.root.querySelector("[data-panel]");
      this.segTheme = this.root.querySelector("[data-seg=\"theme\"]");
      this.segLayout = this.root.querySelector("[data-seg=\"layout\"]");
      this.segFontDd = this.root.querySelector("[data-seg=\"font-dd\"]");
      this.divThemeTrail = this.root.querySelector("[data-div=\"theme-trail\"]");
      this.divFontLead = this.root.querySelector("[data-div=\"font-lead\"]");
      this.centerDiv = this.root.querySelector("[data-center]");
      this.metaEl = this.root.querySelector("[data-meta]");
      this.themeCluster = this.root.querySelector("[data-theme-cluster]");
      this.themeTrigger = this.root.querySelector("[data-theme-trigger]");
      this.themeSwatchWrap = this.root.querySelector("[data-swatches]");
      this.fontTrigger = this.root.querySelector("[data-font-trigger]");
      this.fontDropdown = this.root.querySelector("[data-font-dd]");
      this.fontWrap = this.root.querySelector("[data-font-wrap]");
      this.fontLabel = this.root.querySelector("[data-font-label]");

      const openDelay = 280;
      const closeDelay = 320;
      const scheduleOpen = () => {
        if (this._themePinned) return;
        clearTimeout(this._hoverOutTimer);
        if (!this.themeExpanded) this._hoverInTimer = setTimeout(() => this._expandTheme(), openDelay);
      };
      const scheduleClose = () => {
        if (this._themePinned) return;
        clearTimeout(this._hoverInTimer);
        this._hoverOutTimer = setTimeout(() => this._collapseTheme(), closeDelay);
      };

      this.themeCluster?.addEventListener("mouseenter", scheduleOpen);
      this.themeCluster?.addEventListener("mouseleave", scheduleClose);
      this.themeCluster?.addEventListener("focusin", () => {
        if (this._themePinned) return;
        clearTimeout(this._hoverOutTimer);
        if (!this.themeExpanded) this._hoverInTimer = setTimeout(() => this._expandTheme(), openDelay);
      });
      this.themeCluster?.addEventListener("focusout", event => {
        if (this._themePinned) return;
        const nextTarget = event.relatedTarget;
        if (this.themeCluster.contains(nextTarget) || this.root.contains(nextTarget)) return;
        clearTimeout(this._hoverInTimer);
        this._hoverOutTimer = setTimeout(() => this._collapseTheme(), closeDelay);
      });

      this.themeObserver = new MutationObserver(() => this._syncThemeFromDom());
      this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      this.fontTrigger?.addEventListener("click", event => {
        event.stopPropagation();
        this._setFontOpen(!this.fontExpanded);
      });

      this._fontDocClick = event => {
        if (!this.fontExpanded) return;
        const path = typeof event.composedPath === "function" ? event.composedPath() : [];
        if (!path.includes(this)) this._setFontOpen(false);
      };

      this.onDocKey = event => {
        if (event.key !== "Escape") return;
        if (this.fontExpanded) {
          event.preventDefault();
          event.stopPropagation();
          this._setFontOpen(false);
          return;
        }
        if (this.themeExpanded && !this._themePinned) {
          event.preventDefault();
          event.stopPropagation();
          this._collapseTheme();
        }
      };

      this.dialog.addEventListener("keydown", this.onKeyDown);
      this.dialog.addEventListener("pointerdown", event => {
        if (event.button === 0 && event.target instanceof Element && !event.target.closest("button")) {
          this.dialog.focus({ preventScroll: true });
        }
      });
      this.prev.addEventListener("click", () => this._onNav(-1));
      this.next.addEventListener("click", () => this._onNav(1));
    }

    connectedCallback() {
      if (!this.dialog.open) this.dialog.show();
      this._focusDialog();
      document.addEventListener("keydown", this.onDocKey, true);
      document.addEventListener("click", this._fontDocClick, true);
      this._syncThemeFromDom();
      this._syncFontItems();
      this._syncOptionAttrs();
    }

    disconnectedCallback() {
      clearTimeout(this._hoverInTimer);
      clearTimeout(this._hoverOutTimer);
      document.removeEventListener("keydown", this.onDocKey, true);
      document.removeEventListener("click", this._fontDocClick, true);
      this.themeObserver?.disconnect();
    }

    _toolEl() {
      return this.group?.toolEl || null;
    }

    _dispatchChange(kind, detail) {
      const toolEl = this._toolEl();
      if (!toolEl) return;
      const base = { kind, tool: toolEl, ...detail };
      toolEl.dispatchEvent(new CustomEvent("roid-tool-change", { bubbles: true, composed: true, detail: base }));
      toolEl.dispatchEvent(new CustomEvent(`roid-tool-${kind}-change`, { bubbles: true, composed: true, detail: base }));
    }

    _currentThemeId() {
      if (!this.group?.themes?.length) return "";
      const current = text(document.documentElement.getAttribute("data-theme"), "");
      return this.group.themes.some(theme => theme.id === current) ? current : "";
    }

    _preferredThemeId() {
      const current = this._currentThemeId();
      if (current) return current;

      try {
        const stored = text(localStorage.getItem(THEME_KEY), "");
        if (this.group?.themes?.some(theme => theme.id === stored)) return stored;
      } catch (_) {}

      return this.group?.themes?.[0]?.id || "";
    }

    _themeEntryById(id) {
      return this.group?.themes?.find(theme => theme.id === id) || null;
    }

    _buildThemeItems(themes) {
      if (!this.themeSwatchWrap) return;
      this.themeSwatchWrap.innerHTML = "";

      themes.forEach(theme => {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("data-swatch", "");
        button.dataset.themeId = theme.id;
        button.title = theme.label;
        button.setAttribute("aria-label", `${theme.label} theme`);
        button.setAttribute("aria-pressed", "false");
        button.style.background = theme.accent;
        button.addEventListener("click", event => {
          event.stopPropagation();
          this._setActiveTheme(theme.id, { label: theme.label, accent: theme.accent });
          if (!this._themePinned) {
            clearTimeout(this._hoverInTimer);
            clearTimeout(this._hoverOutTimer);
            this._collapseTheme();
          }
        });
        this.themeSwatchWrap.append(button);
      });
    }

    _syncTrigger() {
      if (!this.themeTrigger) return;
      const currentId = this._currentThemeId();
      const current = currentId ? this._themeEntryById(currentId) : null;
      this.themeTrigger.style.background = readAccentValue(current?.accent || "");
      this.themeTrigger.title = current ? `Theme: ${current.label}` : "Theme";
    }

    _syncSwatchPressed() {
      const currentId = this._currentThemeId();
      this.themeSwatchWrap?.querySelectorAll("[data-swatch]").forEach(button => {
        const active = button.dataset.themeId === currentId;
        button.setAttribute("aria-pressed", active ? "true" : "false");
        if (active) button.setAttribute("data-active", "");
        else button.removeAttribute("data-active");
      });
    }

    _syncThemeAttrs() {
      const toolEl = this._toolEl();
      if (!toolEl) return;
      const currentId = this._currentThemeId();
      if (!currentId) {
        toolEl.removeAttribute("data-roid-active-theme");
        return;
      }
      toolEl.setAttribute("data-roid-active-theme", currentId);
    }

    _setActiveTheme(id, opts = {}) {
      const theme = this._themeEntryById(id);
      if (!theme) return;

      document.documentElement.setAttribute("data-theme", theme.id);
      this._syncThemeAttrs();
      this._syncTrigger();
      this._syncSwatchPressed();

      if (opts.persist !== false) {
        try { localStorage.setItem(THEME_KEY, theme.id); } catch (_) {}
      }

      if (!opts.skipEvent) {
        this._dispatchChange("theme", {
          value: theme.id,
          label: opts.label || theme.label,
          theme: theme.id,
          accent: opts.accent || theme.accent,
          target: document.documentElement,
        });
      }
    }

    _syncThemeFromDom() {
      if (!this.group?.showTheme) return;
      this._syncThemeAttrs();
      this._syncTrigger();
      this._syncSwatchPressed();
    }

    _resolveFontTarget() {
      if (this.group?.fontTarget) {
        const target = document.querySelector(this.group.fontTarget);
        if (target) return target;
      }
      return this.group?.toolEl || null;
    }

    _buildFontItems(fonts) {
      if (!this.fontDropdown) return;
      this.fontDropdown.innerHTML = "";

      fonts.forEach(family => {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("data-font-item", "");
        item.setAttribute("role", "option");
        item.dataset.fontFamily = family;
        item.setAttribute("aria-selected", family === this._currentFont ? "true" : "false");

        const nameSpan = document.createElement("span");
        nameSpan.textContent = family;
        nameSpan.style.cssText = `font-family:"${family}",sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;

        const check = document.createElement("span");
        check.setAttribute("data-check", "");
        check.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

        item.append(nameSpan, check);
        item.addEventListener("click", event => {
          event.stopPropagation();
          this._setActiveFont(family);
          this._setFontOpen(false);
        });

        this.fontDropdown.append(item);
      });
    }

    _syncFontItems() {
      this.fontDropdown?.querySelectorAll("[data-font-item]").forEach(item => {
        item.setAttribute("aria-selected", item.dataset.fontFamily === this._currentFont ? "true" : "false");
      });

      if (this.fontLabel) {
        this.fontLabel.textContent = this._currentFont || "Font";
        if (this._currentFont) this.fontLabel.style.fontFamily = `"${this._currentFont}",sans-serif`;
        else this.fontLabel.style.removeProperty("font-family");
      }

      const toolEl = this._toolEl();
      if (!toolEl) return;
      if (this._currentFont) toolEl.setAttribute("data-roid-active-font", this._currentFont);
      else toolEl.removeAttribute("data-roid-active-font");
    }

    _setActiveFont(family, opts = {}) {
      if (!this.group?.fonts?.includes(family)) return;

      this._currentFont = family;
      const target = this._resolveFontTarget();

      if (this._fontTargetEl && this._fontTargetEl !== target) {
        this._fontTargetEl.removeAttribute("data-roid-active-font");
      }
      this._fontTargetEl = target;

      if (target) {
        target.style.fontFamily = `"${family}",sans-serif`;
        target.setAttribute("data-roid-active-font", family);
      }

      this._syncFontItems();

      if (!opts.skipEvent) {
        this._dispatchChange("font", {
          value: family,
          label: family,
          font: family,
          target,
        });
      }
    }

    _moveFont(dir) {
      const fonts = this.group?.fonts;
      if (!fonts?.length) return;
      let index = fonts.indexOf(this._currentFont);
      if (index < 0) index = 0;
      this._setActiveFont(fonts[(index + dir + fonts.length) % fonts.length]);
    }

    _setFontOpen(open) {
      this.fontExpanded = open;
      if (open) this.fontDropdown?.setAttribute("data-open", "");
      else this.fontDropdown?.removeAttribute("data-open");
      this.fontTrigger?.setAttribute("aria-expanded", open ? "true" : "false");
    }

    _syncOptionAttrs() {
      const toolEl = this._toolEl();
      if (!toolEl) return;

      if (!this.group?.showLayout) {
        toolEl.removeAttribute("data-roid-active-option");
        toolEl.removeAttribute("data-roid-active-option-index");
        return;
      }

      const idx = activeIdx(this.group);
      const option = this.group.options[idx];
      if (!option) return;

      toolEl.setAttribute("data-roid-active-option", option.label);
      toolEl.setAttribute("data-roid-active-option-index", String(idx));
    }

    emitOptionChange() {
      if (!this.group?.showLayout) return;
      const idx = activeIdx(this.group);
      const option = this.group.options[idx];
      if (!option) return;
      this._syncOptionAttrs();
      this._dispatchChange("option", {
        value: option.label,
        label: option.label,
        option: option.label,
        index: idx,
        target: option.element,
        element: option.element,
      });
    }

    _expandTheme() {
      this.themeExpanded = true;
      this.themeCluster?.setAttribute("data-expanded", "true");
      this.panel?.setAttribute("data-theme-open", "");
      this.themeTrigger?.setAttribute("aria-expanded", "true");
    }

    _collapseTheme() {
      this.themeExpanded = false;
      this.themeCluster?.setAttribute("data-expanded", "false");
      this.panel?.removeAttribute("data-theme-open");
      this.themeTrigger?.setAttribute("aria-expanded", "false");
    }

    _focusDialog() {
      const active = this.root.activeElement;
      if (active instanceof HTMLElement && active !== this.dialog) active.blur();
      this.dialog.focus({ preventScroll: true });
    }

    update(group, cb) {
      this.group = group;
      this.onSelect = cb;

      const showLayout = group.showLayout;
      const showTheme = group.showTheme;
      const hasFonts = group.hasFonts;
      const fontOnly = hasFonts && !showLayout && !showTheme;
      const fontDropdownMode = hasFonts && !fontOnly;
      const themePinned = showTheme && !showLayout && !hasFonts;

      this._navMode = showLayout ? "layout" : (fontOnly ? "font" : "idle");
      this._themePinned = themePinned;

      this.segTheme.hidden = !showTheme;
      this.segLayout.hidden = !(showLayout || fontOnly);
      this.segFontDd.hidden = !fontDropdownMode;

      if (fontOnly) {
        if (this.fontWrap.parentElement !== this.centerDiv) this.centerDiv.appendChild(this.fontWrap);
        this.metaEl.hidden = true;
      } else {
        if (this.fontWrap.parentElement !== this.segFontDd) this.segFontDd.appendChild(this.fontWrap);
        this.metaEl.hidden = false;
      }

      this.divThemeTrail.hidden = !(showTheme && (showLayout || fontOnly || fontDropdownMode));
      this.divFontLead.hidden = !showLayout;
      this.panel.style.minWidth = (showLayout || fontOnly) ? "" : "0";
      this.panel.toggleAttribute("data-font-only", fontOnly);

      if (showTheme) {
        this._buildThemeItems(group.themes);
        const preferredTheme = this._preferredThemeId();
        if (preferredTheme) this._setActiveTheme(preferredTheme, { skipEvent: true, persist: false });
      } else {
        this.themeSwatchWrap.innerHTML = "";
        this._collapseTheme();
        this._toolEl()?.removeAttribute("data-roid-active-theme");
      }

      if (!showTheme) {
        clearTimeout(this._hoverInTimer);
        clearTimeout(this._hoverOutTimer);
        this._collapseTheme();
      } else if (themePinned) {
        clearTimeout(this._hoverInTimer);
        clearTimeout(this._hoverOutTimer);
        this._expandTheme();
      } else if (this._lastThemePinned) {
        clearTimeout(this._hoverInTimer);
        clearTimeout(this._hoverOutTimer);
        this._collapseTheme();
      }
      this._lastThemePinned = themePinned;
      this.themeCluster?.setAttribute("data-pinned", themePinned ? "true" : "false");

      if (hasFonts) {
        this._buildFontItems(group.fonts);
        const preferredFont = group.fonts.includes(this._currentFont) ? this._currentFont : group.fonts[0];
        if (preferredFont) this._setActiveFont(preferredFont, { skipEvent: true });
      } else {
        this._currentFont = "";
        this.fontDropdown.innerHTML = "";
        this._setFontOpen(false);
        this._toolEl()?.removeAttribute("data-roid-active-font");
        if (this._fontTargetEl) this._fontTargetEl.removeAttribute("data-roid-active-font");
        this._fontTargetEl = null;
      }

      this._syncThemeFromDom();
      this._syncOptionAttrs();
      this._render();
      if (!this.dialog.open) this.dialog.show();
      this._focusDialog();
    }

    _render() {
      const group = this.group;
      if (!group) return;

      if (this._navMode === "font") {
        this.posText.textContent = "";
        this.labelText.textContent = "";
        this.labelText.style.removeProperty("font-family");
        this.labelText.setAttribute("data-empty", "");
        this.prev.disabled = this.next.disabled = (group.fonts?.length ?? 0) <= 1;
        return;
      }

      if (this._navMode === "layout") {
        const idx = activeIdx(group);
        const hasChoices = group.options.length > 1;
        this.posText.textContent = `${idx + 1}/${group.options.length}`;
        this.posText.title = group.label;
        this.prev.disabled = this.next.disabled = !hasChoices;
        this.labelText.textContent = group.options[idx].label;
        this.labelText.style.removeProperty("font-family");
        this.labelText.removeAttribute("data-empty");
        return;
      }

      this.posText.textContent = "";
      this.labelText.textContent = "";
      this.labelText.style.removeProperty("font-family");
      this.labelText.setAttribute("data-empty", "");
      this.prev.disabled = true;
      this.next.disabled = true;
    }

    _moveLayout(dir) {
      const group = this.group;
      if (!group || group.options.length <= 1) return;
      const option = group.options[(activeIdx(group) + dir + group.options.length) % group.options.length];
      if (option) {
        this.onSelect?.(option);
        this.dialog.focus({ preventScroll: true });
      }
    }

    _onNav(dir) {
      if (this._navMode === "layout") this._moveLayout(dir);
      else if (this._navMode === "font") this._moveFont(dir);
    }

    onKeyDown = event => {
      if (!this.group || event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && this._navMode !== "idle") {
        event.preventDefault();
        this._onNav(event.key === "ArrowRight" ? 1 : -1);
      }
    };
  }

  customElements.get(TOOL_TAG) || customElements.define(TOOL_TAG, RoidTool);

  function init() {
    let el = null;
    let pending = false;
    const selfMutated = new WeakSet();

    function schedule() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        run();
      });
    }

    function run() {
      const group = scan();
      if (!group) {
        el?.remove();
        el = null;
        return;
      }

      if (group.options.length > 0) {
        applyVis(group, group.options[activeIdx(group)] ?? group.options[0], selfMutated);
      }

      if (!el) {
        el = document.createElement(TOOL_TAG);
        (document.body ?? document.documentElement).append(el);
      }

      const select = option => {
        applyVis(group, option, selfMutated);
        el?.update(group, select);
        el?.emitOptionChange();
      };

      el.update(group, select);
    }

    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === "attributes") {
          if (record.attributeName === "hidden" && selfMutated.delete(record.target)) continue;
          if (relevant(record.target) || (record.target instanceof Element && record.target.matches(TOOL_SEL))) {
            schedule();
            return;
          }
          continue;
        }

        for (const node of record.addedNodes) {
          if (relevant(node)) {
            schedule();
            return;
          }
        }

        for (const node of record.removedNodes) {
          if (relevant(node)) {
            schedule();
            return;
          }
        }
      }
    }).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ATTR_FILTER,
    });

    run();
  }

  ensureUiFonts();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
