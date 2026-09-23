import { Text } from "react-native";
import {
  ActionButton,
  Card,
  Header,
  Screen,
  styles,
} from "@/components/Console";
import { useAuth } from "@/lib/auth-context";

export default function SettingsScreen() {
  const { apiBaseUrl, user, signOut } = useAuth();
  return (
    <Screen>
      <Header
        eyebrow="Workspace"
        title="Settings"
        description="Review the active environment and manage the local application session."
      />
      <Card>
        <Text style={styles.cardTitle}>Environment</Text>
        <Text style={styles.body}>API base URL</Text>
        <Text selectable style={styles.body}>
          {apiBaseUrl}
        </Text>
        <Text style={styles.body}>
          Native callback: manusstudio://oauth/callback
        </Text>
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.body}>{user ? user.email : "Not signed in"}</Text>
        {user ? (
          <ActionButton
            title="Sign out"
            variant="danger"
            onPress={() => void signOut()}
          />
        ) : null}
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Safety boundary</Text>
        <Text style={styles.body}>
          Sender consent returns metadata only. The app never stores provider
          access or refresh tokens, and Phase 7 does not send messages.
        </Text>
      </Card>
    </Screen>
  );
}
