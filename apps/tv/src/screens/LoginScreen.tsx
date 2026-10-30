import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

/**
 * UI-only stub — does NOT call the real API. Same native-auth gap as apps/mobile (see
 * README.md's "Known gap: native auth" section): cookie sessions don't translate to a native
 * client, and that's a design decision deliberately left open, not made silently here.
 *
 * `hasTVPreferredFocus` is a real react-native-tvos prop: it tells the platform's native focus
 * engine which element should have focus the moment this screen appears, the TV equivalent of
 * apps/web's /tv useTvAutoFocus hook (see apps/web/src/lib/tv-nav.ts) solving the exact same
 * problem — a remote user needs somewhere to land without guessing.
 */
export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [buttonFocused, setButtonFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Family Safety TV</Text>
      <Text style={styles.subtitle}>Parent sign in</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor="#64748b"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#64748b"
        />
      </View>

      <Pressable
        hasTVPreferredFocus
        onFocus={() => setButtonFocused(true)}
        onBlur={() => setButtonFocused(false)}
        onPress={onSignedIn}
        style={[styles.button, buttonFocused && styles.buttonFocused]}
      >
        <Text style={styles.buttonText}>Sign in</Text>
      </Pressable>

      <Text style={styles.notice}>
        This screen is a UI stub — it does not call the real API. See README.md.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", paddingHorizontal: 120 },
  brand: { fontSize: 32, fontWeight: "700", color: "#3b5fe0", textAlign: "center" },
  subtitle: { fontSize: 20, color: "#94a3b8", textAlign: "center", marginBottom: 48 },
  field: { marginBottom: 24 },
  label: { fontSize: 18, fontWeight: "600", color: "#e2e8f0", marginBottom: 8 },
  input: {
    borderWidth: 2,
    borderColor: "#334155",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 20,
    color: "#f8fafc",
    backgroundColor: "#0f172a",
  },
  button: {
    backgroundColor: "#1e293b",
    borderWidth: 3,
    borderColor: "transparent",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 12,
  },
  buttonFocused: { borderColor: "#3b5fe0", backgroundColor: "#1e3a8a" },
  buttonText: { color: "#ffffff", fontWeight: "700", fontSize: 20 },
  notice: { marginTop: 32, fontSize: 14, color: "#64748b", textAlign: "center" },
});
