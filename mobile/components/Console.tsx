import { PropsWithChildren } from "react";
import {
  Pressable,
  PressableProps,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export const palette = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  ink: "#16202A",
  muted: "#6B7785",
  border: "#E1E6EB",
  primary: "#176B87",
  primarySoft: "#E6F3F7",
  success: "#2A8C64",
  warning: "#9A6A13",
  error: "#B64A4A",
};

export function Screen({ children }: PropsWithChildren) {
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      style={{ backgroundColor: palette.background }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}
export function Header({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.header}>
      {eyebrow ? (
        <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
    </View>
  );
}
export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: object }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function ActionButton({
  title,
  onPress,
  variant = "primary",
  disabled,
  ...props
}: PressableProps & {
  title: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondaryButton,
        variant === "danger" && styles.dangerButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
      {...props}
    >
      <Text
        style={[
          styles.buttonText,
          variant !== "primary" && styles.secondaryButtonText,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  screen: { padding: 20, paddingTop: 64, paddingBottom: 40, gap: 16 },
  header: { gap: 7 },
  eyebrow: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  description: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  cardTitle: { color: palette.ink, fontSize: 17, fontWeight: "700" },
  body: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  button: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  secondaryButton: {
    backgroundColor: palette.primarySoft,
    borderColor: "#B7DCE7",
    borderWidth: 1,
  },
  dangerButton: {
    backgroundColor: "#FCECEC",
    borderColor: "#E5B7B7",
    borderWidth: 1,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  secondaryButtonText: { color: palette.primary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 99,
    backgroundColor: palette.primarySoft,
    color: palette.primary,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  input: {
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    color: palette.ink,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
});
