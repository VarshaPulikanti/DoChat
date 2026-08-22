import { AuthProvider, useAuth } from "./AuthContext";
import AuthPage from "./AuthPage";
import Dashboard from "./Dashboard";

function AppContent() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="app" style={{ alignItems: "center", justifyContent: "center" }}>
        <div className="loading-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <Dashboard user={user} onLogout={logout} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
