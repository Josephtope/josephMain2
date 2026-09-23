import * as SecureStore from "expo-secure-store";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type User = { id: number; email: string; displayName?: string | null };
type Connection = {
  id: number;
  email: string;
  scopes: string;
  status: string;
  tokenExpiresAt?: string | null;
  lastValidatedAt?: string | null;
};
type SheetBinding = {
  id: number;
  googleConnectionId: number;
  spreadsheetId: string;
  tabName: string;
  status: string;
};
type Lead = {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  sourceRowKey?: string | null;
  status: string;
};
type Campaign = {
  id: number;
  name: string;
  mode: string;
  approvalPolicy: string;
  status: string;
};
type Job = {
  id: number;
  campaignId: number;
  leadId: number;
  status: string;
  attemptCount: number;
  safeErrorCode?: string | null;
};
type WorkspaceControl = {
  paused: boolean;
  killSwitch: boolean;
  maxConcurrentJobs: number;
};
type CallbackResult = {
  flow: "login" | "sender";
  status: "success" | "error";
  code?: string;
};
type BindingInput = {
  googleConnectionId: number;
  spreadsheetId: string;
  tabName: string;
};

type AuthContextValue = {
  apiBaseUrl: string;
  session: string | null;
  user: User | null;
  connections: Connection[];
  bindings: SheetBinding[];
  leads: Lead[];
  campaigns: Campaign[];
  jobs: Job[];
  workspaceControl: WorkspaceControl | null;
  loading: boolean;
  lastCallback: CallbackResult | null;
  signIn: () => Promise<void>;
  connectSender: () => Promise<void>;
  refreshConnections: () => Promise<void>;
  refreshBindings: () => Promise<void>;
  refreshLeads: (status?: string) => Promise<void>;
  bindSheet: (input: BindingInput) => Promise<SheetBinding>;
  importSheet: (
    bindingId: number,
  ) => Promise<{ importedCount: number; skippedCount: number }>;
  refreshCampaigns: () => Promise<void>;
  refreshJobs: (campaignId?: number) => Promise<void>;
  refreshWorkspaceControl: () => Promise<void>;
  processCallback: (url: string) => Promise<CallbackResult | null>;
  signOut: () => Promise<void>;
};

const SESSION_KEY = "sms_session";
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
const NATIVE_CALLBACK = "manusstudio://oauth/callback";
const AuthContext = createContext<AuthContextValue | null>(null);

