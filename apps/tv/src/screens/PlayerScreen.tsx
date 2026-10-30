import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { SampleVideo } from "../sample-data";

function toEmbedUrl(watchUrl: string): string {
  const videoId = new URL(watchUrl).searchParams.get("v");
  return videoId ? `https://www.youtube.com/embed/${videoId}` : watchUrl;
}

/**
 * Same "embed via official URL, no native SDK" approach as apps/mobile's PlayerScreen and
 * apps/web's /tv player — see their doc comments. No progress reporting; no backend here.
 */
export function PlayerScreen({ video, onBack }: { video: SampleVideo; onBack: () => void }) {
  const [backFocused, setBackFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={2}>
        {video.title}
      </Text>
      <View style={styles.playerFrame}>
        <WebView source={{ uri: toEmbedUrl(video.sourceUrl) }} allowsFullscreenVideo />
      </View>
      <Pressable
        hasTVPreferredFocus
        onFocus={() => setBackFocused(true)}
        onBlur={() => setBackFocused(false)}
        onPress={onBack}
        style={[styles.button, backFocused && styles.buttonFocused]}
      >
        <Text style={styles.buttonText}>Back to Library</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 48 },
  title: { fontSize: 26, fontWeight: "700", color: "#f8fafc", marginBottom: 24 },
  playerFrame: {
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000000",
    marginBottom: 24,
  },
  button: {
    alignSelf: "flex-start",
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: "#1e293b",
  },
  buttonFocused: { borderColor: "#3b5fe0", backgroundColor: "#1e3a8a" },
  buttonText: { fontWeight: "700", color: "#f8fafc", fontSize: 18 },
});
