import { useState } from "react";
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

export default function SendersScreen() {
  const { user, connections, connectSender, refreshConnections, lastCallback } =
    useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await connectSender();
    } catch (e) {
      setError(e instanceof Error ? e.message : "authorization_failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Header
        eyebrow="Workspace"
        title="Senders"
        description="Connect a permitted Gmail sender. Consent completion is not treated as proof until the server metadata is refreshed."
      />
      {!user ? (
        <Card>
          <Text style={styles.cardTitle}>Authentication required</Text>
          <Text style={styles.body}>
            Sign in before connecting a sender account.
          </Text>
        </Card>
      ) : (
        <>
          <ActionButton
            title={busy ? "Opening Google…" : "Connect Gmail sender"}
            onPress={() => void connect()}
            disabled={busy}
          />
          {error ? (
            <Card
              style={{ borderColor: "#E5B7B7", backgroundColor: "#FFF8F8" }}
            >
              <Text style={[styles.cardTitle, { color: palette.error }]}>
                Could not start connection
              </Text>
              <Text style={styles.body}>
                Try again. The server returned a safe diagnostic: {error}.
              </Text>
              <ActionButton
                title="Retry"
                variant="secondary"
                onPress={() => void connect()}
              />
            </Card>
          ) : null}
          {lastCallback?.flow === "sender" &&
          lastCallback.status === "success" ? (
            <Card
              style={{ backgroundColor: "#F0FAF5", borderColor: "#B9E3CB" }}
            >
              <Text style={[styles.cardTitle, { color: palette.success }]}>
                Sender connected
              </Text>
              <Text style={styles.body}>
                The connection list was refreshed from the authenticated server.
              </Text>
            </Card>
          ) : null}
          <View style={{ gap: 10 }}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>Connected accounts</Text>
              <ActionButton
                title="Refresh"
                variant="secondary"
                onPress={() => void refreshConnections()}
              />
            </View>
            {connections.length === 0 ? (
              <Card>
                <Text style={styles.cardTitle}>No senders connected</Text>
                <Text style={styles.body}>
                  Connect a Gmail account to make it available for controlled
                  test preparation.
                </Text>
              </Card>
            ) : (
              connections.map((connection) => (
                <Card key={connection.id}>
                  <View style={styles.row}>
                    <Text style={styles.cardTitle}>{connection.email}</Text>
                    <Text
                      style={[
                        styles.badge,
                        {
                          color:
                            connection.status === "active"
                              ? palette.success
                              : palette.warning,
                        },
                      ]}
                    >
                      {connection.status}
                    </Text>
                  </View>
                  <Text style={styles.body}>Scopes: {connection.scopes}</Text>
                  <Text style={styles.body}>
                    Last validated:{" "}
                    {connection.lastValidatedAt ?? "Not yet validated"}
                  </Text>
                </Card>
              ))
            )}
          </View>
        </>
      )}
    </Screen>
  );
}
