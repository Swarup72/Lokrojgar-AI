import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { AppRoutes } from "./routes/AppRoutes";
import { useAuth } from "./hooks/useAuth";
import "./App.css";

function LanguageAwareApp() {
  const { isAuthenticated, user } = useAuth();

  return (
    <LanguageProvider isAuthenticated={isAuthenticated} userPreferredLanguage={user?.preferredLanguage}>
      <AppRoutes />
    </LanguageProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LanguageAwareApp />
      </AuthProvider>
    </BrowserRouter>
  );
}
