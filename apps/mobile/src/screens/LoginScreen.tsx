import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

/**
 * UI-only stub — does NOT call the real API. apps/web authenticates with HttpOnly cookies
 * (see services/api/src/services/session-cookies.ts), which don't carry over to a React
 * Native app the way they do a browser. Wiring this up for real needs its own explicit design
 * decision (e.g. issuing bearer tokens to native clients alongside the existing cookie
 * sessions) — see README.md's "Known gap: native auth" section. That decision was
 * deliberately not made here.
 */
export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Family Safety</Text>
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
        />
      </View>

      <TouchableOpacity style={styles.button} onPress={onSignedIn}>
        <Text style={styles.buttonText}>Sign in</Text>
      </TouchableOpacity>

      <Text style={styles.notice}>
        This screen is a UI stub — it does not call the real API. See README.md.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  brand: { fontSize: 20, fontWeight: "700", color: "#3b5fe0", textAlign: "center" },
  subtitle: { fontSize: 14, color: "#64748b", textAlign: "center", marginBottom: 32 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#3b5fe0",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#ffffff", fontWeight: "600", fontSize: 16 },
  notice: { marginTop: 24, fontSize: 12, color: "#94a3b8", textAlign: "center" },
});
