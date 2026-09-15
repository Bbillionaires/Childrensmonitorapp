import { z } from "zod";

// A deliberately strong-ish floor: parent accounts guard access to a closed child
// environment, so weak-password defaults are not acceptable here.
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter")
  .refine((value) => /[0-9]/.test(value), "Password must include a number");

export const emailSchema = z.string().trim().toLowerCase().email();

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;

export const setPinRequestSchema = z.object({
  currentPassword: z.string().min(1),
  pin: z
    .string()
    .regex(/^\d{4,8}$/, "PIN must be 4-8 digits"),
});
export type SetPinRequest = z.infer<typeof setPinRequestSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSeconds: z.number(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const parentProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  timezone: z.string(),
  mfaEnabled: z.boolean(),
  pinConfigured: z.boolean(),
  createdAt: z.string(),
});
export type ParentProfile = z.infer<typeof parentProfileSchema>;
