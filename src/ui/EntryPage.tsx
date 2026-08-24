import { useState } from 'preact/hooks';
import { Board } from '../board/Board';
import { byId, positionAfter } from '../content';
import {
  blurbOf,
  titleOf,
  type Article,
  type Pattern,
  type Recognition,
  type Reference,
  type Spot,
} from '../content/types';
import type { Square } from '../engine/types';
import { markRead, read } from '../store/progress';
import { Prose } from './Prose';
import { go } from './router';

export function EntryPage({ id }: { id: string }) {
  const entry = byId.get(id);
  if (!entry) {
    return (
      <div class="screen">
        <p class="lede">Nothing here by that name.</p>
        <button type="button" onClick={() => go('#/')}>
          Home
        </button>
      </div>
    );
  }
  if (entry.kind === 'article') return <ArticleView article={entry} />;
  if (entry.kind === 'reference') return <ReferenceView reference={entry} />;
  return <PatternView pattern={entry} />;
}

/** Back to the map, not up a hierarchy — there is only one level now. */
function Header({ title, tag }: { title: string; tag?: string }) {
  return (
    <header class="app-header">
      <button type="button" class="back" onClick={() => go('#/')}>
        ‹ Home
      </button>
      <h1>{title}</h1>
      {tag && <span class="mode">{tag}</span>}
    </header>
  );
}

function Related({ ids, heading }: { ids?: string[]; heading: string }) {
  const targets = (ids ?? []).map((id) => byId.get(id)).filter(Boolean);
  if (targets.length === 0) return null;
  return (
    <section>
      <h2 class="section">{heading}</h2>
      {targets.map((target) => (
        <button key={target!.id} type="button" class="row" onClick={() => go(`#/e/${target!.id}`)}>
          <span class="row-main">
            <strong>{titleOf(target!)}</strong>
            <small>{blurbOf(target!)}</small>
          </span>
          <span class={`row-tag ${target!.kind}`}>
            {target!.kind === 'article' ? 'read' : target!.kind === 'reference' ? 'term' : 'drill'}
          </span>
        </button>
      ))}
    </section>
  );
}

