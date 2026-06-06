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
import internalRouter from "@/routes/internal.routes";
import permissionsRouter from "@/routes/permissions.route";
import publicAuthRouter from "@/routes/public.auth.route";
import notificationsRouter from "@/routes/notifications.route";
import cookieParser from "cookie-parser";
import path from "path";


const app: Application = express();

app.use(morgan("dev"));


//Headers Logger

// app.use((req: Request, _res: Response, next: NextFunction) => {
//   console.log(
//     `[Headers] ${req.method} ${req.url}:`,
//     JSON.stringify(req.headers, null, 2),
//   );
//   next();
// });

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-SafeExamBrowser-RequestHash",
      "X-SafeExamBrowser-ConfigKeyHash", // include all SEB headers you use
    ],
    credentials: true,
    optionsSuccessStatus: 200, // For legacy browser support
  }),
);

app.use("/api/auth", toNodeHandler(auth)); // Better Auth Api

app.use(cookieParser());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
});

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({ status: "UP" });
});

app.use("/api/teacher", teacherRouter);
app.use("/api/student", studentRouter);
app.use("/api/admin", adminRouter);
app.use("/api/problems", problemRouter);
app.use("/api/internal", internalRouter);
app.use("/api/permissions", permissionsRouter);
app.use("/api/public-auth", publicAuthRouter);


app.get("/api/seb/config", (req, res) => {
  const filePath = path.join(
    process.cwd(),
    "assets",
    "SEB_File.seb"
  );

  res.setHeader(
    "Content-Type",
    "application/octet-stream"
  );

  res.setHeader(
    "Content-Disposition",
    'attachment; filename="SEB_File.seb"'
  );

  res.sendFile(filePath);
});

// Notifications API
app.use("/api/notifications", notificationsRouter);

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
