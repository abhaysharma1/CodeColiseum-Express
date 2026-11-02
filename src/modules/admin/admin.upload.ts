import multer from "multer";

/**
 * Admin uploads are buffered in memory because the payloads are immediately
 * forwarded to S3 or parsed as spreadsheets; nothing is written to disk.
 */
const memoryStorage = multer.memoryStorage();

export const performanceTestCaseUpload = multer({
  storage: memoryStorage,
}).fields([
  { name: "input", maxCount: 1 },
  { name: "output", maxCount: 1 },
]);

export const excelUpload = multer({ storage: memoryStorage });

export const singleExcelUpload = excelUpload.single("file");
