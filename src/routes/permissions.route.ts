import { checkPermission } from "@/controllers/permissions.controllers";
import { isLoggedIn } from "@/middleware/isLoggedin.middleware";
import { Router } from "express";

const router = Router();

router.use(isLoggedIn);
router.get("/check", checkPermission);

export default router;
