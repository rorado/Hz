"use server";

import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { normalizeArabicName, isFullName } from "@/lib/arabic-name";
import { withDocumentNumber } from "@/lib/document-number";
import { getDictionary } from "@/i18n/server";
import { formatMessage } from "@/i18n/format";
import type { Dictionary } from "@/i18n/dictionaries";

function buildSchema(t: Dictionary) {
  return z.object({
    customerName: z
      .string()
      .min(1, t.cart.nameRequiredError)
      .trim()
      .refine(isFullName, t.cart.fullNameRequiredError),
    customerPhone: z.string().min(8, t.cart.invalidPhoneError).trim(),
    customerEmail: z
      .string()
      .email(t.cart.invalidEmailError)
      .optional()
      .or(z.literal("")),
    items: z
      .array(
        z.object({
          productId: z.string(),
          quantity: z.number().min(1),
        }),
      )
      .min(1, t.cart.minOneItemError),
    notes: z.string().optional(),
  });
}

export async function createOrderFromCart(
  data: z.infer<ReturnType<typeof buildSchema>>,
) {
  const t = await getDictionary();
  const createOrderFromCartSchema = buildSchema(t);

  try {
    const validatedData = createOrderFromCartSchema.parse(data);

    // Verify all products exist and have sufficient stock
    const products = await prisma.product.findMany({
      where: {
        id: {
          in: validatedData.items.map((item) => item.productId),
        },
      },
    });

    if (products.length !== validatedData.items.length) {
      return {
        success: false,
        error: t.cart.productUnavailableError,
      };
    }

    // Check stock for each item
    for (const item of validatedData.items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product || product.quantity.toNumber() < item.quantity) {
        return {
          success: false,
          error: formatMessage(t.cart.insufficientQuantityErrorTemplate, {
            product: product?.name ?? "",
          }),
        };
      }
    }

    // Calculate total
    let total = 0;
    const orderItems = validatedData.items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const lineTotal = Number(product.price1 || 0) * item.quantity;
      total += lineTotal;
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: product.price1 || 0,
      };
    });

    // Create or find customer — phone number is the real identifier here
    // (unlike names, which vary in spelling), so reuse an existing customer
    // whenever this phone number is already on file instead of creating a
    // duplicate record for the same person.
    const normalizedName = normalizeArabicName(validatedData.customerName);
    let customer = await prisma.customer.findFirst({
      where: { phone: validatedData.customerPhone },
    });

    if (customer) {
      const updates: { name?: string; nameNormalized?: string; email?: string } =
        {};
      if (customer.name !== validatedData.customerName) {
        updates.name = validatedData.customerName;
        updates.nameNormalized = normalizedName;
      }
      if (validatedData.customerEmail && customer.email !== validatedData.customerEmail) {
        updates.email = validatedData.customerEmail;
      }
      if (Object.keys(updates).length > 0) {
        customer = await prisma.customer.update({
          where: { id: customer.id },
          data: updates,
        });
      }
    } else {
      customer = await prisma.customer.create({
        data: {
          name: validatedData.customerName,
          nameNormalized: normalizedName,
          phone: validatedData.customerPhone,
          email: validatedData.customerEmail || null,
        },
      });
    }

    // Create order
    const order = await withDocumentNumber("ORDER", (orderNumber) =>
      prisma.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          customerName: validatedData.customerName,
          customerPhone: validatedData.customerPhone,
          customerEmail: validatedData.customerEmail || null,
          status: "PENDING",
          total: total.toString(),
          items: {
            create: orderItems,
          },
        },
        include: {
          items: {
            include: {
              product: true,
            },
          },
          customer: true,
        },
      }),
    );

    return {
      success: true,
      orderId: order.id,
      message: t.cart.successMessage,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      const message = firstError?.message || t.cart.invalidDataError;
      return {
        success: false,
        error: message,
      };
    }
    return {
      success: false,
      error: t.cart.createError,
    };
  }
}
