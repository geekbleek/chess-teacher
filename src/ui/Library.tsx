import { articles, patterns } from '../content';
import { TIER_BLURBS, TIER_NAMES } from '../content/types';
import { mastery, read } from '../store/progress';
import { go } from './router';

export function Library() {
  const progress = read();

  return (
    <div class="screen">
      <header class="app-header">
        <button type="button" class="back" onClick={() => go('#/')}>
          ‹ Back
        </button>
        <h1>Library</h1>
      </header>

      <p class="lede">
        Read the idea, then drill it. Articles explain what a position wants; lessons put you in
        one and judge what you do.
      </p>

      {[0, 1, 2, 3].map((tier) => {
        const inTier = [
          ...articles.filter((a) => a.tier === tier),
          ...patterns.filter((p) => p.tier === tier),
        ];
        if (inTier.length === 0) return null;
        return (
          <section key={tier}>
            <h2 class="section">
              {tier}. {TIER_NAMES[tier]}
            </h2>
            <p class="blurb">{TIER_BLURBS[tier]}</p>
            {inTier.map((entry) => (
              <button key={entry.id} type="button" class="row" onClick={() => go(`#/e/${entry.id}`)}>
                <span class="row-main">
                  <strong>{entry.title}</strong>
                  <small>{entry.kind === 'article' ? entry.summary : entry.cues[0]?.text}</small>
                </span>
                <span class={`row-tag ${entry.kind === 'pattern' ? mastery(progress, entry.id) : 'read'}`}>
                  {entry.kind === 'article'
                    ? progress.read.includes(entry.id)
                      ? 'read'
                      : 'article'
                    : mastery(progress, entry.id)}
                </span>
              </button>
            ))}
          </section>
        );
      })}
    </div>
  );
}
