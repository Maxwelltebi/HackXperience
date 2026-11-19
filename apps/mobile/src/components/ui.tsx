import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { color, controlHeight, radius, shadow } from '@/theme';

export function Raised({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.raised, style]}>{children}</View>;
}

export function Inset({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.inset, style]}>{children}</View>;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  icon?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
}

/** Only the primary button is a solid fill. */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  disabled,
  busy,
}: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || busy), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        pressed && (primary ? styles.buttonPrimaryPressed : styles.buttonPressed),
        disabled && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? color.white : color.green} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.buttonLabel,
              primary && styles.buttonLabelPrimary,
              disabled && styles.muted,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

interface FieldProps extends TextInputProps {
  label: string;
  error?: string | undefined;
  hint?: string;
  mono?: boolean;
}

/** Label above, never a placeholder alone. */
export function Field({ label, error, hint, mono, style, ...input }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.muted}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, mono && styles.mono, error ? styles.inputError : null, style]}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Toggle({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#CBD3DE', true: '#9FD397' }}
        thumbColor={value ? color.green : color.white}
      />
    </View>
  );
}

/** Status is always an icon or dot plus a word. */
export function Banner({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'success';
  children: ReactNode;
}) {
  const toneColor =
    tone === 'danger' ? color.danger : tone === 'warning' ? color.warning : color.success;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <View style={[styles.dot, { backgroundColor: toneColor }]} />
      <Text style={[styles.bannerText, { color: toneColor }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  raised: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    boxShadow: shadow.raised,
  },
  inset: {
    backgroundColor: color.surface,
    borderRadius: 22,
    boxShadow: shadow.inset,
  },
  button: {
    minHeight: controlHeight,
    paddingHorizontal: 24,
    borderRadius: radius.control,
    backgroundColor: color.surface,
    boxShadow: shadow.raisedSm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonPrimary: { backgroundColor: color.green },
  buttonPressed: { boxShadow: shadow.inset },
  buttonPrimaryPressed: { backgroundColor: '#035A00' },
  buttonDisabled: { boxShadow: 'none', borderWidth: 1, borderColor: '#C9D1DC' },
  buttonLabel: { color: color.ink, fontSize: 17, fontWeight: '600' },
  buttonLabelPrimary: { color: color.white },
  muted: { color: color.muted },
  field: { gap: 8 },
  label: { color: color.ink, fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: controlHeight,
    paddingHorizontal: 20,
    borderRadius: radius.control,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: color.surface,
    boxShadow: shadow.inset,
    color: color.ink,
    fontSize: 17,
  },
  inputError: { borderColor: color.danger },
  mono: { fontFamily: 'monospace' },
  error: { color: color.danger, fontSize: 13 },
  hint: { color: color.muted, fontSize: 13 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: controlHeight,
  },
  toggleLabel: { color: color.ink, fontSize: 16, fontWeight: '500' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 20,
    backgroundColor: color.surface,
    boxShadow: shadow.raisedSm,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bannerText: { flex: 1, fontSize: 15, fontWeight: '600' },
});
