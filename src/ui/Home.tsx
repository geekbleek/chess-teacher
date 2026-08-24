import { useState } from 'preact/hooks';
import { articles, patterns, references } from '../content';
import { TIER_BLURBS, TIER_NAMES, type Pattern } from '../content/types';
import { due, mastery, read } from '../store/progress';
import { go } from './router';

/**
 * The whole map, on one screen.
 *
 * The previous version made you go Home to Library to an article, then scroll to the
 * bottom to find anything playable. Everything now lives here, grouped by stage, and a
 * drill opens its options in place rather than behind another page.
 */
const jumpTo = (id: string): void => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export function Home() {
  const progress = read();
  const ids = patterns.map((p) => p.id);
  const dueNow = due(ids);
  const [open, setOpen] = useState<string | null>(null);

  const startNext = () => {
    const next = dueNow[0] ?? ids[0];
    const pattern = patterns.find((p) => p.id === next)!;
    const first = pattern.drills.find((d) => d.mode === 'learn') ?? pattern.drills[0]!;
    go(`#/drill/${pattern.id}/${first.id}`);
  };

  return (
    <div class="screen">
      <header class="app-header">
        <h1>Chess Teacher</h1>
        <button type="button" class="back" onClick={() => go('#/free')}>
          Free play
        </button>
      </header>

      {/* One tap to any stage. The map is long by design — it is everything — so it
          needs a way to skip down it. */}
      <nav class="jump">
        {[0, 1, 2, 3].map((tier) => (
          <button key={tier} type="button" class="jump-chip" onClick={() => jumpTo(`stage-${tier}`)}>
            {tier} {TIER_NAMES[tier]}
          </button>
        ))}
        <button type="button" class="jump-chip" onClick={() => jumpTo('reference')}>
          Reference
        </button>
      </nav>

      <button type="button" class="primary big" onClick={startNext}>
        <span>{dueNow.length > 0 ? `Practise — ${dueNow.length} due` : 'Practise'}</span>
        <small>
          {dueNow.length > 0
            ? 'Drills you have not met yet, or that are due for review'
            : 'Nothing due. Run one anyway if you like.'}
        </small>
      </button>

      {[0, 1, 2, 3].map((tier) => {
        const reads = articles.filter((a) => a.tier === tier);
        const drills = patterns.filter((p) => p.tier === tier);
        if (reads.length + drills.length === 0) return null;
        return (
          <section key={tier} id={`stage-${tier}`}>
            <h2 class="section">
              {tier} · {TIER_NAMES[tier]}
            </h2>
            <p class="blurb">{TIER_BLURBS[tier]}</p>

            {reads.map((article) => (
              <button
                key={article.id}
                type="button"
                class="row"
                onClick={() => go(`#/e/${article.id}`)}
              >
                <span class="row-main">
                  <strong>{article.title}</strong>
                  <small>{article.summary}</small>
                </span>
                <span class="row-tag read">read</span>
              </button>
            ))}

            {drills.map((pattern) => (
              <DrillRow
                key={pattern.id}
                pattern={pattern}
                mastery={mastery(progress, pattern.id)}
                expanded={open === pattern.id}
                onToggle={() => setOpen(open === pattern.id ? null : pattern.id)}
              />
            ))}
          </section>
        );
      })}

      <section id="reference">
        <h2 class="section">Reference</h2>
        <p class="blurb">
          Short entries on one idea each. Articles and drills link to them as they come up.
        </p>
        <div class="term-cloud">
          {references.map((reference) => (
            <button
              key={reference.id}
              type="button"
              class="term"
              onClick={() => go(`#/r/${reference.id}`)}
            >
              {reference.term}
            </button>
          ))}
        </div>
      </section>

      <p class="build">build {__BUILD__}</p>
    </div>
  );
}

function DrillRow({
  pattern,
  mastery,
  expanded,
  onToggle,
}: {
  pattern: Pattern;
  mastery: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const own = pattern.drills.filter((d) => d.playAs === pattern.side);
  const other = pattern.drills.filter((d) => d.playAs !== pattern.side);

  return (
    <div class={`drill-row ${expanded ? 'open' : ''}`}>
      <button type="button" class="row" onClick={onToggle} aria-expanded={expanded}>
        <span class="row-main">
          <strong>{pattern.title}</strong>
          <small>{pattern.cues[0]?.text}</small>
        </span>
        <span class={`row-tag ${mastery}`}>{mastery}</span>
      </button>

      {expanded && (
        <div class="drill-actions">
          {[...own, ...other].map((drill) => (
            <button
              key={drill.id}
              type="button"
              class={drill.mode === 'learn' ? 'primary' : ''}
              onClick={() => go(`#/drill/${pattern.id}/${drill.id}`)}
            >
              {drill.label}
            </button>
          ))}
          <button type="button" class="link" onClick={() => go(`#/e/${pattern.id}`)}>
            What this teaches →
          </button>
        </div>
      )}
    </div>
  );
}
