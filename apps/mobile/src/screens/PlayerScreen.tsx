import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";
import type { SampleVideo } from "../sample-data";

function toEmbedUrl(watchUrl: string): string {
  const videoId = new URL(watchUrl).searchParams.get("v");
  return videoId ? `https://www.youtube.com/embed/${videoId}` : watchUrl;
}

/**
 * Embeds a YouTube URL in a WebView rather than integrating a native YouTube player SDK —
 * same "official APIs only, simplest working option" approach as apps/web's iframe embed
 * (apps/web/src/app/child/play/[contentId]/page.tsx). No progress reporting back to a server
 * here since this screen has no backend to report to — see README.md.
 */
export function PlayerScreen({ video, onBack }: { video: SampleVideo; onBack: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={2}>
        {video.title}
      </Text>
      <View style={styles.playerFrame}>
        <WebView source={{ uri: toEmbedUrl(video.sourceUrl) }} allowsFullscreenVideo />
      </View>
      <TouchableOpacity style={styles.button} onPress={onBack}>
        <Text style={styles.buttonText}>Back to Library</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 16, fontWeight: "700", color: "#1e293b", marginBottom: 12 },
  playerFrame: {
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000000",
    marginBottom: 16,
  },
  button: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonText: { fontWeight: "600", color: "#334155" },
});
