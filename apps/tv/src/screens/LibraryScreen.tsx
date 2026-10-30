import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TVFocusGuideView, View } from "react-native";
import { SAMPLE_LIBRARY, type SampleVideo } from "../sample-data";

/**
 * `TVFocusGuideView` is react-native-tvos's real primitive for grouping focusable elements so
 * the platform's native D-pad focus engine moves between them sensibly — the native-app
 * equivalent of apps/web's useTvSpatialNav hook (apps/web/src/lib/tv-nav.ts), which reimplements
 * the same idea in plain DOM/keyboard terms because a web page has no native focus engine to
 * delegate to. Static sample data, no API call — see README.md.
 */
function Card({ video, focused, onFocus, onBlur, onPress }: {
  video: SampleVideo;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
}) {
  return (
    <Pressable
      onFocus={onFocus}
      onBlur={onBlur}
      onPress={onPress}
      style={[styles.card, focused && styles.cardFocused]}
    >
      <View style={styles.thumbnail} />
      <Text style={styles.cardTitle} numberOfLines={2}>
        {video.title}
      </Text>
    </Pressable>
  );
}

export function LibraryScreen({ onSelectVideo }: { onSelectVideo: (video: SampleVideo) => void }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Watch</Text>
      <TVFocusGuideView style={styles.grid} autoFocus>
        <FlatList
          data={SAMPLE_LIBRARY}
          keyExtractor={(item) => item.id}
          numColumns={4}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => (
            <Card
              video={item}
              focused={focusedId === item.id}
              onFocus={() => setFocusedId(item.id)}
              onBlur={() => setFocusedId((id) => (id === item.id ? null : id))}
              onPress={() => onSelectVideo(item)}
            />
          )}
        />
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 48 },
  heading: { fontSize: 28, fontWeight: "700", color: "#f8fafc", marginBottom: 24 },
  grid: { flex: 1 },
  row: { gap: 24, marginBottom: 24 },
  card: {
    flex: 1,
    backgroundColor: "#0f172a",
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "transparent",
    overflow: "hidden",
  },
  cardFocused: { borderColor: "#3b5fe0" },
  thumbnail: { aspectRatio: 16 / 9, backgroundColor: "#1e293b" },
  cardTitle: { padding: 16, fontSize: 18, fontWeight: "600", color: "#f8fafc" },
});
