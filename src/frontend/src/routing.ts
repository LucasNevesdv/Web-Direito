export function navegar(caminho: string) {
  window.history.replaceState({}, '', caminho);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
