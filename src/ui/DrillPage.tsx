import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Board } from '../board/Board';
import { patternById } from '../content';
import {
  bestMove,
  createDrill,
  hint,
  nodeAt,
  opponentMove,
  playerMove,
  rewind,
  takeHint,
  terminalSummary,
  theirTurn,
  yourTurn,
  type DrillState,
} from '../modes/drill';
import { snapshot } from '../engine/referee';
import type { Square } from '../engine/types';
import { grade } from '../store/progress';
import { MetricStrip } from './MetricStrip';
import { go } from './router';
import { setLastDrill } from './replayStore';

export function DrillPage({ patternId, drillId }: { patternId: string; drillId: string }) {
  const pattern = patternById(patternId);
  const drill = pattern?.drills.find((d) => d.id === drillId);

  if (!pattern || !drill) {
    return (
      <div class="screen">
        <p class="lede">That drill does not exist.</p>
        <button type="button" onClick={() => go('#/')}>
          Home
        </button>
      </div>
    );
  }

  const [state, setState] = useState<DrillState>(() => createDrill(pattern, drill));
  const [shownHint, setShownHint] = useState<string | null>(null);
  const [usedReveal, setUsedReveal] = useState(false);
  const graded = useRef(false);

  // The app answers after a beat, so your move paints before theirs lands.
  useEffect(() => {
    if (!theirTurn(state)) return;
    const timer = setTimeout(() => setState((s) => (theirTurn(s) ? opponentMove(s) : s)), 420);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state.status === 'playing' || graded.current) return;
    graded.current = true;
    grade(pattern.id, state.status === 'passed' && !usedReveal);
    setLastDrill(state);
  }, [state.status]);

  const isLearn = drill.mode === 'learn';
  const node = nodeAt(state);
  const view = useMemo(() => snapshot(state.fen, state.you), [state.fen, state.you]);
  // In Learn mode the board points at what needs attention: the lesson's focus
  // squares, plus anything of yours that is actually hanging. Test mode shows nothing.
  const focus: Square[] =
    isLearn && yourTurn(state)
      ? [...(node?.focusSquares ?? []), ...view.hanging.map((h) => h.square)]
      : [];
  const last = state.journal[state.journal.length - 1];

  const restart = () => {
    graded.current = false;
    setUsedReveal(false);
    setShownHint(null);
    setState(createDrill(pattern, drill));
  };

  const askHint = () => {
    const next = hint(state);
    if (!next) return;
    setShownHint(next.text);
    if (next.exhausted && next.text.startsWith('The move is')) setUsedReveal(true);
    setState(takeHint(state));
  };

  return (
    <div class="screen drill">
      <header class="app-header">
        <button type="button" class="back" onClick={() => go(`#/e/${pattern.id}`)}>
          ‹ Back
        </button>
        <h1>{pattern.title}</h1>
        <span class="mode">{drill.mode}</span>
      </header>

      <Board
        fen={state.fen}
        orientation={drill.playAs}
        highlight={focus}
        lastMove={last ? [last.from, last.to] : undefined}
        interactive={yourTurn(state)}
        onMove={(san) => {
          setShownHint(null);
          setState((s) => playerMove(s, san));
        }}
      />

      {isLearn && <MetricStrip view={view} />}

      <div class={`feedback ${state.feedback?.tone ?? 'info'}`}>
        {state.status === 'playing' && isLearn && node?.threat && yourTurn(state) && !state.feedback && (
          <p class="threat">{node.threat}</p>
        )}

        {state.feedback && (
          <>
            <p class="headline">{state.feedback.headline}</p>
            {state.feedback.detail && <p class="detail">{state.feedback.detail}</p>}
            {state.feedback.playedOut && (
              <p class="line">Played out: {state.feedback.playedOut.join(' ')}</p>
            )}
            {state.feedback.findings?.map((f) => (
              <p key={f.code} class={`finding ${f.severity}`}>
                {f.text}
              </p>
            ))}
          </>
        )}

        {!state.feedback && state.status === 'playing' && !isLearn && (
          <p class="detail">No commentary until something goes wrong. Play it as if it were a game.</p>
        )}

        {shownHint && <p class="hint">{shownHint}</p>}

        {state.status !== 'playing' && (
          <>
            <p class="headline">{state.status === 'passed' ? 'Passed.' : 'Stopped.'}</p>
            {terminalSummary(state) && <p class="detail">{terminalSummary(state)}</p>}
            {usedReveal && state.status === 'passed' && (
              <p class="detail">You used the reveal, so this one is scheduled to come back tomorrow.</p>
            )}
          </>
        )}
      </div>

      <div class="controls">
        {state.rewindTo && (
          <button type="button" class="primary" onClick={() => setState(rewind(state))}>
            Try again
          </button>
        )}
        {state.status === 'playing' && isLearn && !state.rewindTo && yourTurn(state) && (
          <button type="button" onClick={askHint}>
            Hint {state.hintLevel > 0 ? `(${state.hintLevel})` : ''}
          </button>
        )}
        {state.status === 'failed' && (
          <button type="button" class="primary" onClick={() => go('#/replay')}>
            Show me where
          </button>
        )}
        {state.status !== 'playing' && (
          <button type="button" onClick={restart}>
            Again
          </button>
        )}
        {state.status !== 'playing' && (
          <button type="button" onClick={() => go(`#/e/${pattern.id}`)}>
            Done
          </button>
        )}
        {state.status === 'playing' && !state.rewindTo && (
          <button type="button" onClick={restart}>
            Restart
          </button>
        )}
      </div>

      {state.status === 'playing' && bestMove(state) === undefined && state.script && (
        <p class="blurb">You are the one attacking now — finish it.</p>
      )}
    </div>
  );
}
