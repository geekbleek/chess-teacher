import { useState } from 'preact/hooks';
import type { Snapshot } from '../engine/types';

type Key = 'material' | 'king' | 'develop' | 'centre';

interface Tile {
  key: Key;
  label: string;
  value: string;
  tone: 'good' | 'ok' | 'bad';
  title: string;
  detail: string;
}

const pawns = (centipawns: number): string => {
  if (centipawns === 0) return '=';
  const value = (centipawns / 100).toFixed(Math.abs(centipawns) % 100 === 0 ? 0 : 1);
  return centipawns > 0 ? `+${value}` : value;
};

/** Unsigned magnitude, for talking about how much a loss costs. */
const cost = (centipawns: number): string => {
  const value = Math.abs(centipawns) / 100;
  const text = value.toFixed(value % 1 === 0 ? 0 : 1);
  return `${text} pawn${value === 1 ? '' : 's'}`;
};

const tone = (value: number, bad: number, good: number): Tile['tone'] =>
  value <= bad ? 'bad' : value >= good ? 'good' : 'ok';

function tiles(view: Snapshot): Tile[] {
  const loose = view.hanging[0];
  return [
    {
      key: 'material',
      label: 'material',
      value: pawns(view.material),
      tone: tone(view.material, -50, 50),
      title: 'Material',
      detail:
        (view.material === 0
          ? 'Material is level. '
          : view.material > 0
            ? `You are ${cost(view.material)} up. `
            : `You are ${cost(view.material)} down. `) +
        (loose
          ? `But your ${loose.piece === 'p' ? 'pawn' : 'piece'} on ${loose.square} is loose — taking it wins them about ${cost(loose.loss)}, counting every recapture.`
          : 'Nothing of yours can be profitably captured right now. This is checked by playing out every capture sequence, not by counting defenders.'),
    },
    {
      key: 'king',
      label: 'king',
      value: String(view.kingSafety),
      tone: tone(view.kingSafety, 45, 60),
      title: 'King safety',
      detail:
        '50 means nothing has been decided — your king is still home with the right to castle. ' +
        (view.kingSafety > 60
          ? 'Above 60 means castled with a pawn shield still intact.'
          : view.kingSafety < 45
            ? 'Below 45 means the shield is broken, or you have lost the right to castle without using it, or an enemy rook or queen is aiming down a nearby file.'
            : 'Castle and this goes up; lose the right to castle and it goes down.'),
    },
    {
      key: 'develop',
      label: 'develop',
      value: `${view.development}/5`,
      tone: tone(view.development, 1, 3),
      title: 'Development',
      detail:
        `${view.development} of a possible 5: one point for each knight and bishop off its starting square, plus one when your rooks can see each other. ` +
        (view.development < 4
          ? `${4 - view.development} minor piece${4 - view.development === 1 ? ' is' : 's are'} still at home. Moving an already-developed piece again while that is true is the most common way to lose the opening.`
          : 'Everything is out. Now the question is what your pieces are actually doing.'),
    },
    {
      key: 'centre',
      label: 'centre',
      value: String(view.centerControl),
      tone: tone(view.centerControl, 3, 6),
      title: 'Centre control',
      detail:
        `Your grip on d4, e4, d5 and e5. A pawn sitting on one counts double, a piece counts once, and every attacker of those squares counts once more. Currently ${view.centerControl}. ` +
        'This is comparative, not absolute — what matters is whether it is going up or down as you move.',
    },
  ];
}

export function MetricStrip({ view }: { view: Snapshot }) {
  const [open, setOpen] = useState<Key | null>(null);
  const list = tiles(view);
  const expanded = list.find((t) => t.key === open);

  return (
    <div class="metric-block">
      <div class="metrics">
        {list.map((tile) => (
          <button
            key={tile.key}
            type="button"
            class={`metric ${tile.tone} ${open === tile.key ? 'open' : ''}`}
            onClick={() => setOpen(open === tile.key ? null : tile.key)}
            aria-expanded={open === tile.key}
          >
            <span class="value">{tile.value}</span>
            <span class="label">{tile.label}</span>
          </button>
        ))}
      </div>
      {expanded && (
        <div class="metric-detail">
          <strong>{expanded.title}</strong>
          <p>{expanded.detail}</p>
        </div>
      )}
    </div>
  );
}
