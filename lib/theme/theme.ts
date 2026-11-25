// The site's colour theme (light or dark): the one state, in the browser only.
// - The theme is the attribute `data-theme="light" | "dark"` on <html>. app/globals.css switches every colour token on it, so
//   a page never asks which theme it is in (a `dark:` variant is only for showing one of two things).
// - The visitor's choice is kept in this browser (localStorage `gsm.theme`, never sent anywhere): "light" or "dark". With no
//   stored choice the site follows the system (`prefers-color-scheme`) and keeps following it while the page is open.
//   Choosing the theme the system already has removes the stored choice, so the site goes back to following the system.
// - `THEME_GUARD` is the script the root layout runs while the HTML is read, before the first paint, so a visitor never sees
//   a flash of the wrong theme. The React side is components/layout/theme-toggle.tsx.
// Nothing here runs on the server: the functions below are called from the browser (the guard is only text there).

/** The two themes. */
export type Theme = "light" | "dark";

/** The localStorage key of the visitor's choice (same naming as `gsm.search.recent`). Absent = follow the system. */
export const THEME_KEY = "gsm.theme";
/** The attribute on <html> app/globals.css reads. */
export const THEME_ATTRIBUTE = "data-theme";
/**
 * The class on <html> while a switch is painted: app/globals.css turns every transition off under it, so nothing
 * animates half-way between two themes.
 */
export const THEME_SWITCHING_CLASS = "theme-switching";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * The script the root layout runs while the HTML is read, before anything is painted. It never throws (storage may be
 * blocked, `matchMedia` may be missing):
 * - sets `<html data-theme>` from the stored choice, else the system preference, else light;
 * - while no choice is stored, follows a change of the system preference;
 * - applies a choice made in another tab (the `storage` event), also when that tab removed it;
 * - applies the choice again when the page comes back from the back/forward cache (`pageshow`), where it kept the theme it
 *   had when it was left;
 * - a change after the first paint holds every transition for a moment (the class of `THEME_SWITCHING_CLASS`), as the switch does.
 * The layout covers the attribute with `suppressHydrationWarning`; the root layout is never rendered again on the client.
 */
export const THEME_GUARD =
  `(function(){try{var K=${JSON.stringify(THEME_KEY)},C=${JSON.stringify(THEME_SWITCHING_CLASS)},w=window,r=document.documentElement,m=null;` +
  `var s=function(){try{var v=w.localStorage.getItem(K);return v==="light"||v==="dark"?v:null}catch(e){return null}};` +
  `var a=function(){try{var n=s()||(m&&m.matches?"dark":"light"),o=r.dataset.theme;if(o===n)return;r.dataset.theme=n;` +
  `if(o)try{r.classList.add(C);w.setTimeout(function(){r.classList.remove(C)},100)}catch(e){}}catch(e){}};` +
  `try{m=w.matchMedia(${JSON.stringify(DARK_QUERY)})}catch(e){}` +
  `a();` +
  `try{var c=function(){if(!s())a()};m&&(m.addEventListener?m.addEventListener("change",c):m.addListener(c))}catch(e){}` +
  `try{w.addEventListener("storage",function(e){if(!e.key||e.key===K)a()})}catch(e){}` +
  `try{w.addEventListener("pageshow",function(e){if(e.persisted)a()})}catch(e){}` +
  `}catch(e){}})()`;

/** The theme on the page now (the `data-theme` of <html>); light where there is no page (the server). */
export function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** What the system prefers now; light when the browser cannot tell. */
function systemTheme(): Theme {
  try {
    return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

// The latest switch: only it may lift the class that holds the transitions (two quick switches must not release it early).
let switching = 0;

/** Holds every transition while `change` repaints the page, and lifts the hold after two frames (the new colours are painted by then). */
function withoutTransitions(root: HTMLElement, change: () => void): void {
  const mine = ++switching;
  root.classList.add(THEME_SWITCHING_CLASS);
  change();
  const lift = () => {
    if (mine === switching) root.classList.remove(THEME_SWITCHING_CLASS);
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(lift));
  else lift();
}

/**
 * Chooses the theme: keeps the choice in this browser (or forgets it when `next` is the system's own preference, so the
 * site follows the system again) and shows it at once without animating half-way. A blocked storage only means the choice
 * lasts until the page is closed.
 */
export function setTheme(next: Theme): void {
  if (typeof document === "undefined") return;
  try {
    if (next === systemTheme()) window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage is blocked (a private window, site data off): the page still switches.
  }
  const root = document.documentElement;
  if (root.dataset.theme === next) return;
  withoutTransitions(root, () => {
    root.dataset.theme = next;
  });
}

/** Switches to the other theme (what the toggle does on a click). */
export function toggleTheme(): void {
  setTheme(readTheme() === "dark" ? "light" : "dark");
}

/**
 * Calls `callback` whenever `data-theme` of <html> changes (the toggle here, the guard following the system, another tab).
 * The `subscribe` of `useSyncExternalStore`; returns its removal. A no-op where there is no page.
 */
export function subscribeTheme(callback: () => void): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => undefined;
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
  return () => observer.disconnect();
}
