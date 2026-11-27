import type { UIManager } from "./UIManager";
import {
  MENU_LABELS,
  translateText,
  type Language,
} from "../data/localization";
/** Incrementally migrate legacy text through one catalogue without replacing live controls. */
export class ReleaseUI {
  private observer: MutationObserver;
  private textSources = new WeakMap<
    Text,
    { original: string; displayed: string }
  >();
  private attributeSources = new WeakMap<
    Element,
    Map<string, { original: string; displayed: string }>
  >();
  private language: Language;
  private frame = 0;
  private abort = new AbortController();
  private resize: ResizeObserver;
  constructor(ui: UIManager) {
    this.language = ui.game.save.data.settings.presentation.language;
    const welcome = ui.root.querySelector<HTMLElement>(".welcome")!;
    const groups = [
      [
        "주요 플레이",
        [
          "campaign:slots",
          "campaign:new",
          "war:setup",
          "war:continue",
          "online",
        ],
      ],
      [
        "게임 모드",
        [
          "start",
          "new-kingdom",
          "continue-kingdom",
          "mode:setup:survival",
          "mode:setup:sandbox",
          "mode:hub",
        ],
      ],
      [
        "플레이어 및 기록",
        ["mode:profile", "scores", "kingdom-history", "war:history"],
      ],
      ["도움말 및 관리", ["how", "magic:training", "settings", "credits"]],
    ] as const;
    for (const [index, [title, actions]] of groups.entries()) {
      const group = document.createElement(index === 0 ? "section" : "details");
      group.className = "menu-group";
      const heading = document.createElement(index === 0 ? "h2" : "summary");
      heading.textContent = title;
      group.append(heading);
      for (const action of actions) {
        const button =
          action === "online"
            ? welcome.querySelector<HTMLButtonElement>(".menu-primary")
            : welcome.querySelector<HTMLButtonElement>(
                `[data-action="${action}"]`,
              );
        if (!button) continue;
        const [ko, en] = MENU_LABELS[action];
        button.classList.add("bilingual-button");
        button.dataset.menuKey = action;
        button.innerHTML = `<span class="label-ko">${ko}</span><span class="label-en">${en}</span>`;
        button.title = `${ko} · ${en}`;
        button.setAttribute("aria-label", `${ko} · ${en}`);
        if (action === "new-kingdom") button.hidden = false;
        group.append(button);
      }
      welcome.append(group);
    }
    // Empty former wrappers no longer reserve space. Keep selectors for legacy UI owners.
    welcome
      .querySelectorAll<HTMLElement>(".menu-links,.mode-launch")
      .forEach((el) => {
        if (!el.children.length) el.hidden = true;
      });
    welcome.querySelector(".edition-note")!.textContent =
      "v0.11.1 BETA · ONLINE BETA";
    welcome.append(welcome.querySelector(".edition-note")!);
    this.resize = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        const b = target as HTMLElement;
        const ko = b.querySelector<HTMLElement>(".label-ko")!,
          en = b.querySelector<HTMLElement>(".label-en")!;
        const c = getComputedStyle(b);
        // Measure intrinsic labels even when the auxiliary language is hidden.
        const available =
          b.clientWidth -
          parseFloat(c.paddingLeft) -
          parseFloat(c.paddingRight);
        b.classList.toggle(
          "compact-label",
          ko.scrollWidth + en.scrollWidth + 20 > available,
        );
      }
    });
    welcome
      .querySelectorAll(".bilingual-button")
      .forEach((b) => this.resize.observe(b));
    this.observer = new MutationObserver(() => {
      if (this.language !== "en" || this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.translate();
      });
    });
    this.observe();
    document.addEventListener(
      "kingdom-language",
      () => {
        this.language = ui.game.save.data.settings.presentation.language;
        this.translate();
      },
      { signal: this.abort.signal },
    );
    this.translate();
  }
  private observe() {
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  private translate() {
    this.observer.disconnect();
    document.documentElement.lang = this.language === "en" ? "en" : "ko";
    document.body.dataset.language = this.language;
    for (const root of document.querySelectorAll("#app,.online-root")) {
      for (const element of root.querySelectorAll(
        "[aria-label],[title],[placeholder]",
      )) {
        if (element.matches("[data-menu-key]")) continue;
        const sources = this.attributeSources.get(element) ?? new Map();
        for (const name of ["aria-label", "title", "placeholder"]) {
          const current = element.getAttribute(name);
          if (current === null) continue;
          const old = sources.get(name);
          const original = old?.displayed === current ? old.original : current;
          const displayed = translateText(original, this.language);
          if (current !== displayed) element.setAttribute(name, displayed);
          sources.set(name, { original, displayed });
        }
        this.attributeSources.set(element, sources);
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = node as Text;
        if (
          text.parentElement?.closest(
            ".bilingual-button,script,style,pre,textarea,input,[contenteditable]",
          )
        )
          continue;
        const old = this.textSources.get(text);
        const original =
          old?.displayed === text.data ? old.original : text.data;
        const displayed = translateText(original, this.language);
        if (displayed !== text.data) text.data = displayed;
        this.textSources.set(text, { original, displayed });
      }
    }
    document.querySelectorAll<HTMLElement>("[data-menu-key]").forEach((b) => {
      const [ko, en] = MENU_LABELS[b.dataset.menuKey!];
      b.setAttribute(
        "aria-label",
        this.language === "en"
          ? en
          : this.language === "ko"
            ? ko
            : `${ko} · ${en}`,
      );
    });
    this.observe();
  }
  dispose() {
    this.observer.disconnect();
    this.resize.disconnect();
    this.abort.abort();
    cancelAnimationFrame(this.frame);
  }
}
