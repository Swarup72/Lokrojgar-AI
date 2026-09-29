import { Routes, Route } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { USER_ROLES } from "../utils/enums";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { RegisterPage } from "../pages/RegisterPage";
import { JobsPage } from "../pages/JobsPage";
import { JobDetailsPage } from "../pages/JobDetailsPage";
import { WorkerDashboardPage } from "../pages/WorkerDashboardPage";
import { ProfilePage } from "../pages/ProfilePage";
import { VoiceProfilePage } from "../pages/VoiceProfilePage";
import { EmployerDashboardPage } from "../pages/EmployerDashboardPage";
import { PostJobPage } from "../pages/PostJobPage";
import { ApplicationsPage } from "../pages/ApplicationsPage";
import { ApplicantsPage } from "../pages/ApplicantsPage";
import { RecommendedWorkersPage } from "../pages/RecommendedWorkersPage";
import { NotFoundPage } from "../pages/NotFoundPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobDetailsPage />} />

        <Route
          path="/worker-dashboard"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.WORKER]}>
              <WorkerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/voice-profile"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.WORKER]}>
              <VoiceProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.WORKER]}>
              <ApplicationsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/employer-dashboard"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.EMPLOYER]}>
              <EmployerDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/post-job"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.EMPLOYER]}>
              <PostJobPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applicants/:jobId"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.EMPLOYER]}>
              <ApplicantsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/jobs/:jobId/recommended-workers"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.EMPLOYER]}>
              <RecommendedWorkersPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
