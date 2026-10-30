import { useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LoginScreen } from "./src/screens/LoginScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import type { SampleVideo } from "./src/sample-data";

/**
 * Hand-rolled screen switching instead of a navigation library (React Navigation, etc.) —
 * this is a scaffold, not a shipped app, and every extra dependency here is something nobody
 * has verified actually works (no simulator/device in this environment — see README.md).
 * Keeping the dependency surface to just Expo + react-native-webview makes that gap smaller.
 */
type Screen = { name: "login" } | { name: "library" } | { name: "player"; video: SampleVideo };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "login" });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      {screen.name === "login" && (
        <LoginScreen onSignedIn={() => setScreen({ name: "library" })} />
      )}
      {screen.name === "library" && (
        <LibraryScreen
          onSelectVideo={(video) => setScreen({ name: "player", video })}
          onSignOut={() => setScreen({ name: "login" })}
        />
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
    backgroundColor: "#f8fafc",
  },
});
