import { z } from "zod";

export const signUpSchema = z.object({
  username: z.string().min(5).max(20),
  email: z.string().email(),
  password: z.string().min(8),
});

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const sendRequestSchema = z.object({
  sender_email: z.string.email(),
  oppEmail: z.string.email(),
});
