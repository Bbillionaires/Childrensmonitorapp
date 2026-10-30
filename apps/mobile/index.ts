import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App) and works the
// same whether the app loads in Expo Go or a native build.
registerRootComponent(App);
