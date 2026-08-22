import { useEffect, useState } from 'preact/hooks';
import { Board } from '../board/Board';
import type { Snapshot } from '../engine/types';
import { MetricStrip } from './MetricStrip';
import { getLastDrill } from './replayStore';
import { go } from './router';

type Metric = 'material' | 'kingSafety' | 'development' | 'centerControl';

const TRACKS: { key: Metric; label: string }[] = [
  { key: 'material', label: 'material' },
  { key: 'kingSafety', label: 'king' },
  { key: 'development', label: 'develop' },
  { key: 'centerControl', label: 'centre' },
];

export function ReplayPage() {
  const state = getLastDrill();
  const [at, setAt] = useState(() => state?.failedAtPly ?? 0);
  const [playing, setPlaying] = useState(false);

  // Auto-play walks the game back at reading speed. It stops at the end rather
  // than looping, because the point is to arrive somewhere, not to animate.
  useEffect(() => {
    if (!playing || !state) return;
    const last = state.journal.length - 1;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setAt((i) => Math.min(last, i + 1)), 1100);
    return () => clearTimeout(timer);
  }, [playing, at, state]);

  if (!state || state.journal.length === 0) {
    return (
      <div class="screen">
        <p class="lede">Nothing to replay. Play a drill first.</p>
        <button type="button" onClick={() => go('#/')}>
          Home
        </button>
      </div>
    );
  }

  const plies = state.journal;
  const current = plies[Math.min(at, plies.length - 1)]!;
  const divergence = state.failedAtPly;
  const worst = worstTrack(plies, divergence);

  return (
    <div class="screen">
      <header class="app-header">
        <button type="button" class="back" onClick={() => go(`#/e/${state.pattern.id}`)}>
          ‹ Back
        </button>
        <h1>Replay</h1>
      </header>

      <p class="lede">
        {divergence !== null
          ? `Your game, one move at a time. It is parked on move ${moveNumber(divergence)} — the move it went wrong.`
          : 'Your game, one move at a time.'}
      </p>

      <Board
        fen={current.fenAfter}
        orientation={state.drill.playAs}
        lastMove={[current.from, current.to]}
        interactive={false}
        onMove={() => {}}
      />

      {/* A single ply has nothing to chart, and an empty sparkline reads as broken. */}
      {plies.length > 1 && (
      <div class="tracks">
        {TRACKS.map((track) => (
          <Track
            key={track.key}
            label={track.label}
            values={plies.map((p) => p.snapshot[track.key])}
            at={at}
            alert={track.key === worst}
          />
        ))}
      </div>
      )}

      <div class="ply-strip">
        {plies.map((ply, i) => (
          <button
            key={i}
            type="button"
            class={`ply ${ply.by} ${i === at ? 'here' : ''} ${i === divergence ? 'diverged' : ''}`}
            onClick={() => {
              setPlaying(false);
              setAt(i);
            }}
          >
            {ply.san}
          </button>
        ))}
      </div>

      <div class={`feedback ${at === divergence ? 'bad' : 'info'}`}>
        <p class="headline">
          {current.by === 'you' ? 'You played' : 'They played'} {current.san}
          {at === divergence ? ' — this is the move.' : ''}
        </p>
        {current.note && <p class="detail">{current.note}</p>}
        {at === divergence && state.feedback?.detail && state.feedback.detail !== current.note && (
          <p class="detail">{state.feedback.detail}</p>
        )}
      </div>

      <MetricStrip view={current.snapshot} />

      <div class="controls">
        <button
          type="button"
          disabled={at === 0}
          onClick={() => {
            setPlaying(false);
            setAt(Math.max(0, at - 1));
          }}
        >
          ‹ Prev
        </button>
        <button
          type="button"
          disabled={plies.length < 2}
          onClick={() => {
            if (!playing && at >= plies.length - 1) setAt(0);
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          disabled={at >= plies.length - 1}
          onClick={() => {
            setPlaying(false);
            setAt(Math.min(plies.length - 1, at + 1));
          }}
        >
          Next ›
        </button>
      </div>

      <div class="controls">
        <button
          type="button"
          class="primary"
          onClick={() => go(`#/drill/${state.pattern.id}/${state.drill.id}`)}
        >
          Try it again
        </button>
      </div>
    </div>
  );
}

const moveNumber = (plyIndex: number): number => Math.floor(plyIndex / 2) + 1;

/**
 * Which measurement the mistake cost you most.
 *
 * Compared against the end of the journal rather than the next ply, because the
 * damage usually lands during the refutation — at the moment of the mistake itself
 * the position often still looks fine, which is exactly why it was tempting.
 */
function worstTrack(plies: { snapshot: Snapshot }[], divergence: number | null): Metric | null {
  if (divergence === null || plies.length < 2) return null;
  const before = plies[Math.max(divergence - 1, 0)]!.snapshot;
  const after = plies[plies.length - 1]!.snapshot;
  let worst: Metric | null = null;
  let drop = 0;
  for (const { key } of TRACKS) {
    const delta = (after[key] as number) - (before[key] as number);
    const scaled = key === 'material' ? delta / 100 : delta;
    if (scaled < drop) {
      drop = scaled;
      worst = key;
    }
  }
  return worst;
}

function Track({
  label,
  values,
  at,
  alert,
}: {
  label: string;
  values: number[];
  at: number;
  alert: boolean;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const height = 26;
  const width = Math.max(values.length * 8, 40);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const cursorX = (at / Math.max(values.length - 1, 1)) * width;

  return (
    <div class={`track ${alert ? 'alert' : ''}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <polyline points={points} fill="none" stroke="currentColor" stroke-width="1.6" />
        <line x1={cursorX} y1="0" x2={cursorX} y2={height} stroke="currentColor" stroke-width="0.8" opacity="0.45" />
      </svg>
      <span class="track-label">{label}</span>
    </div>
  );
}
