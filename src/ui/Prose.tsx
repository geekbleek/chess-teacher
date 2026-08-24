import type { ComponentChildren } from 'preact';
import { referenceById } from '../content';
import { go } from './router';

const LINK = /\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g;

/**
 * Prose with inline [[reference]] links.
 *
 * Written so a term can be explained once, in one place, and pointed at from
 * anywhere — rather than every article restating what an outpost is.
 */
export function Prose({ text, as = 'p' }: { text: string; as?: 'p' | 'span' }) {
  const parts: ComponentChildren[] = [];
  let last = 0;
  LINK.lastIndex = 0;

  for (let m = LINK.exec(text); m !== null; m = LINK.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const id = m[1]!.trim();
    const label = m[2]?.trim();
    const reference = referenceById(id);
    parts.push(
      reference ? (
        <button
          key={`${id}-${m.index}`}
          type="button"
          class="ref-link"
          onClick={() => go(`#/r/${id}`)}
        >
          {label ?? lowerFirst(reference.term)}
        </button>
      ) : (
        // Unreachable in practice: CI fails on a link that points at nothing.
        (label ?? id)
      ),
    );
    last = LINK.lastIndex;
  }
  parts.push(text.slice(last));

  return as === 'span' ? <span>{parts}</span> : <p>{parts}</p>;
}

/** "Tempo" reads wrong mid-sentence; "tempo" does. Acronyms keep their case. */
function lowerFirst(term: string): string {
  if (term.length > 1 && term[1] === term[1]?.toUpperCase() && /[A-Z]/.test(term[1]!)) return term;
  return term.charAt(0).toLowerCase() + term.slice(1);
}
