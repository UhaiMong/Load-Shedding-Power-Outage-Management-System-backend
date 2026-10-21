import { z } from "zod";

const email = z
	.email("Invalid email address")
	.transform((v) => v.toLowerCase());

export const registerSchema = z.object({
	name: z.string().trim().min(2).max(100),
	email,
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.max(128)
		.regex(/[A-Za-z]/, "Password must contain a letter")
		.regex(/\d/, "Password must contain a number"),
	phone: z
		.string()
		.regex(/^\+?[0-9]{7,15}$/, "Invalid phone number")
		.optional(),
	address: z.string().trim().max(255).optional(),
	meterNumber: z.string().trim().min(3).max(30).optional(),
	areaId: z.string().min(1).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
	email,
	password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;
