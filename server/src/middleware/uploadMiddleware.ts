import multer from 'multer';

// Store in memory so we can run QR detection on the buffer directly
const storage = multer.memoryStorage();

export const uploadRecordImage = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (PNG, JPG, JPEG, WEBP) are allowed') as any, false);
    }
  },
});

export const uploadSpreadsheet = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.includes('spreadsheetml') ||
      file.mimetype.includes('excel') ||
      file.mimetype.includes('csv') ||
      file.mimetype === 'application/octet-stream' ||
      file.originalname.match(/\.(xlsx|xls|csv)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only spreadsheet files (.xlsx, .xls, .csv) are allowed') as any, false);
    }
  },
});

