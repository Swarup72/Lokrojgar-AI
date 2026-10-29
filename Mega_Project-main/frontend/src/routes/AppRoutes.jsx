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
import { EditJobPage } from "../pages/EditJobPage";
import { ApplicationsPage } from "../pages/ApplicationsPage";
import { JobRequestsPage } from "../pages/JobRequestsPage";
import { ChatPage } from "../pages/ChatPage";
import { ApplicantsPage } from "../pages/ApplicantsPage";
import { RecommendedWorkersPage } from "../pages/RecommendedWorkersPage";
import { NotificationsPage } from "../pages/NotificationsPage";
import { WorkerAvailabilityPage } from "../pages/WorkerAvailabilityPage";
import { EmployerAppointmentsPage } from "../pages/EmployerAppointmentsPage";
import { NotFoundPage } from "../pages/NotFoundPage";

// Admin Panel Module
import { AdminLayout } from "../components/admin/AdminLayout";
import { AdminLoginPage } from "../pages/admin/AdminLoginPage";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage";
import { AdminWorkersPage } from "../pages/admin/AdminWorkersPage";
import { AdminEmployersPage } from "../pages/admin/AdminEmployersPage";
import { AdminJobsPage } from "../pages/admin/AdminJobsPage";
import { AdminApplicationsPage } from "../pages/admin/AdminApplicationsPage";
import { AdminReportsPage } from "../pages/admin/AdminReportsPage";
import { AdminRatingsPage } from "../pages/admin/AdminRatingsPage";
import { AdminAnnouncementsPage } from "../pages/admin/AdminAnnouncementsPage";
import { AdminAiMonitoringPage } from "../pages/admin/AdminAiMonitoringPage";
import { AdminAuditLogsPage } from "../pages/admin/AdminAuditLogsPage";

export function AppRoutes() {
  return (
    <Routes>
      {/* Dedicated Admin Portal Routes */}
      <Route path="/admin/login" element={<AdminLoginPage />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminDashboardPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/workers"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminWorkersPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/employers"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminEmployersPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/jobs"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminJobsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/applications"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminApplicationsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminReportsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ratings"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminRatingsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/announcements"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminAnnouncementsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ai-monitoring"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminAiMonitoringPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-logs"
        element={
          <ProtectedRoute allowedRoles={[USER_ROLES.ADMIN]}>
            <AdminLayout>
              <AdminAuditLogsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

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
            <ProtectedRoute allowedRoles={[USER_ROLES.WORKER, USER_ROLES.EMPLOYER]}>
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

        {/* Employer-initiated job requests, answered by the worker. */}
        <Route
          path="/job-requests"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.WORKER]}>
              <JobRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/worker-availability"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.WORKER]}>
              <WorkerAvailabilityPage />
            </ProtectedRoute>
          }
        />
        {/* Any authenticated user: a dual-role account can be the worker in one
            conversation and the employer in another, and the server authorizes
            per conversation, not by role. */}
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
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
          path="/jobs/:id/edit"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.EMPLOYER]}>
              <EditJobPage />
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
        <Route
          path="/employer-appointments"
          element={
            <ProtectedRoute allowedRoles={[USER_ROLES.EMPLOYER]}>
              <EmployerAppointmentsPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
