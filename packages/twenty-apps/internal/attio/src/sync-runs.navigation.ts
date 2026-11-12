import {
  defineNavigationMenuItem,
  NavigationMenuItemType,
} from 'twenty-sdk/define';
import { IDENTIFIERS } from './identifiers';

export default defineNavigationMenuItem({
  universalIdentifier: IDENTIFIERS.navigation,
  name: 'Attio sync runs',
  type: NavigationMenuItemType.VIEW,
  viewUniversalIdentifier: IDENTIFIERS.view,
  icon: 'IconTerminal',
  color: 'blue',
  position: 10,
});
