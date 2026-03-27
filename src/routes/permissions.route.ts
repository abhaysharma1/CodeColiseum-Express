import { checkPermission, getMyPermissions } from "@/controllers/permissions.controllers";
import { isLoggedIn } from "@/middleware/isLoggedin.middleware";
import { Router } from "express";

const router = Router();

router.use(isLoggedIn);
router.get("/check", checkPermission);
router.get("/me", getMyPermissions);

export default router;
