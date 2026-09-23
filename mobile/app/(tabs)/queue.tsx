import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Card, Header, Screen, palette, styles } from "@/components/Console";
import { useAuth } from "@/lib/auth-context";

const filters = ["All", "Needs review", "Verified", "Suppressed"];
const statusFor = (filter: string) =>
  ({
    "Needs review": "imported",
    Verified: "imported",
    Suppressed: "suppressed",
  })[filter];

export default function QueueScreen() {
  const { user, leads, jobs, workspaceControl, refreshLeads, refreshJobs } =
    useAuth();
  const [filter, setFilter] = useState("All");
  useEffect(() => {
    if (user) {
      void refreshLeads(statusFor(filter));
      void refreshJobs();
    }
  }, [filter, refreshJobs, refreshLeads, user]);
  const visible =
    filter === "Verified"
      ? leads.filter((lead) => lead.status === "imported")
      : leads;
  return (
    <Screen>
      <Header
        eyebrow="Review"
        title="Queue"
        description="Review imported rows and durable job state before provider execution."
      />
      {user && workspaceControl ? (
        <Card
          style={{
            backgroundColor:
              workspaceControl.killSwitch || workspaceControl.paused
                ? "#FFF8E8"
                : "#F0FAF5",
            borderColor:
              workspaceControl.killSwitch || workspaceControl.paused
                ? "#F0D9A2"
                : "#B9E3CB",
          }}
        >
          <Text style={styles.cardTitle}>
            {workspaceControl.killSwitch
              ? "Kill switch active"
              : workspaceControl.paused
                ? "Workspace paused"
                : "Workspace ready"}
          </Text>
          <Text style={styles.body}>
            {jobs.length} durable jobs · concurrency limit{" "}
            {workspaceControl.maxConcurrentJobs}
          </Text>
        </Card>
      ) : null}
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
      {!user ? (
        <Card>
          <Text style={styles.cardTitle}>Authentication required</Text>
          <Text style={styles.body}>
            Sign in from Senders before loading user-owned lead data.
          </Text>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <Text style={styles.cardTitle}>No leads in this view</Text>
          <Text style={styles.body}>
            Bind a permitted Google Sheet and import validated rows from
            Senders.
          </Text>
        </Card>
      ) : (
        visible.map((lead) => (
          <Card key={lead.id}>
            <Text style={styles.cardTitle}>{lead.email}</Text>
            <Text style={styles.body}>
              {[lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
                "Name not provided"}{" "}
              · {lead.status} · source row {lead.sourceRowKey ?? "unknown"}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}
