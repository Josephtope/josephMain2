import { useState } from "react";
import { Text, TextInput, View } from "react-native";
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
  const {
    user,
    connections,
    bindings,
    connectSender,
    refreshConnections,
    bindSheet,
    importSheet,
    lastCallback,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [tabName, setTabName] = useState("Sheet1");
  const [notice, setNotice] = useState<string | null>(null);
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
  const bind = async () => {
    const connection = connections.find((item) => item.status === "active");
    if (!connection) {
      setError("active_sender_required");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const binding = await bindSheet({
        googleConnectionId: connection.id,
        spreadsheetId,
        tabName,
      });
      setNotice(`Sheet ${binding.tabName} is bound and ready to import.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sheet_binding_failed");
    } finally {
      setBusy(false);
    }
  };
  const importRows = async (bindingId: number) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await importSheet(bindingId);
      setNotice(
        `Imported ${result.importedCount} rows; skipped ${result.skippedCount} invalid rows.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "sheet_import_failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Header
        eyebrow="Workspace"
        title="Senders"
        description="Connect a permitted Gmail sender and bind an owned Sheet for controlled lead import."
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
            title={busy ? "Working…" : "Connect Gmail sender"}
            onPress={() => void connect()}
            disabled={busy}
          />
          {error ? (
            <Card
              style={{ borderColor: "#E5B7B7", backgroundColor: "#FFF8F8" }}
            >
              <Text style={[styles.cardTitle, { color: palette.error }]}>
                Action could not be completed
              </Text>
              <Text style={styles.body}>
                Try again. Safe diagnostic: {error}.
              </Text>
              <ActionButton
                title="Retry"
                variant="secondary"
                onPress={() => void connect()}
              />
            </Card>
          ) : null}
          {notice ? (
            <Card
              style={{ backgroundColor: "#F0FAF5", borderColor: "#B9E3CB" }}
            >
              <Text style={[styles.cardTitle, { color: palette.success }]}>
                Completed
              </Text>
              <Text style={styles.body}>{notice}</Text>
            </Card>
          ) : null}
          {lastCallback?.flow === "sender" &&
          lastCallback.status === "success" ? (
            <Card>
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
                  Connect a Gmail account before binding a Sheet.
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
                </Card>
              ))
            )}
          </View>
          <Card>
            <Text style={styles.cardTitle}>Bind Google Sheet</Text>
            <Text style={styles.body}>
              Use a spreadsheet ID and tab with an email header. Access is
              checked through the active sender connection.
            </Text>
            <TextInput
              value={spreadsheetId}
              onChangeText={setSpreadsheetId}
              placeholder="Spreadsheet ID"
              autoCapitalize="none"
              style={styles.input}
            />
            <TextInput
              value={tabName}
              onChangeText={setTabName}
              placeholder="Tab name"
              style={styles.input}
            />
            <ActionButton
              title="Validate and bind"
              onPress={() => void bind()}
              disabled={busy || !spreadsheetId.trim() || !tabName.trim()}
            />
          </Card>
          {bindings.map((binding) => (
            <Card key={binding.id}>
              <Text style={styles.cardTitle}>{binding.tabName}</Text>
              <Text style={styles.body}>
                {binding.spreadsheetId} · {binding.status}
              </Text>
              <ActionButton
                title="Import validated rows"
                variant="secondary"
                onPress={() => void importRows(binding.id)}
                disabled={busy || binding.status !== "active"}
              />
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
