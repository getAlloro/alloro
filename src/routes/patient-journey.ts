import express from "express";
import { PatientJourneyController } from "../controllers/patient-journey/PatientJourneyController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware, locationScopeMiddleware } from "../middleware/rbac";

const router = express.Router();

// Same middleware stack as gbp-automation (§7.2/§11.1): authenticate, resolve
// role + organization, then resolve the accessible location scope. Tenant
// identity for every handler comes from this stack, never from client input.
router.use(authenticateToken, rbacMiddleware, locationScopeMiddleware);

router.get("/", PatientJourneyController.getPatientJourney);

export default router;
