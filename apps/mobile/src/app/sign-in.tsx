import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Inset, Raised } from '@/components/ui';
import { signIn, type Provider } from '@/lib/auth';
import { color } from '@/theme';

export default function SignInScreen() {
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(provider: Provider) {
    setBusy(provider);
    setError(null);
    try {
      setError(await signIn(provider));
    } catch {
      setError("Couldn't reach the sign-in service. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Raised style={styles.card}>
          <Raised style={styles.markOuter}>
            <Inset style={styles.markInner}>
              <Text style={styles.markText}>
                H<Text style={styles.green}>X</Text>
              </Text>
            </Inset>
          </Raised>
          <View style={styles.wordmark}>
            <Text style={styles.wordmarkText} accessibilityRole="header">
              Hack<Text style={styles.green}>X</Text>perience
            </Text>
            <Text style={styles.byline}>BY CIReN</Text>
          </View>
          <Text style={styles.intro}>
            Sign in to apply, join your team and submit your project.
          </Text>

          {error ? <Banner tone="danger">{error}</Banner> : null}

          <View style={styles.buttons}>
            <Button
              label="Continue with Google"
              busy={busy === 'google'}
              disabled={busy !== null && busy !== 'google'}
              onPress={() => void start('google')}
            />
            <Button
              label="Continue with GitHub"
              busy={busy === 'github'}
              disabled={busy !== null && busy !== 'github'}
              onPress={() => void start('github')}
            />
          </View>

          <Inset style={styles.well}>
            <Text style={styles.wellText}>
              No password to create. New here? Signing in sets up your account.
            </Text>
          </Inset>
        </Raised>
        <Text style={styles.terms}>By continuing you agree to the code of conduct.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.surface },
  page: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 28 },
  card: { padding: 24, paddingTop: 36, gap: 20, alignItems: 'center' },
  markOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontSize: 30, fontWeight: '800', color: color.ink, letterSpacing: -1 },
  green: { color: color.green },
  wordmark: { alignItems: 'center', gap: 2 },
  wordmarkText: { fontSize: 32, fontWeight: '800', color: color.ink, letterSpacing: -1.2 },
  byline: { fontSize: 13, fontWeight: '700', letterSpacing: 2, color: color.muted },
  intro: { fontSize: 17, lineHeight: 26, color: color.muted, textAlign: 'center' },
  buttons: { alignSelf: 'stretch', gap: 16 },
  well: { alignSelf: 'stretch', paddingVertical: 14, paddingHorizontal: 18 },
  wellText: { color: color.muted, fontSize: 14, lineHeight: 20 },
  terms: { textAlign: 'center', color: color.muted, fontSize: 14 },
});
