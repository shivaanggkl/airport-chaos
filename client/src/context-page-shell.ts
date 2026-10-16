import './context-page-shell.css';

export function createContextPageTitle(label: string, level: 1 | 2 = 1): HTMLHeadingElement {
  const title = document.createElement(level === 1 ? 'h1' : 'h2');
  title.className = 'context-winged-title';
  title.textContent = label;
  return title;
}

export function createContextBackButton(label: string, onClick?: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'context-back page-back';
  button.textContent = label;
  if (onClick) button.addEventListener('click', onClick);
  return button;
}
