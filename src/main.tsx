import { render } from 'preact';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './ui/styles.css';
import { App } from './app';

render(<App />, document.getElementById('root')!);
