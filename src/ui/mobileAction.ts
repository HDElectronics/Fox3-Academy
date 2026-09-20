import { button } from './controls';

/** A second, compact control for the same action; the original remains the source of state. */
export function mobileAction(source: HTMLButtonElement, label?: string): { el: HTMLButtonElement; destroy(): void } {
  const mirror = button({ label: '', size: 's', onClick: () => {
    // Recheck synchronously: the source can change before the observer delivers its update.
    if (!source.disabled && !source.hidden) source.click();
  } });
  function sync(): void {
    mirror.setLabel(label ?? source.querySelector('.ui-btn__legend')?.textContent ?? source.textContent ?? '');
    mirror.setDisabled(source.disabled);
    mirror.el.hidden = source.hidden;
    mirror.el.title = source.title;
    for (const name of ['data-lit', 'aria-pressed', 'aria-label']) {
      const value = source.getAttribute(name);
      if (value === null) mirror.el.removeAttribute(name);
      else mirror.el.setAttribute(name, value);
    }
  }
  const observer = new MutationObserver(sync);
  observer.observe(source, { attributes: true, childList: true, characterData: true, subtree: true });
  sync();
  return { el: mirror.el, destroy() { observer.disconnect(); mirror.el.remove(); } };
}
