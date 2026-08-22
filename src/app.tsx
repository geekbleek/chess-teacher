import { DrillPage } from './ui/DrillPage';
import { EntryPage } from './ui/EntryPage';
import { FreePlay } from './ui/FreePlay';
import { Home } from './ui/Home';
import { Library } from './ui/Library';
import { ReplayPage } from './ui/ReplayPage';
import { useRoute } from './ui/router';

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'library':
      return <Library />;
    // Keys force a remount when the route changes. Without them Preact reuses the
    // component instance and its state, so navigating from one drill to another
    // keeps the previous drill's position on the board.
    case 'entry':
      return <EntryPage key={route.id} id={route.id} />;
    case 'drill':
      return (
        <DrillPage
          key={`${route.patternId}/${route.drillId}`}
          patternId={route.patternId}
          drillId={route.drillId}
        />
      );
    case 'replay':
      return <ReplayPage />;
    case 'freeplay':
      return <FreePlay />;
    default:
      return <Home />;
  }
}
