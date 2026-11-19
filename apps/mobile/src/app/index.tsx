import { ApiError, type MeResponse } from '@hx/shared';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Field, Raised, Toggle } from '@/components/ui';
import { api, NetworkError } from '@/lib/api';
import { signOut } from '@/lib/auth';
import { color } from '@/theme';

interface Values {
  name: string;
  school: string;
  github_username: string;
  timezone: string;
  email_reminders: boolean;
}

function toValues(me: MeResponse): Values {
  return {
    name: me.user.name,
    school: me.profile.school ?? '',
    github_username: me.profile.github_username ?? '',
    timezone: me.profile.timezone,
    email_reminders: me.profile.email_reminders,
  };
}

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

type Load =
  { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; me: MeResponse };

export default function ProfileScreen() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [values, setValues] = useState<Values | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    api.getMe().then(
      (me) => {
        if (!active) return;
        setLoad({ kind: 'ready', me });
        setValues(toValues(me));
      },
      (error: unknown) => {
        if (active) setLoad({ kind: 'failed', message: messageFor(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function save() {
    if (!values) return;
    setSaving(true);
    setNotice(null);
    setErrors({});
    try {
      const me = await api.patchProfile(values);
      setLoad({ kind: 'ready', me });
      setValues(toValues(me));
      setNotice({ tone: 'success', text: 'Saved' });
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
      } else {
        setNotice({ tone: 'danger', text: messageFor(error) });
      }
    } finally {
      setSaving(false);
    }
  }

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => (current ? { ...current, [key]: value } : current));

  if (load.kind === 'loading' && !values) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={color.green} size="large" />
      </SafeAreaView>
    );
  }

  if (load.kind === 'failed' || !values || load.kind !== 'ready') {
    return (
      <SafeAreaView style={[styles.safe, styles.page]}>
        <Banner tone="danger">
          {load.kind === 'failed' ? load.message : 'Something went wrong.'}
        </Banner>
        <Button
          label="Try again"
          onPress={() => {
            setLoad({ kind: 'loading' });
            setReloadKey((key) => key + 1);
          }}
        />
        <Button label="Sign out" onPress={() => void signOut()} />
      </SafeAreaView>
    );
  }

  const zone = deviceTimezone();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior="height" style={styles.safe}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.eyebrow}>YOUR ACCOUNT</Text>
            <Text style={styles.h1} accessibilityRole="header">
              Profile
            </Text>
            <Text style={styles.muted}>Signed in as {load.me.user.email}</Text>
          </View>

          <Raised style={styles.card}>
            <Text style={styles.h2}>About you</Text>
            <Field
              label="Name"
              value={values.name}
              onChangeText={(text) => set('name', text)}
              error={errors.name}
              autoComplete="name"
            />
            <Field
              label="School"
              value={values.school}
              onChangeText={(text) => set('school', text)}
              error={errors.school}
            />
            <Field
              label="GitHub username"
              value={values.github_username}
              onChangeText={(text) => set('github_username', text)}
              error={errors.github_username}
              hint="Just the username, not a link"
              autoCapitalize="none"
              autoCorrect={false}
              mono
            />
          </Raised>

          <Raised style={styles.card}>
            <Text style={styles.h2}>Settings</Text>
            <Field
              label="Time zone"
              value={values.timezone}
              onChangeText={(text) => set('timezone', text.trim())}
              error={errors.timezone}
              hint="An IANA name such as Africa/Accra"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {zone && zone !== values.timezone ? (
              <Button
                label={`Use this phone's time zone (${zone})`}
                onPress={() => set('timezone', zone)}
              />
            ) : null}
            <Toggle
              label={`Email reminders ${values.email_reminders ? 'on' : 'off'}`}
              value={values.email_reminders}
              onValueChange={(value) => set('email_reminders', value)}
            />
          </Raised>

          {notice ? <Banner tone={notice.tone}>{notice.text}</Banner> : null}

          <Button
            label="Save profile"
            variant="primary"
            busy={saving}
            onPress={() => void save()}
          />
          <Button label="Sign out" onPress={() => void signOut()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof NetworkError) return error.message;
  if (error instanceof ApiError) return error.message;
  return "Couldn't save. Check your connection and try again.";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.surface },
  center: { alignItems: 'center', justifyContent: 'center' },
  page: { padding: 20, gap: 24, paddingBottom: 48 },
  header: { gap: 4, paddingTop: 8 },
  eyebrow: { color: color.green, fontSize: 12, fontWeight: '700', letterSpacing: 1.7 },
  h1: { color: color.ink, fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  h2: { color: color.ink, fontSize: 20, lineHeight: 26, fontWeight: '700' },
  muted: { color: color.muted, fontSize: 14 },
  card: { padding: 20, gap: 18 },
});
