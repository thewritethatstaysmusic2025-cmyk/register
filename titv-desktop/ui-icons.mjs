const NS = 'http://www.w3.org/2000/svg';

/** Render only a dedicated TITV icon slot. Never clear a button or exported SVG. */
export function mountUiIcon(slot) {
  if (!(slot instanceof HTMLElement) || !slot.matches('[data-titv-icon]')) return false;
  const id = slot.dataset.titvIcon;
  if (!/^i-[a-z0-9-]+$/.test(id || '')) return false;
  const symbol = document.querySelector('.ui-icon-sprite')?.querySelector(`[id="${id}"]`);
  if (!symbol || symbol.localName !== 'symbol') return false;
  const old = slot.firstElementChild;
  if (slot.childNodes.length === 1 && old?.namespaceURI === NS && old.localName === 'svg' &&
      old.classList.contains('tribal-icon') && old.children.length === 1 &&
      old.firstElementChild?.localName === 'use' && old.firstElementChild.getAttribute('href') === '#' + id) return false;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'tribal-icon');
  svg.setAttribute('viewBox', symbol.getAttribute('viewBox') || '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  // Atomic replacement: repeated renders always leave exactly one icon.
  slot.replaceChildren(svg);
  return true;
}

export function syncUiIcons(root = document) {
  let changed = 0;
  if (root instanceof HTMLElement && root.matches('[data-titv-icon]')) changed += Number(mountUiIcon(root));
  for (const slot of root.querySelectorAll('[data-titv-icon]')) changed += Number(mountUiIcon(slot));
  return changed;
}
