import { CartPageContent } from "@/features/cart/components/cart-page-content";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata() {
  const t = await getDictionary();
  return { title: t.publicNav.cart };
}

export default function CartPage() {
  return <CartPageContent />;
}
