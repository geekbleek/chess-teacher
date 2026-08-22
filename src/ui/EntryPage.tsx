import { useState } from 'preact/hooks';
import { Board } from '../board/Board';
import { byId, positionAfter } from '../content';
import type { Article, Pattern, Recognition } from '../content/types';
import { markRead, read } from '../store/progress';
import { go } from './router';

export function EntryPage({ id }: { id: string }) {
  const entry = byId.get(id);
  if (!entry) {
    return (
      <div class="screen">
        <p class="lede">That lesson does not exist.</p>
        <button type="button" onClick={() => go('#/library')}>
          Back to the library
        </button>
      </div>
    );
  }
  return entry.kind === 'article' ? <ArticleView article={entry} /> : <PatternView pattern={entry} />;
}

function ArticleView({ article }: { article: Article }) {
  const alreadyRead = read().read.includes(article.id);
  const [done, setDone] = useState(alreadyRead);

  return (
    <div class="screen">
      <header class="app-header">
        <button type="button" class="back" onClick={() => go('#/library')}>
          ‹ Library
        </button>
        <h1>{article.title}</h1>
      </header>
      <p class="lede">{article.summary}</p>

      {article.sections.map((section) => (
        <section key={section.heading} class="prose">
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
          {section.diagram && (
            <figure>
              <Board
                fen={positionAfter(section.diagram.at)}
                orientation="white"
                highlight={section.diagram.highlight ?? []}
                interactive={false}
                onMove={() => {}}
              />
              <figcaption>{section.diagram.caption}</figcaption>
            </figure>
          )}
        </section>
      ))}

      {article.related && article.related.length > 0 && (
        <section>
          <h2 class="section">Next</h2>
          {article.related.map((id) => {
            const target = byId.get(id);
            if (!target) return null;
            return (
              <button key={id} type="button" class="row" onClick={() => go(`#/e/${id}`)}>
                <span class="row-main">
                  <strong>{target.title}</strong>
                  <small>{target.kind === 'article' ? target.summary : target.idea.slice(0, 90) + '…'}</small>
                </span>
                <span class="row-tag">{target.kind}</span>
              </button>
            );
          })}
        </section>
      )}

      <button
        type="button"
        class={done ? '' : 'primary'}
        disabled={done}
        onClick={() => {
          markRead(article.id);
          setDone(true);
        }}
      >
        {done ? 'Marked as read' : 'Mark as read'}
      </button>
    </div>
  );
}

function PatternView({ pattern }: { pattern: Pattern }) {
  const asDefender = pattern.drills.filter((d) => d.playAs === pattern.side);
  const asAttacker = pattern.drills.filter((d) => d.playAs !== pattern.side);
  const theirSide = pattern.side === 'white' ? 'Black' : 'White';

  return (
    <div class="screen">
      <header class="app-header">
        <button type="button" class="back" onClick={() => go('#/library')}>
          ‹ Library
        </button>
        <h1>{pattern.title}</h1>
      </header>

      <Board
        fen={positionAfter(pattern.setup)}
        orientation={pattern.side}
        highlight={pattern.cues.flatMap((c) => c.squares ?? []).slice(0, 4)}
        interactive={false}
        onMove={() => {}}
      />
      <p class="caption">
        The position you will be dropped into, seen from {pattern.side === 'white' ? 'White' : 'Black'}'s
        side.
      </p>

      <section class="prose">
        <h2>The idea</h2>
        <p>{pattern.idea}</p>
      </section>

      <section class="prose">
        <h2>How to recognise it</h2>
        <ul class="cues">
          {pattern.cues.map((cue) => (
            <li key={cue.text}>{cue.text}</li>
          ))}
        </ul>
      </section>

      {pattern.recognition && <RecognitionQuiz quiz={pattern.recognition} />}

      {pattern.plan && pattern.plan.length > 0 && (
        <section class="prose">
          <h2>The plan</h2>
          <ul class="cues">
            {pattern.plan.map((step) => (
              <li key={step.goal}>{step.goal}</li>
            ))}
          </ul>
        </section>
      )}

      <h2 class="section">Play it</h2>
      <p class="blurb">
        Learn gives you feedback after every move and hints on request. Test says nothing until you
        go wrong, then replays the game back to you.
      </p>
      {asDefender.map((drill) => (
        <button
          key={drill.id}
          type="button"
          class="row"
          onClick={() => go(`#/drill/${pattern.id}/${drill.id}`)}
        >
          <span class="row-main">
            <strong>{drill.label}</strong>
            <small>
              Play as {drill.playAs} · {drill.mode}
            </small>
          </span>
          <span class="row-tag">{drill.mode}</span>
        </button>
      ))}

      {asAttacker.length > 0 && (
        <>
          <h2 class="section">From the other side</h2>
          <p class="blurb">
            Play {theirSide} and see the pattern as your opponent sees it. The fastest way to learn to
            defend something is to run it yourself.
          </p>
          {asAttacker.map((drill) => (
            <button
              key={drill.id}
              type="button"
              class="row"
              onClick={() => go(`#/drill/${pattern.id}/${drill.id}`)}
            >
              <span class="row-main">
                <strong>{drill.label}</strong>
                <small>
                  Play as {drill.playAs} · {drill.opponent === 'mistakes' ? 'punish their errors' : drill.mode}
                </small>
              </span>
              <span class="row-tag">{drill.mode}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function RecognitionQuiz({ quiz }: { quiz: Recognition }) {
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked === null ? null : quiz.choices[picked]!;

  return (
    <section class="prose quiz">
      <h2>Can you see it?</h2>
      <Board
        fen={positionAfter(quiz.at)}
        orientation="white"
        interactive={false}
        onMove={() => {}}
      />
      <p class="prompt">{quiz.prompt}</p>
      <div class="choices">
        {quiz.choices.map((choice, i) => (
          <button
            key={choice.text}
            type="button"
            class={`choice ${picked === null ? '' : choice.correct ? 'right' : picked === i ? 'wrong' : 'muted'}`}
            disabled={picked !== null}
            onClick={() => setPicked(i)}
          >
            {choice.text}
          </button>
        ))}
      </div>
      {chosen && (
        <p class={`verdict ${chosen.correct ? 'right' : 'wrong'}`}>
          <strong>{chosen.correct ? 'Right. ' : 'Not quite. '}</strong>
          {chosen.why}
        </p>
      )}
    </section>
  );
}
