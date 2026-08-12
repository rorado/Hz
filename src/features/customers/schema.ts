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
});

export type CustomerInput = z.infer<typeof customerSchema>;
