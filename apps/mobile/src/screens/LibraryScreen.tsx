import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SAMPLE_LIBRARY, type SampleVideo } from "../sample-data";

/**
 * Mirrors apps/web's child library concept (a closed set of parent-approved videos) with
 * static sample data — see README.md. No API call here; the real version would fetch
 * `GET /api/child/library` the way apps/web/src/app/child/page.tsx does.
 */
export function LibraryScreen({
  onSelectVideo,
  onSignOut,
}: {
  onSelectVideo: (video: SampleVideo) => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi, Sam!</Text>
        <TouchableOpacity onPress={onSignOut}>
          <Text style={styles.signOut}>Parent sign-in</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Watch</Text>
      <FlatList
        data={SAMPLE_LIBRARY}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => onSelectVideo(item)}>
            <View style={styles.thumbnail} />
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: { fontSize: 18, fontWeight: "700", color: "#1e293b" },
  signOut: { fontSize: 13, color: "#64748b" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1e293b", marginBottom: 12 },
  list: { paddingBottom: 24 },
  row: { gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  thumbnail: { aspectRatio: 16 / 9, backgroundColor: "#e2e8f0" },
  cardTitle: { padding: 10, fontSize: 13, fontWeight: "600", color: "#1e293b" },
});
