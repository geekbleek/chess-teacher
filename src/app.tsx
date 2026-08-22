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
    case 'entry':
      return <EntryPage id={route.id} />;
    case 'drill':
      return <DrillPage patternId={route.patternId} drillId={route.drillId} />;
    case 'replay':
      return <ReplayPage />;
    case 'freeplay':
      return <FreePlay />;
    default:
      return <Home />;
  }
}