function ArticleView({ article }: { article: Article }) {
  const alreadyRead = read().read.includes(article.id);
  const [done, setDone] = useState(alreadyRead);
  const drills = (article.related ?? [])
    .map((id) => byId.get(id))
    .filter((e): e is Pattern => e?.kind === 'pattern');

  return (
    <div class="screen">
      <Header title={article.title} tag="article" />
      <p class="lede">{article.summary}</p>

      {/* Anything playable goes at the top. Burying it under the prose was the whole
          complaint: you had to read to the bottom to find out you could practise. */}
      {drills.length > 0 && (
        <div class="practise-block">
          <h2 class="section">Practise this</h2>
          <div class="drill-actions">
            {drills.map((pattern) => {
              const first = pattern.drills.find((d) => d.mode === 'learn') ?? pattern.drills[0]!;
              return (
                <button
                  key={pattern.id}
                  type="button"
                  class="primary"
                  onClick={() => go(`#/drill/${pattern.id}/${first.id}`)}
                >
                  {pattern.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {article.sections.map((section) => (
        <section key={section.heading} class="prose">
          <h2>{section.heading}</h2>
          <Prose text={section.body} />
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

      <Related
        ids={(article.related ?? []).filter((id) => byId.get(id)?.kind !== 'pattern')}
        heading="See also"
      />

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

function ReferenceView({ reference }: { reference: Reference }) {
  return (
    <div class="screen">
      <Header title={reference.term} tag="reference" />
      <p class="lede">{reference.short}</p>

      {reference.diagram && (
        <figure>
          <Board
            fen={positionAfter(reference.diagram.at)}
            orientation="white"
            highlight={reference.diagram.highlight ?? []}
            interactive={false}
            onMove={() => {}}
          />
          <figcaption>{reference.diagram.caption}</figcaption>
        </figure>
      )}

      <section class="prose">
        {reference.body.map((paragraph, i) => (
          <Prose key={i} text={paragraph} />
        ))}
      </section>

      <Related ids={reference.seeAlso} heading="See also" />
    </div>
  );
}

function PatternView({ pattern }: { pattern: Pattern }) {
  const [cue, setCue] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const own = pattern.drills.filter((d) => d.playAs === pattern.side);
  const other = pattern.drills.filter((d) => d.playAs !== pattern.side);
  const theirSide = pattern.side === 'white' ? 'Black' : 'White';

  // The lesson's own explanation, trimmed. The long form lives in the article it
  // links to, and repeating it here in full was making the two feel duplicative.
  const firstStop = pattern.idea.indexOf('. ');
  const opener = firstStop > 0 ? pattern.idea.slice(0, firstStop + 1) : pattern.idea;

  return (
    <div class="screen">
      <Header title={pattern.title} tag="drill" />

      <Board
        fen={positionAfter(pattern.setup)}
        orientation={pattern.side}
        highlight={
          cue === null
            ? pattern.cues.flatMap((c) => c.squares ?? []).slice(0, 4)
            : (pattern.cues[cue]?.squares ?? [])
        }
        interactive={false}
        onMove={() => {}}
      />
      <p class="caption">
        Where you start, seen from {pattern.side === 'white' ? 'White' : 'Black'}'s side.
      </p>

      <div class="practise-block">
        <div class="drill-actions">
          {own.map((drill) => (
            <button
              key={drill.id}
              type="button"
              class={drill.mode === 'learn' ? 'primary' : ''}
              onClick={() => go(`#/drill/${pattern.id}/${drill.id}`)}
            >
              {drill.label}
            </button>
          ))}
        </div>
        {other.length > 0 && (
          <>
            <p class="blurb">
              Or play {theirSide} — the fastest way to learn to defend something is to run it
              yourself.
            </p>
            <div class="drill-actions">
              {other.map((drill) => (
                <button
                  key={drill.id}
                  type="button"
                  onClick={() => go(`#/drill/${pattern.id}/${drill.id}`)}
                >
                  {drill.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <section class="prose">
        <h2>The idea</h2>
        <Prose text={full ? pattern.idea : opener} />
        {!full && pattern.idea.length > opener.length && (
          <button type="button" class="link" onClick={() => setFull(true)}>
            Read the rest →
          </button>
        )}
      </section>

      <section class="prose">
        <h2>How to recognise it</h2>
        <p class="blurb">Tap a cue to light up the squares it is talking about.</p>
        <div class="cue-list">
          {pattern.cues.map((entry, i) => (
            <button
              key={entry.text}
              type="button"
              class={`cue ${cue === i ? 'active' : ''}`}
              onClick={() => setCue(cue === i ? null : i)}
            >
              {entry.text}
            </button>
          ))}
        </div>
      </section>

      {pattern.spot && <SpotChallenge spot={pattern.spot} side={pattern.side} />}
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

      <Related ids={pattern.related} heading="Read alongside" />
    </div>
  );
}

function SpotChallenge({ spot, side }: { spot: Spot; side: 'white' | 'black' }) {
  const [tapped, setTapped] = useState<Square[]>([]);
  const found = tapped.filter((sq) => spot.squares.includes(sq));
  const missed = tapped.filter((sq) => !spot.squares.includes(sq));
  const solved = spot.squares.every((sq) => found.includes(sq));

  return (
    <section class="prose quiz">
      <h2>Spot it on the board</h2>
      <p class="prompt">{spot.prompt}</p>
      <Board
        fen={positionAfter(spot.at)}
        orientation={side}
        interactive={false}
        onMove={() => {}}
        onSquareSelect={(square) => {
          if (solved) return;
          setTapped((prev) => (prev.includes(square) ? prev : [...prev, square]));
        }}
        correct={found}
        wrong={solved ? [] : missed}
      />
      {solved ? (
        <p class="verdict right">
          <strong>Found it. </strong>
          <Prose as="span" text={spot.why} />
        </p>
      ) : missed.length > 0 ? (
        <p class="verdict wrong">
          Not that one. {spot.squares.length > 1 ? 'There is more than one square.' : 'Keep looking.'}
        </p>
      ) : (
        <p class="blurb">Tap the square on the board.</p>
      )}
      {(solved || missed.length > 0) && (
        <button type="button" onClick={() => setTapped([])}>
          Reset
        </button>
      )}
    </section>
  );
}

function RecognitionQuiz({ quiz }: { quiz: Recognition }) {
  const [picked, setPicked] = useState<number | null>(null);
  const chosen = picked === null ? null : quiz.choices[picked]!;

  return (
    <section class="prose quiz">
      <h2>Can you see it?</h2>
      <Board fen={positionAfter(quiz.at)} orientation="white" interactive={false} onMove={() => {}} />
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
          <Prose as="span" text={chosen.why} />
        </p>
      )}
    </section>
  );
}
