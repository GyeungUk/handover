'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { locateToday, noToday, seedTeams, type Team, type Today } from '../org-data';

/* ==========================================================================
   Workspace context
   --------------------------------------------------------------------------
   The org chart and the "today" marker, shared by every view. Both used to be
   declared inside `WorkspaceClient`, which meant nothing else could be split
   out of that file without dragging the whole component along.
   ========================================================================== */

export const TodayContext = createContext<Today>(noToday);
export const useToday = () => useContext(TodayContext);

export const OrgContext = createContext<Team[]>(seedTeams);
export const useTeams = () => useContext(OrgContext);

/* The marker resolves on the client only, so the server and client first paint
   match — a date read during render would differ between the two. */
let clientToday: Today | null = null;
const subscribeToday = () => () => {};
const readToday = () => (clientToday ??= locateToday(new Date()));
const readServerToday = () => noToday;

export const useResolvedToday = () => useSyncExternalStore(subscribeToday, readToday, readServerToday);

/**
 * The header has no surface of its own over the landing wash; it grows one the
 * moment the page scrolls under it. A passive listener is enough — the class
 * flips, nothing animates per frame.
 */
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const read = () => setScrolled(window.scrollY > threshold);
    read();
    window.addEventListener('scroll', read, { passive: true });
    return () => window.removeEventListener('scroll', read);
  }, [threshold]);
  return scrolled;
}

/**
 * Blocks rise into place once, as they are reached.
 *
 * The classes come off again the moment the rise finishes: a card carries its
 * own hover transition, and leaving the reveal transition on it would make that
 * hover crawl. `will-change` coming off with them matters more — it pins a
 * compositor layer per element for as long as it is set.
 *
 * Anyone who asked for less motion gets none of this.
 */
export function useReveal(deps: unknown[] = []) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.reveal'));
    if (nodes.length === 0) return;
    const settled = (node: Element) => node.classList.remove('reveal', 'is-revealed');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach(settled);
      return;
    }
    const rise = (node: Element) => {
      observer.unobserve(node);
      const finish = (event: Event) => {
        if ((event as TransitionEvent).propertyName !== 'opacity') return;
        node.removeEventListener('transitionend', finish);
        settled(node);
      };
      node.addEventListener('transitionend', finish);
      node.classList.add('is-revealed');
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) rise(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    nodes.forEach((node) => observer.observe(node));

    /* A block waiting to rise is a block at `opacity: 0`, so anything that stops
       the observer from reporting — a tab opened in the background, a print, a
       capture — leaves the section blank rather than un-animated. This is the
       floor under that: whatever is on screen after a beat is shown, observer or
       no observer, and the rest still rises as it is reached. */
    const fallback = window.setTimeout(() => {
      nodes.forEach((node) => {
        if (node.classList.contains('is-revealed')) return;
        if (node.getBoundingClientRect().top < window.innerHeight) rise(node);
      });
    }, 1200);

    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
