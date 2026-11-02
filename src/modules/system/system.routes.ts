import { Router } from "express";
import {
  downloadSebConfig,
  healthCheck,
  rootCheck,
} from "./system.controller";

export const healthRouter = Router();
healthRouter.get("/", rootCheck);
healthRouter.get("/health", healthCheck);

export const sebRouter = Router();
sebRouter.get("/config", downloadSebConfig);
