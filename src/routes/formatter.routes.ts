import { Router } from "express";
import { formatCode } from "@/controllers/formatter.controller";
import { isLoggedIn } from "@/middleware/isLoggedin.middleware";

const router = Router();

router.post("/format", isLoggedIn, formatCode);

export default router;
