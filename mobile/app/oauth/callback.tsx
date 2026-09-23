import { Link, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import {
  ActionButton,
  Card,
  Screen,
  palette,
  styles,
} from "@/components/Console";

export default function OAuthCallbackScreen() {
  const params = useLocalSearchParams<{
    flow?: string;
    status?: string;
    code?: string;
  }>();
  const sender = params.flow === "sender";
  const success =
    params.status === "success" || (!params.status && params.flow === "login");
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: 12, paddingTop: 70 }}>
        <Text
          style={{
            color: success ? palette.success : palette.error,
            fontSize: 44,
          }}
        >
          {success ? "✓" : "!"}
        </Text>
        <Text style={styles.title}>
          {success
            ? sender
              ? "Sender connected"
              : "Signed in"
            : "Action could not be completed"}
        </Text>
        <Text style={[styles.description, { textAlign: "center" }]}>
          {success
            ? "Return to the app workspace. The authenticated client will refresh server metadata."
            : `Try again from ${sender ? "Senders" : "Home"}. Safe diagnostic: ${params.code ?? "authorization_failed"}.`}
        </Text>
        <Card style={{ width: "100%" }}>
          <Text style={styles.body}>
            This callback contains status only. It does not contain provider
            tokens or a session credential.
          </Text>
        </Card>
        <Link href={sender ? "/(tabs)/senders" : "/(tabs)"} asChild>
          <ActionButton title="Return to workspace" />
        </Link>
      </View>
    </Screen>
  );
}
