import { articles, patterns } from '../content';
import { TIER_BLURBS, TIER_NAMES } from '../content/types';
import { due, mastery, read } from '../store/progress';
import { go } from './router';

export function Home() {
  const progress = read();
  const ids = patterns.map((p) => p.id);
  const dueNow = due(ids);
  const solid = ids.filter((id) => mastery(progress, id) === 'solid').length;

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
      </header>

      <button type="button" class="primary big" onClick={startNext}>
        <span>{dueNow.length > 0 ? `Practise — ${dueNow.length} due` : 'Practise'}</span>
        <small>
          {dueNow.length > 0
            ? 'Patterns you have not met yet, or that are due for review'
            : 'Nothing due. Run one anyway if you like.'}
        </small>
      </button>

      <div class="stat-row">
        <div class="stat">
          <span class="value">{patterns.length}</span>
          <span class="label">lessons</span>
        </div>
        <div class="stat">
          <span class="value">{solid}</span>
          <span class="label">solid</span>
        </div>
        <div class="stat">
          <span class="value">{articles.length}</span>
          <span class="label">articles</span>
        </div>
      </div>

      <h2 class="section">Stages</h2>
      {[0, 1, 2, 3].map((tier) => {
        const count = [...articles, ...patterns].filter((e) => e.tier === tier).length;
        return (
          <button key={tier} type="button" class="row" onClick={() => go('#/library')}>
            <span class="row-main">
              <strong>
                {tier}. {TIER_NAMES[tier]}
              </strong>
              <small>{TIER_BLURBS[tier]}</small>
            </span>
            <span class="row-tag">{count}</span>
          </button>
        );
      })}

      <div class="controls">
        <button type="button" onClick={() => go('#/library')}>
          Library
        </button>
        <button type="button" onClick={() => go('#/free')}>
          Free play
        </button>
      </div>
    </div>
  );
}
