import { z } from "zod";
import { isFullName } from "@/lib/arabic-name";

export const customerSchema = z.object({
  name: z
    .string()
    .min(2, { error: "الاسم يجب أن يتكون من حرفين على الأقل" })
    .refine(isFullName, {
      error: "الرجاء إدخال الاسم الكامل (الاسم واللقب)",
    }),
  phone: z
    .string()
    .min(6, { error: "رقم الهاتف غير صحيح" }),
  email: z.union([z.email({ error: "البريد الإلكتروني غير صحيح" }), z.literal("")]).optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  isFavorite: z.boolean(),
  // Undefined = leave the existing photo untouched (callers that don't
  // manage a photo, e.g. the order-flow customer edit, never send this
  // field); null = explicitly remove it; an object = set/replace it.
  image: z
    .object({ publicId: z.string(), secureUrl: z.string() })
    .nullable()
    .optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
