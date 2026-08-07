import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { trackPageview, trackPing } from "@/lib/analytics";
import { PlayerProvider } from "@/lib/player-context";
import { FloatProvider } from "@/lib/float-context";
import { VoiceCallProvider } from "@/lib/voice-call-context";
import { ThemeProvider } from "@/lib/theme-context";
import { FloatingCallBanner } from "@/components/floating-call-banner";
import { Layout } from "@/components/layout";
import { SocialProofToast } from "@/components/social-proof-toast";
import { SplashScreen } from "@/components/splash-screen";
import { NameWizard } from "@/components/name-wizard";
import { PasswordWizard } from "@/components/password-wizard";
import { useState, useEffect, Component } from "react";
import type { ReactNode } from "react";

class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { crashed: false };
  }
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  render() {
    if (this.state.crashed) {
      return (
        <div style={{ background: "#08060a", minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, color: "#fff", fontFamily: "Vazirmatn, sans-serif", direction: "rtl" }}>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>مشکلی پیش آمد. لطفاً صفحه را دوباره بارگذاری کنید.</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#e8b800", color: "#000", border: "none", borderRadius: 12, padding: "10px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            بارگذاری مجدد
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Pages
import Reels from "@/pages/reels";
import Courses from "@/pages/courses";
import CourseDetail from "@/pages/course-detail";
import Products from "@/pages/products";
import ProductDetail from "@/pages/product-detail";
import Tools from "@/pages/tools";
import Profile from "@/pages/profile";
import Login from "@/pages/login";
import Register from "@/pages/register";
import PaymentResult from "@/pages/payment-result";
import Download from "@/pages/download";
import NotFound from "@/pages/not-found";
import TribePage from "@/pages/tribe";
import WalletPage from "@/pages/wallet";
import LeaderboardPage from "@/pages/leaderboard";
import Podcasts from "@/pages/podcasts";
import ChannelPage from "@/pages/channel";
import AssistantChat from "@/pages/assistant-chat";
import AiChat from "@/pages/ai-chat";
import OrderSummary from "@/pages/order-summary";
import GuidePage from "@/pages/guide";
import AdvisorPage from "@/pages/advisor";
import IncomeExpensePage from "@/pages/income-expense";
import GuaranteePage from "@/pages/guarantee";
import StudentResultsPage from "@/pages/student-results";
import CollaborationPage from "@/pages/collaboration";
import MtpBusinessPage from "@/pages/mtp-business";
import AssessmentTake from "@/pages/assessment-take";
import AssessmentResult from "@/pages/assessment-result";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
    }
  }
});

/** ردیابی بازدید صفحات و حضور آنلاین کاربر برای داشبورد ادمین */
function AnalyticsTracker() {
  const { user } = useAuth();
  const [location] = useLocation();
  const userId = (user as any)?.id ?? null;

  useEffect(() => {
    trackPageview(location, userId);
  }, [location, userId]);

  useEffect(() => {
    trackPing(userId);
    const timer = setInterval(() => trackPing(userId), 60_000);
    return () => clearInterval(timer);
  }, [userId]);

  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/login"><Login /></Route>
      <Route path="/register"><Register /></Route>
      <Route path="/guide"><GuidePage /></Route>
        <Route path="/tools/income-expense" component={IncomeExpensePage} />
      <Route path="/assessment/:slug/result/:sessionId" component={AssessmentResult} />
      <Route path="/assessment/:slug" component={AssessmentTake} />
      <Route path="/guarantee" component={GuaranteePage} />
      <Route path="/student-results" component={StudentResultsPage} />
      <Route path="/collaboration" component={CollaborationPage} />
      <Route path="/mtp-business" component={MtpBusinessPage} />
      {/* advisor خارج از Layout است چون layout خودش را دارد (hideHeader+hideNav=true) */}
      {/* قرار دادن آن اینجا از edge case navigation در wouter v3 nested Switch جلوگیری می‌کند */}
      <Route path="/advisor" component={AdvisorPage} />
      <Route path="/courses/:id">
        <Layout><CourseDetail /></Layout>
      </Route>
      <Route path="/product/:id">
        <Layout><ProductDetail /></Layout>
      </Route>
      <Route path="/"><Redirect to="/profile" /></Route>
      <Route path="/:rest*">
        <Layout>
          <Switch>
            <Route path="/"><Redirect to="/profile" /></Route>
            <Route path="/reels" component={Reels} />
            <Route path="/courses" component={Courses} />
            <Route path="/products" component={Products} />
            <Route path="/tools" component={Tools} />
            <Route path="/profile" component={Profile} />
            <Route path="/tribe" component={TribePage} />
            <Route path="/wallet" component={WalletPage} />
            <Route path="/leaderboard" component={LeaderboardPage} />
            <Route path="/podcasts" component={Podcasts} />
            <Route path="/channel" component={ChannelPage} />
            <Route path="/order-summary" component={OrderSummary} />
            <Route path="/payment-result" component={PaymentResult} />
            <Route path="/download" component={Download} />
            <Route path="/assistant" component={AssistantChat} />
            <Route path="/ai-chat" component={AiChat} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <ThemeProvider>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FloatProvider>
        <PlayerProvider>
          <VoiceCallProvider>
          <TooltipProvider>
            <SplashScreen visible={showSplash} />
            <NameWizard />
            <PasswordWizard />
            <SocialProofToast />
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
              <AnalyticsTracker />
              <FloatingCallBanner />
            </WouterRouter>
            <Toaster richColors position="top-center" theme="dark" dir="rtl" />
          </TooltipProvider>
          </VoiceCallProvider>
        </PlayerProvider>
        </FloatProvider>
      </AuthProvider>
    </QueryClientProvider>
    </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
