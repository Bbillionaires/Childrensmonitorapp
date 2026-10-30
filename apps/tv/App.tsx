import { useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LoginScreen } from "./src/screens/LoginScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import type { SampleVideo } from "./src/sample-data";

/**
 * Same hand-rolled screen-switching approach as apps/mobile/App.tsx, for the same reason: this
 * is a scaffold, and every dependency here is unverified in this environment (no Apple
 * TV/Android TV simulator). react-native-tvos's own TVFocusGuideView/focus props (see
 * src/screens/*) are the only TV-specific API surface used, since that's the actual mechanism
 * being scaffolded — remote D-pad focus — not screen transitions.
 */
type Screen = { name: "login" } | { name: "library" } | { name: "player"; video: SampleVideo };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "login" });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {screen.name === "login" && (
        <LoginScreen onSignedIn={() => setScreen({ name: "library" })} />
      )}
      {screen.name === "library" && (
        <LibraryScreen onSelectVideo={(video) => setScreen({ name: "player", video })} />
      )}
      {screen.name === "player" && (
        <PlayerScreen video={screen.video} onBack={() => setScreen({ name: "library" })} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
});
