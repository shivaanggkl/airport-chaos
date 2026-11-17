/** Render instruction bullets as rows so whitespace rules cannot merge them. */
export function setMissionInstructions(element: HTMLElement, text: string): void {
  if (!text.trimStart().startsWith('•')) {
    if (element.textContent !== text) element.textContent = text;
    delete element.dataset.missionInstructions;
    return;
  }
  if (element.dataset.missionInstructions === text && element.firstElementChild?.classList.contains('mission-instruction-list')) return;
  const list = document.createElement('span');
  list.className = 'mission-instruction-list';
  list.setAttribute('role', 'list');
  for (const line of text.split('\n').filter(line => line.trim())) {
    const row = document.createElement('span');
    row.className = 'mission-instruction-row';
    row.setAttribute('role', 'listitem');
    const marker = document.createElement('span');
    marker.className = 'mission-instruction-marker';
    marker.textContent = '• ';
    row.append(marker, document.createTextNode(line.trim().replace(/^•\s*/, '')));
    list.append(row);
  }
  element.replaceChildren(list);
  element.dataset.missionInstructions = text;
}
