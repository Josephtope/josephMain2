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

export default function ComposeScreen() {
  const { connections } = useAuth();
  const [subject, setSubject] = useState(
    "A thoughtful idea for {company_name}",
  );
  const [body, setBody] = useState(
    "Hi {first_name},\n\nI wanted to share a thoughtful idea about {company_name}.",
  );
  const [recipient, setRecipient] = useState("");
  return (
    <Screen>
      <Header
        eyebrow="Draft"
        title="Compose"
        description="Draft, validate, and preview before explicit campaign approval. This screen never sends mail."
      />
      <Card>
        <View style={styles.row}>
          <Text style={styles.cardTitle}>Template identity</Text>
          <Text style={styles.badge}>Draft</Text>
        </View>
        <TextInput
          placeholder="Template name"
          placeholderTextColor={palette.muted}
          defaultValue="Thoughtful idea"
          style={inputStyle}
        />
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Message setup</Text>
        <Text style={styles.body}>Sender</Text>
        <View
          style={[
            styles.row,
            {
              borderColor: palette.border,
              borderWidth: 1,
              borderRadius: 10,
              padding: 12,
            },
          ]}
        >
          <Text style={styles.body}>
            {connections[0]?.email ?? "Connect a sender from Senders"}
          </Text>
          <Text
            style={{
              color: connections[0] ? palette.success : palette.warning,
              fontWeight: "700",
            }}
          >
            {connections[0] ? "Selected" : "Required"}
          </Text>
        </View>
        <Text style={styles.body}>Explicit test recipient</Text>
        <TextInput
          value={recipient}
          onChangeText={setRecipient}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@example.com"
          placeholderTextColor={palette.muted}
          style={inputStyle}
        />
        <Text style={styles.body}>Subject</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          style={inputStyle}
        />
        <Text style={styles.body}>Body</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          style={[inputStyle, { minHeight: 180, textAlignVertical: "top" }]}
        />
        <ActionButton
          title="Validate draft"
          onPress={() => undefined}
          variant="secondary"
        />
      </Card>
      <Card style={{ backgroundColor: "#FFF8E8", borderColor: "#F0D9A2" }}>
        <Text style={[styles.cardTitle, { color: palette.warning }]}>
          Dry-run only
        </Text>
        <Text style={styles.body}>
          Live Gmail sending is deliberately not enabled in Phase 9. Campaign
          approval, durable jobs, and workspace controls remain provider-safe
          until the Phase 10 worker.
        </Text>
      </Card>
    </Screen>
  );
}
const inputStyle = {
  borderColor: palette.border,
  borderRadius: 10,
  borderWidth: 1,
  color: palette.ink,
  paddingHorizontal: 12,
  paddingVertical: 11,
  fontSize: 15,
} as const;
