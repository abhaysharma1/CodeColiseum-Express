import { User } from "@/utils/auth";

declare global {
  namespace Express {
    interface Request {
      user?: User; // Add your custom property here, e.g., 'user'
    }
  }
}
