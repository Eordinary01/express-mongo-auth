export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];

// Tiny DOM builder. Children are appended as text nodes, never parsed as HTML.
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  });
  children
    .flat()
    .filter((child) => child !== undefined && child !== null && child !== false)
    .forEach((child) => node.append(child instanceof Node ? child : document.createTextNode(child)));
  return node;
}

export function toast(message, kind = 'info') {
  const item = el('div', { class: `toast ${kind}`, role: 'status' }, message);
  $('#toasts').append(item);
  setTimeout(() => {
    item.classList.add('leaving');
    setTimeout(() => item.remove(), 200);
  }, 3500);
}

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
