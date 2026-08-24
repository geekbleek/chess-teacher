import { useEffect, useState } from 'preact/hooks';

export type Route =
  | { name: 'home' }
  | { name: 'entry'; id: string }
  | { name: 'drill'; patternId: string; drillId: string }
  | { name: 'replay' }
  | { name: 'freeplay' };

export const go = (hash: string): void => {
  window.location.hash = hash;
};

export function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    // Reference entries get their own prefix so they can be linked to from prose
    // without the caller needing to know what kind of entry it is.
    case 'e':
    case 'r':
      return parts[1] ? { name: 'entry', id: parts[1] } : { name: 'home' };
    case 'library':
      return { name: 'home' }; // the library is the home screen now
    case 'drill':
      return parts[1] && parts[2]
        ? { name: 'drill', patternId: parts[1], drillId: parts[2] }
        : { name: 'home' };
    case 'replay':
      return { name: 'replay' };
    case 'free':
      return { name: 'freeplay' };
    default:
      return { name: 'home' };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const update = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return route;
}
