// Tiny DOM helpers for the HTML overlay (menu, lobby, end screens, touch controls).

type Props = Record<string, unknown> & { class?: string; text?: string };

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v as string;
    else if (k === 'text') el.textContent = v as string;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener);
    else if (k.includes('-')) el.setAttribute(k, String(v));
    else (el as any)[k] = v;
  }
  el.append(...children);
  return el;
}

export function uiRoot(): HTMLElement {
  let root = document.getElementById('ui');
  if (!root) {
    root = h('div', { id: 'ui' });
    document.body.append(root);
  }
  return root;
}

/** Mounts a screen into the overlay; returns an unmount function. */
export function mount(el: HTMLElement): () => void {
  uiRoot().append(el);
  return () => el.remove();
}

export function toast(msg: string): void {
  const el = h('div', { class: 'toast', text: msg });
  uiRoot().append(el);
  setTimeout(() => el.remove(), 3300);
}

export const cssColor = (c: number) => '#' + c.toString(16).padStart(6, '0');

export function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage: just don't remember */
  }
}

export const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
