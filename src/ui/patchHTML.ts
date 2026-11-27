/** Update small live HUDs without detaching a focused or pressed control. */
export function patchHTML(root: HTMLElement, html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const sync = (current: Node, next: Node) => {
    if (
      current.nodeType !== next.nodeType ||
      current.nodeName !== next.nodeName
    ) {
      current.parentNode!.replaceChild(next.cloneNode(true), current);
      return;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.nodeValue !== next.nodeValue)
        current.nodeValue = next.nodeValue;
      return;
    }
    if (current instanceof Element && next instanceof Element) {
      for (const a of Array.from(current.attributes))
        if (!next.hasAttribute(a.name)) current.removeAttribute(a.name);
      for (const a of Array.from(next.attributes))
        if (current.getAttribute(a.name) !== a.value)
          current.setAttribute(a.name, a.value);
    }
    const old = Array.from(current.childNodes),
      fresh = Array.from(next.childNodes);
    for (let i = 0; i < Math.max(old.length, fresh.length); i++) {
      if (!fresh[i]) old[i].remove();
      else if (!old[i]) current.appendChild(fresh[i].cloneNode(true));
      else sync(old[i], fresh[i]);
    }
  };
  const holder = root.cloneNode(false);
  holder.appendChild(template.content);
  sync(root, holder);
}
