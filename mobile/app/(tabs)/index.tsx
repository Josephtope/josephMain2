import { Link } from "expo-router";
import { Text, View } from "react-native";
import {
  ActionButton,
  Card,
  Header,
  Screen,
  palette,
  styles,
} from "@/components/Console";
import { useAuth } from "@/lib/auth-context";

export default function HomeScreen() {
  const { user, connections, lastCallback, signIn } = useAuth();
  return (
    <Screen>
      <Header
        eyebrow="Stealth Mail Studio"
        title="Operations console"
        description="Review, validate, and prepare outreach without losing control of the workflow."
      />
      <Card>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>Workspace status</Text>
          <Text
            style={[
              styles.badge,
              {
                backgroundColor: user ? "#E5F4EC" : "#FFF5DF",
                color: user ? palette.success : palette.warning,
              },
            ]}
          >
            {user ? "Signed in" : "Authentication required"}
          </Text>
        </View>
        <Text style={styles.body}>
          {user
            ? `Signed in as ${user.email}`
            : "Sign in from Senders to load user-owned sender and lead data."}
        </Text>
        {!user ? (
          <ActionButton
            title="Sign in with Google"
            onPress={() => void signIn()}
          />
        ) : (
          <Text style={styles.body}>
            {connections.length} sender account
            {connections.length === 1 ? "" : "s"} connected.
          </Text>
        )}
      </Card>
      {lastCallback?.status === "error" ? (
        <Card style={{ borderColor: "#E5B7B7", backgroundColor: "#FFF8F8" }}>
          <Text style={[styles.cardTitle, { color: palette.error }]}>
            Action needs attention
          </Text>
          <Text style={styles.body}>
            The provider did not complete the request. Return to Senders and try
            again.
          </Text>
        </Card>
      ) : null}
      <View style={{ gap: 10 }}>
        <Text style={styles.cardTitle}>Next steps</Text>
        <Link href="/(tabs)/senders" asChild>
          <ActionButton title="Manage senders" variant="secondary" />
        </Link>
        <Link href="/(tabs)/queue" asChild>
          <ActionButton title="Review lead queue" variant="secondary" />
        </Link>
      </View>
    </Screen>
  );
}
