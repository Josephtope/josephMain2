import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs } from "expo-router";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

const tabs = [
  ["index", "Home", "home"],
  ["senders", "Senders", "send-o"],
  ["queue", "Queue", "inbox"],
  ["compose", "Compose", "pencil-square-o"],
  ["settings", "Settings", "gear"],
] as const;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme ?? "light"].tint;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tint,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      {tabs.map(([name, title, icon]) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color }) => (
              <FontAwesome name={icon} size={20} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
