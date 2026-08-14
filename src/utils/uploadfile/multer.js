import multer from "multer";

export const uploadFile = () => multer({ storage: multer.memoryStorage() });
