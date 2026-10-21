import multer from "multer";
import { AppError } from "../utils/ApiError";

export const uploadImage = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024, files: 1 },
	fileFilter: (_req, file, cb) => {
		if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) return cb(null, true);
		cb(new AppError(400, "Only JPEG, PNG or WEBP images are allowed"));
	},
});
