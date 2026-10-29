import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authorizeRoles } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  acceptAppointmentHandler,
  cancelAppointmentHandler,
  completeAppointmentHandler,
  createAppointment,
  deleteMyAvailabilityException,
  getAppointmentById,
  getMyAvailability,
  getWorkerAvailabilityPublic,
  listAppointments,
  postMyAvailabilityException,
  putMyAvailability,
  rejectAppointmentHandler,
} from "../controllers/scheduling.controller.js";
import {
  addExceptionValidator,
  appointmentActionValidator,
  appointmentIdParamValidator,
  createAppointmentValidator,
  getWorkerAvailabilityRangeValidator,
  listAppointmentsValidator,
  removeExceptionValidator,
  updateWeeklyAvailabilityValidator,
} from "../validators/scheduling.validator.js";

const workerAvailabilityRouter = Router();

workerAvailabilityRouter.use(verifyJWT);

// Worker manages own schedule & date exceptions
workerAvailabilityRouter.get(
  "/me/availability",
  authorizeRoles("worker"),
  getMyAvailability
);

workerAvailabilityRouter.put(
  "/me/availability",
  authorizeRoles("worker"),
  validate(updateWeeklyAvailabilityValidator),
  putMyAvailability
);

workerAvailabilityRouter.post(
  "/me/availability/exceptions",
  authorizeRoles("worker"),
  validate(addExceptionValidator),
  postMyAvailabilityException
);

workerAvailabilityRouter.delete(
  "/me/availability/exceptions/:exceptionId",
  authorizeRoles("worker"),
  validate(removeExceptionValidator),
  deleteMyAvailabilityException
);

// Authenticated users (employers/workers) view a worker's bookable slots
workerAvailabilityRouter.get(
  "/:workerId/availability",
  validate(getWorkerAvailabilityRangeValidator),
  getWorkerAvailabilityPublic
);

const appointmentRouter = Router();

appointmentRouter.use(verifyJWT);

appointmentRouter.post(
  "/",
  authorizeRoles("employer", "admin"),
  validate(createAppointmentValidator),
  createAppointment
);

appointmentRouter.get(
  "/",
  validate(listAppointmentsValidator),
  listAppointments
);

appointmentRouter.get(
  "/:appointmentId",
  validate(appointmentIdParamValidator),
  getAppointmentById
);

appointmentRouter.post(
  "/:appointmentId/accept",
  authorizeRoles("worker"),
  validate(appointmentActionValidator),
  acceptAppointmentHandler
);

appointmentRouter.post(
  "/:appointmentId/reject",
  authorizeRoles("worker"),
  validate(appointmentActionValidator),
  rejectAppointmentHandler
);

appointmentRouter.post(
  "/:appointmentId/cancel",
  authorizeRoles("worker", "employer", "admin"),
  validate(appointmentActionValidator),
  cancelAppointmentHandler
);

appointmentRouter.post(
  "/:appointmentId/complete",
  authorizeRoles("worker", "employer", "admin"),
  validate(appointmentActionValidator),
  completeAppointmentHandler
);

export { workerAvailabilityRouter, appointmentRouter };

