import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env";
import { AppError } from "../utils/ApiError";

export const uploadImage = async (
  buffer: Buffer,
  folder: string,
): Promise<string> => {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    throw new AppError(503, "Image storage is not configured");
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });

  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `load-shedding/${folder}`, resource_type: "image" },
      (error, result) => {
        if (error || !result)
          return reject(new AppError(502, "Image upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
};
