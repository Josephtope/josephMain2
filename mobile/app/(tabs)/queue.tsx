import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Card, Header, Screen, palette, styles } from "@/components/Console";
import { useAuth } from "@/lib/auth-context";

const filters = ["All", "Needs review", "Verified", "Suppressed"];
export default function QueueScreen() {
  const { user } = useAuth();
  const [filter, setFilter] = useState("All");
  return (
    <Screen>
      <Header
        eyebrow="Review"
        title="Queue"
        description="Review approved lead projections before any campaign preparation."
      />
      <View style={styles.row}>
        {filters.map((item) => (
          <Pressable
            key={item}
            onPress={() => setFilter(item)}
            style={{
              backgroundColor:
                filter === item ? palette.primary : palette.surface,
              borderColor: palette.border,
              borderWidth: 1,
              borderRadius: 20,
              paddingHorizontal: 11,
              paddingVertical: 8,
            }}
          >
            <Text
              style={{
                color: filter === item ? "#FFF" : palette.muted,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>
      <Card style={{ backgroundColor: "#FFF8E8", borderColor: "#F0D9A2" }}>
        <Text style={[styles.cardTitle, { color: palette.warning }]}>
          Sheets setup required
        </Text>
        <Text style={styles.body}>
          Connect a sender first. Sheet binding and controlled import arrive in
          Phase 8; no placeholder leads are shown here.
        </Text>
      </Card>
      <Card>
        <Text style={styles.cardTitle}>
          {user ? "No leads in this view" : "Authentication required"}
        </Text>
        <Text style={styles.body}>
          {user
            ? `There are no ${filter.toLowerCase()} leads to review.`
            : "Sign in from Senders before loading user-owned lead data."}
        </Text>
      </Card>
    </Screen>
  );
}
