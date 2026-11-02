// Compatibility wrapper — teacher/admin role checks are centralized.
export { requireTeacher as isTeacher } from "@/middleware/authentication";
