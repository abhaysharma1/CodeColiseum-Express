import "dotenv/config";
import express, { Application, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { toNodeHandler } from "better-auth/node";
import { auth } from "@/utils/auth";
import teacherRouter from "@/routes/teacher.route";
import problemRouter from "@/routes/problem.route";
import studentRouter from "@/routes/student.routes";
import adminRouter from "@/routes/admin.route";
import internalRouter from "@/routes/internal.routes"

const app: Application = express();

app.use(morgan("dev"));

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    optionsSuccessStatus: 200, // For legacy browser support
  }),
);

app.use("/api/auth", toNodeHandler(auth)); // Better Auth Api

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ status: "UP" });
});

app.use("/teacher", teacherRouter);

app.use("/student", studentRouter);

app.use("/admin", adminRouter);

app.use("/problems", problemRouter);

app.use("/internal",internalRouter)

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: "Resource not found" });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const statusCode = err.statusCode || 500;
  console.error(`[Error] ${err.message}`);

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

export default app;