function callbackFromUrl(url: string): CallbackResult | null {
  const parsed = Linking.parse(url);
  const flow = parsed.queryParams?.flow;
  if (flow !== "login" && flow !== "sender") return null;
  const status =
    parsed.queryParams?.status ?? (flow === "login" ? "success" : "error");
  return {
    flow,
    status: status === "success" ? "success" : "error",
    code:
      typeof parsed.queryParams?.code === "string"
        ? parsed.queryParams.code
        : undefined,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [bindings, setBindings] = useState<SheetBinding[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workspaceControl, setWorkspaceControl] =
    useState<WorkspaceControl | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCallback, setLastCallback] = useState<CallbackResult | null>(null);

  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("Accept", "application/json");
      if (session) headers.set("Authorization", `Bearer ${session}`);
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
        redirect: "manual",
      });
      if (!response.ok && response.status !== 302) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.error?.code ?? `request_failed_${response.status}`,
        );
      }
      return response;
    },
    [session],
  );

  const refreshMe = useCallback(async () => {
    if (!session) return;
    const response = await request("/api/auth/me");
    if (response.ok) setUser((await response.json()).user);
  }, [request, session]);

  const refreshConnections = useCallback(async () => {
    if (!session) {
      setConnections([]);
      return;
    }
    const response = await request("/api/auth/google/connections");
    if (response.ok) setConnections((await response.json()).connections ?? []);
  }, [request, session]);

  const refreshBindings = useCallback(async () => {
    if (!session) {
      setBindings([]);
      return;
    }
    const response = await request("/api/sheets/bindings");
    if (response.ok) setBindings((await response.json()).bindings ?? []);
  }, [request, session]);

  const refreshLeads = useCallback(
    async (status?: string) => {
      if (!session) {
        setLeads([]);
        return;
      }
      const response = await request(
        `/api/leads${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      );
      if (response.ok) setLeads((await response.json()).leads ?? []);
    },
    [request, session],
  );

  const bindSheet = useCallback(
    async (input: BindingInput) => {
      const response = await request("/api/sheets/bind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error("sheet_binding_failed");
      const binding = (await response.json()).binding as SheetBinding;
      await refreshBindings();
      return binding;
    },
    [refreshBindings, request],
  );

  const importSheet = useCallback(
    async (bindingId: number) => {
      const response = await request("/api/sheets/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bindingId }),
      });
      if (!response.ok) throw new Error("sheet_import_failed");
      const result = (await response.json()).result as {
        importedCount: number;
        skippedCount: number;
      };
      await refreshLeads();
      return result;
    },
    [refreshLeads, request],
  );

  const refreshCampaigns = useCallback(async () => {
    if (!session) {
      setCampaigns([]);
      return;
    }
    const response = await request("/api/campaigns");
    if (response.ok) setCampaigns((await response.json()).campaigns ?? []);
  }, [request, session]);

  const refreshJobs = useCallback(
    async (campaignId?: number) => {
      if (!session) {
        setJobs([]);
        return;
      }
      const suffix = campaignId ? `?campaignId=${campaignId}` : "";
      const response = await request(`/api/jobs${suffix}`);
      if (response.ok) setJobs((await response.json()).jobs ?? []);
    },
    [request, session],
  );

  const refreshWorkspaceControl = useCallback(async () => {
    if (!session) {
      setWorkspaceControl(null);
      return;
    }
    const response = await request("/api/workspace/control");
    if (response.ok) setWorkspaceControl((await response.json()).control);
  }, [request, session]);

  useEffect(() => {
    SecureStore.getItemAsync(SESSION_KEY).then((stored) => {
      if (stored) setSession(stored);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!session) {
      setUser(null);
      setConnections([]);
      setBindings([]);
      setLeads([]);
      setCampaigns([]);
      setJobs([]);
      setWorkspaceControl(null);
      return;
    }
    Promise.all([
      refreshMe(),
      refreshConnections(),
      refreshBindings(),
      refreshLeads(),
      refreshCampaigns(),
      refreshJobs(),
      refreshWorkspaceControl(),
    ]).catch(() => setSession(null));
  }, [
    refreshBindings,
    refreshCampaigns,
    refreshConnections,
    refreshJobs,
    refreshLeads,
    refreshMe,
    refreshWorkspaceControl,
    session,
  ]);

  const signIn = useCallback(async () => {
    await Linking.openURL(
      `${API_BASE_URL}/api/auth/google/start?nativeReturnUri=${encodeURIComponent(NATIVE_CALLBACK)}`,
    );
  }, []);

  const connectSender = useCallback(async () => {
    if (!session) throw new Error("sign_in_required");
    const response = await request(
      `/api/auth/google/connection/start?nativeReturnUri=${encodeURIComponent(NATIVE_CALLBACK)}`,
    );
    const location = response.headers.get("location");
    if (!location) throw new Error("authorization_url_missing");
    await Linking.openURL(location);
  }, [request, session]);

  const processCallback = useCallback(
    async (url: string) => {
      const result = callbackFromUrl(url);
      if (!result) return null;
      setLastCallback(result);
      if (
        result.flow === "login" &&
        result.status === "success" &&
        result.code
      ) {
        const response = await fetch(
          `${API_BASE_URL}/api/auth/login/exchange`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              code: result.code,
              nativeReturnUri: NATIVE_CALLBACK,
            }),
          },
        );
        if (!response.ok) throw new Error("login_exchange_failed");
        const data = await response.json();
        await SecureStore.setItemAsync(SESSION_KEY, data.session.credential);
        setSession(data.session.credential);
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
      if (result.flow === "sender" && result.status === "success") {
        await refreshConnections();
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      }
      if (result.status === "error")
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return result;
    },
    [refreshConnections],
  );

  const signOut = useCallback(async () => {
    if (session)
      await request("/api/auth/logout", { method: "POST" }).catch(
        () => undefined,
      );
    await SecureStore.deleteItemAsync(SESSION_KEY);
    setSession(null);
    setUser(null);
    setConnections([]);
    setBindings([]);
    setLeads([]);
    setCampaigns([]);
    setJobs([]);
    setWorkspaceControl(null);
  }, [request, session]);

  const value = useMemo(
    () => ({
      apiBaseUrl: API_BASE_URL,
      session,
      user,
      connections,
      bindings,
      leads,
      campaigns,
      jobs,
      workspaceControl,
      loading,
      lastCallback,
      signIn,
      connectSender,
      refreshConnections,
      refreshBindings,
      refreshLeads,
      bindSheet,
      importSheet,
      processCallback,
      signOut,
      refreshCampaigns,
      refreshJobs,
      refreshWorkspaceControl,
    }),
    [
      bindSheet,
      bindings,
      campaigns,
      connectSender,
      connections,
      importSheet,
      jobs,
      lastCallback,
      leads,
      loading,
      processCallback,
      refreshBindings,
      refreshCampaigns,
      refreshConnections,
      refreshJobs,
      refreshLeads,
      refreshWorkspaceControl,
      session,
      signIn,
      signOut,
      user,
      workspaceControl,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
