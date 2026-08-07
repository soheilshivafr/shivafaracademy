import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Courses from "@/pages/Courses";
import MtpPricing from "@/pages/MtpPricing";
import Products from "@/pages/Products";
import Reels from "@/pages/Reels";
import Users from "@/pages/Users";
import Orders from "@/pages/Orders";
import Licenses from "@/pages/Licenses";
import Settings from "@/pages/Settings";
import Chatbot from "@/pages/Chatbot";
import Campaigns from "@/pages/Campaigns";
import TrackingLinks from "@/pages/TrackingLinks";
import SupportAgents from "@/pages/SupportAgents";
import ProactiveMessages from "@/pages/ProactiveMessages";
import Channel from "@/pages/Channel";
import VoiceAdvisorLogs from "@/pages/VoiceAdvisorLogs";
import FinancialReports from "@/pages/FinancialReports";
import PushNotification from "@/pages/PushNotification";
import AndroidApk from "@/pages/AndroidApk";
import AdvisorRequests from "@/pages/AdvisorRequests";
import SystemStatus from "@/pages/SystemStatus";
import KnowledgeBase from "@/pages/KnowledgeBase";
import PagesContent from "@/pages/PagesContent";
import AdminManagement from "@/pages/AdminManagement";
import Assessments from "@/pages/Assessments";
import AssessmentBuilder from "@/pages/AssessmentBuilder";
import AssessmentStats from "@/pages/AssessmentStats";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

function ProtectedRoute({ component: Comp }: { component: React.ComponentType }) {
  const { admin, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!admin) return <Redirect to="/login" />;
  return <Layout><Comp /></Layout>;
}

function SuperAdminRoute({ component: Comp }: { component: React.ComponentType }) {
  const { admin, isLoading, isSuperAdmin } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!admin) return <Redirect to="/login" />;
  if (!isSuperAdmin) return <Redirect to="/" />;
  return <Layout><Comp /></Layout>;
}

function Router() {
  const { admin, isLoading } = useAuth();
  if (isLoading) return null;

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/courses" component={() => <ProtectedRoute component={Courses} />} />
      <Route path="/mtp-pricing" component={() => <ProtectedRoute component={MtpPricing} />} />
      <Route path="/products" component={() => <ProtectedRoute component={Products} />} />
      <Route path="/reels" component={() => <ProtectedRoute component={Reels} />} />
      <Route path="/users" component={() => <ProtectedRoute component={Users} />} />
      <Route path="/orders" component={() => <ProtectedRoute component={Orders} />} />
      <Route path="/licenses" component={() => <ProtectedRoute component={Licenses} />} />
      <Route path="/chatbot" component={() => <ProtectedRoute component={Chatbot} />} />
      <Route path="/campaigns" component={() => <ProtectedRoute component={Campaigns} />} />
      <Route path="/tracking-links" component={() => <ProtectedRoute component={TrackingLinks} />} />
      <Route path="/support-agents" component={() => <ProtectedRoute component={SupportAgents} />} />
      <Route path="/proactive-messages" component={() => <ProtectedRoute component={ProactiveMessages} />} />
      <Route path="/channel" component={() => <ProtectedRoute component={Channel} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/voice-advisor-logs" component={() => <ProtectedRoute component={VoiceAdvisorLogs} />} />
      <Route path="/financial-reports" component={() => <ProtectedRoute component={FinancialReports} />} />
      <Route path="/push-notification" component={() => <ProtectedRoute component={PushNotification} />} />
      <Route path="/android-apk" component={() => <ProtectedRoute component={AndroidApk} />} />
      <Route path="/advisor-requests" component={() => <ProtectedRoute component={AdvisorRequests} />} />
      <Route path="/system-status" component={() => <ProtectedRoute component={SystemStatus} />} />
      <Route path="/knowledge-base" component={() => <ProtectedRoute component={KnowledgeBase} />} />
      <Route path="/pages-content" component={() => <ProtectedRoute component={PagesContent} />} />
      <Route path="/admin-management" component={() => <SuperAdminRoute component={AdminManagement} />} />
      <Route path="/assessments" component={() => <ProtectedRoute component={Assessments} />} />
      <Route path="/assessments/new" component={() => <ProtectedRoute component={AssessmentBuilder} />} />
      <Route path="/assessments/:id/edit" component={() => <ProtectedRoute component={AssessmentBuilder} />} />
      <Route path="/assessments/:id/stats" component={() => <ProtectedRoute component={AssessmentStats} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
          <SonnerToaster position="top-center" richColors dir="rtl" />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
