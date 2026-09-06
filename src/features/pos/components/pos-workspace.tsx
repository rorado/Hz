"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Search,
  LogOut,
  LayoutDashboard,
  ChevronDown,
  Loader2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BrandMark } from "@/components/shared/brand-mark";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { logout } from "@/features/auth/actions";
import { useLocale } from "@/i18n/locale-provider";
import { formatMessage } from "@/i18n/format";
import { formatCurrency } from "@/lib/currency";
import type { Locale } from "@/i18n/config";
import { createPosSale, findPosProductByBarcodeAction } from "@/features/pos/actions";
import type { PosCustomer, PosProduct } from "@/features/pos/queries";
import { CustomerStep } from "./customer-step";
import { CategoryRail, type PosCategory } from "./category-rail";
import { ProductGrid } from "./product-grid";
import { CartPanel } from "./cart-panel";
import { QuantityDialog } from "./quantity-dialog";
import { SaleSuccessDialog } from "./sale-success-dialog";
import { HoldSalesMenu } from "./hold-sales-menu";
import { useHeldSales } from "./use-held-sales";
import {
  readPosSession,
  writePosSession,
  clearPosSession,
} from "./pos-session";
import type { CartLine, HeldSale, PosPaymentMethod, SaleResult } from "./types";

type ProductFeed = { items: PosProduct[]; total: number; nextOffset: number | null };
type CategoryFeed = {
  total: number;
  items: PosCategory[];
  nextOffset: number | null;
};

function langFromLocale(locale: Locale): SaleResult["language"] {
  return locale === "en" ? "EN" : locale === "fr" ? "FR" : "AR";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function PosWorkspace({
  adminName,
  logoUrl,
  locale,
  canDashboard,
  initialCategories,
  initialProducts,
  initialCustomers,
}: {
  adminName: string;
  logoUrl: string | null;
  locale: Locale;
  canDashboard: boolean;
  initialCategories: CategoryFeed;
  initialProducts: ProductFeed;
  initialCustomers: { items: PosCustomer[]; hasMore: boolean };
}) {
  const { t } = useLocale();

  // Server and the first client render always start from the same defaults
  // (no reading of sessionStorage during render) — the saved in-progress
  // sale is applied after mount, below, so there's no hydration mismatch.
  const [step, setStep] = useState<"customer" | "sell">("customer");
  const [customer, setCustomer] = useState<PosCustomer | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [saleToken, setSaleToken] = useState(() => crypto.randomUUID());
  const [method, setMethod] = useState<PosPaymentMethod>("CASH");
  const [paidAmount, setPaidAmount] = useState("");
  const [paidTouched, setPaidTouched] = useState(false);
  const [sale, setSale] = useState<SaleResult | null>(null);
  const [negativeBalance, setNegativeBalance] = useState<{
    available: number;
  } | null>(null);
  const [excessPrompt, setExcessPrompt] = useState<{ excess: number } | null>(
    null,
  );
  const [resumedHeldId, setResumedHeldId] = useState<string | null>(null);
  const [dialogProduct, setDialogProduct] = useState<PosProduct | null>(null);
  const [mounted, setMounted] = useState(false);

  const [activeCategory, setActiveCategory] = useState("ALL");
  const [activeCategoryName, setActiveCategoryName] = useState("");
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();
  const { heldSales, hold, remove } = useHeldSales();

  // Restore the in-progress sale (survives the full reload a language
  // change triggers, and an accidental refresh). setState is deferred a
  // tick so it doesn't run synchronously inside the effect.
  useEffect(() => {
    const saved = readPosSession();
    const id = setTimeout(() => {
      if (saved) {
        if (saved.step) setStep(saved.step);
        if ("customer" in saved) setCustomer(saved.customer ?? null);
        if (saved.lines) setLines(saved.lines);
        if (saved.saleToken) setSaleToken(saved.saleToken);
        if (saved.method) setMethod(saved.method);
        if ("paidAmount" in saved) setPaidAmount(saved.paidAmount ?? "");
        if ("paidTouched" in saved) setPaidTouched(Boolean(saved.paidTouched));
        if ("resumedHeldId" in saved)
          setResumedHeldId(saved.resumedHeldId ?? null);
        if (saved.activeCategory) setActiveCategory(saved.activeCategory);
        if ("activeCategoryName" in saved)
          setActiveCategoryName(saved.activeCategoryName ?? "");
        if ("sale" in saved) setSale(saved.sale ?? null);
      }
      setMounted(true);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery), 250);
    return () => clearTimeout(id);
  }, [rawQuery]);

  // Mirror the in-progress sale to sessionStorage — only after the restore
  // above has run, so the saved sale isn't clobbered with defaults first.
  useEffect(() => {
    if (!mounted) return;
    writePosSession({
      step,
      customer,
      lines,
      saleToken,
      method,
      paidAmount,
      paidTouched,
      resumedHeldId,
      activeCategory,
      activeCategoryName,
      sale,
    });
  }, [
    mounted,
    step,
    customer,
    lines,
    saleToken,
    method,
    paidAmount,
    paidTouched,
    resumedHeldId,
    activeCategory,
    activeCategoryName,
    sale,
  ]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onChange);
    onChange();

    function enterFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    }
    // Default to fullscreen, like pressing F11 on open. No browser will
    // honor requestFullscreen() without a user gesture in the same event —
    // that's a hard platform restriction (Chrome/Firefox/Safari all enforce
    // it), so a bare call right on mount is silently rejected on every
    // reload. The listeners below catch the cashier's very first pointer,
    // touch or key interaction anywhere on the page instead — still a valid
    // gesture — captured before any inner element can stop it from
    // bubbling, so fullscreen engages on that very first tap/click rather
    // than needing a second, separate one on the toggle button.
    enterFullscreen();
    const gestureEvents = ["pointerdown", "touchstart", "keydown"] as const;
    gestureEvents.forEach((type) =>
      document.addEventListener(type, enterFullscreen, {
        once: true,
        capture: true,
      }),
    );

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      gestureEvents.forEach((type) =>
        document.removeEventListener(type, enterFullscreen, { capture: true }),
      );
    };
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  const cartQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const line of lines) map[line.product.id] = line.quantity;
    return map;
  }, [lines]);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * l.product.price1, 0),
    [lines],
  );
  const paidValue = paidTouched
    ? paidAmount
    : total > 0
      ? String(round2(total))
      : "";

  const categoryName =
    activeCategory === "ALL"
      ? t.pos.allCategories
      : activeCategoryName ||
        (initialCategories.items.find((c) => c.id === activeCategory)?.name ??
          t.pos.allCategories);

  function quickAdd(product: PosProduct) {
    setLines((prev) => {
      const line = prev.find((l) => l.product.id === product.id);
      if (!line) return [...prev, { product, quantity: 1 }];
      return prev.map((l) =>
        l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
      );
    });
  }

  function addLineWithQuantity(product: PosProduct, quantity: number) {
    setLines((prev) => {
      const exists = prev.some((l) => l.product.id === product.id);
      if (!exists) return [...prev, { product, quantity }];
      return prev.map((l) =>
        l.product.id === product.id ? { ...l, quantity } : l,
      );
    });
  }

  function changeQty(productId: string, delta: number) {
    setLines((prev) => {
      const line = prev.find((l) => l.product.id === productId);
      if (!line) return prev;
      const q = line.quantity + delta;
      if (q <= 0) return prev.filter((l) => l.product.id !== productId);
      return prev.map((l) =>
        l.product.id === productId ? { ...l, quantity: q } : l,
      );
    });
  }

  function setQuantity(productId: string, quantity: number) {
    setLines((prev) => {
      if (quantity <= 0) return prev.filter((l) => l.product.id !== productId);
      return prev.map((l) =>
        l.product.id === productId
          ? { ...l, quantity: Math.round(quantity * 1000) / 1000 }
          : l,
      );
    });
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function resetSale() {
    clearPosSession();
    setLines([]);
    setCustomer(null);
    setMethod("CASH");
    setPaidAmount("");
    setPaidTouched(false);
    setSale(null);
    setResumedHeldId(null);
    setDialogProduct(null);
    setSaleToken(crypto.randomUUID());
    setActiveCategory("ALL");
    setActiveCategoryName("");
    setStep("customer");
  }

  // "Edit sale" from the success dialog: the invoice has just been reversed
  // server-side, and the cart / customer / payment are all still in state,
  // so just drop back into the register with a fresh token — paying again
  // creates a brand-new invoice from whatever the cashier changes.
  function reopenSaleForEdit() {
    setSale(null);
    setResumedHeldId(null);
    setSaleToken(crypto.randomUUID());
    setStep("sell");
  }

  async function handleBarcode(barcode: string) {
    const product = await findPosProductByBarcodeAction(barcode);
    if (!product) {
      toast.error(t.common.barcodeProductNotFound);
      return;
    }
    quickAdd(product);
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && rawQuery.trim()) {
      e.preventDefault();
      const term = rawQuery.trim();
      findPosProductByBarcodeAction(term).then((product) => {
        if (product) {
          quickAdd(product);
          setRawQuery("");
        }
      });
    }
  }

  function handlePay(opts?: {
    allowNegativeBalance?: boolean;
    excessToBalance?: boolean;
  }) {
    if (!customer || lines.length === 0) return;
    const amount = Number(paidValue) || 0;

    // Any overpayment (except من الرصيد, which can't overpay itself) gets a
    // dialog first: add the extra to the customer's balance, or not
    // (default no — cash change / discarded).
    if (
      opts?.excessToBalance === undefined &&
      method !== "BALANCE" &&
      amount > total + 0.005
    ) {
      setExcessPrompt({ excess: round2(amount - total) });
      return;
    }

    const excessToBalance = opts?.excessToBalance ?? false;
    startTransition(async () => {
      const result = await createPosSale({
        saleToken,
        customerId: customer.id,
        language: langFromLocale(locale),
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
        })),
        payment: {
          method,
          amount,
          allowNegativeBalance: opts?.allowNegativeBalance,
          excessToBalance,
        },
      });

      if ("error" in result) {
        if (result.code === "INSUFFICIENT_BALANCE") {
          setNegativeBalance({ available: result.available ?? 0 });
          return;
        }
        toast.error(result.error);
        return;
      }

      if (resumedHeldId) remove(resumedHeldId);
      setSale({
        invoiceId: result.invoiceId,
        invoiceNumber: result.invoiceNumber,
        customerName: result.customerName,
        total: result.total,
        paid: result.paid,
        change: result.change,
        credited: result.credited,
        method,
        language: langFromLocale(locale),
      });
    });
  }

  function handleHold() {
    if (!customer || lines.length === 0) return;
    hold({
      id: crypto.randomUUID(),
      customer,
      lines,
      createdAt: Date.now(),
    });
    toast.success(t.pos.saleHeldToast);
    resetSale();
  }

  function handleResume(held: HeldSale) {
    setCustomer(held.customer);
    setLines(held.lines);
    setResumedHeldId(held.id);
    setSaleToken(crypto.randomUUID());
    setMethod("CASH");
    setPaidAmount("");
    setPaidTouched(false);
    setStep("sell");
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4">
        <div className="flex shrink-0 items-center gap-2">
          <BrandMark size="md" logoUrl={logoUrl} />
          <span className="hidden text-sm font-bold tracking-wide sm:inline">
            {t.pos.title}
          </span>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            disabled={step !== "sell"}
            placeholder={t.pos.productSearchPlaceholder}
            className="ps-9 pe-10"
          />
          <kbd className="pointer-events-none absolute inset-y-0 end-2 my-auto hidden h-5 items-center rounded border px-1 text-[10px] text-muted-foreground sm:flex">
            F2
          </kbd>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? t.pos.exitFullscreen : t.pos.enterFullscreen}
            aria-label={isFullscreen ? t.pos.exitFullscreen : t.pos.enterFullscreen}
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
          <LocaleSwitcher />
          <HoldSalesMenu
            heldSales={heldSales}
            onResume={handleResume}
            onDelete={remove}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="sm" className="gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {adminName ? adminName.charAt(0) : "?"}
                  </span>
                  <span className="hidden max-w-24 truncate sm:inline">
                    {adminName}
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  {adminName}
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              {canDashboard && (
                <DropdownMenuItem
                  nativeButton={false}
                  render={<a href="/dashboard" />}
                >
                  <LayoutDashboard />
                  {t.pos.backToDashboard}
                </DropdownMenuItem>
              )}
              <form action={logout}>
                <DropdownMenuItem
                  variant="destructive"
                  nativeButton
                  render={<button type="submit" className="w-full" />}
                >
                  <LogOut />
                  {t.pos.signOut}
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {!mounted ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : step === "customer" || !customer ? (
        <CustomerStep
          initialCustomers={initialCustomers}
          onSelect={(c) => {
            setCustomer(c);
            setStep("sell");
          }}
        />
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <CategoryRail
            initial={initialCategories}
            activeId={activeCategory}
            onSelect={(id, name) => {
              setActiveCategory(id);
              setActiveCategoryName(id === "ALL" ? "" : name);
            }}
            onBarcodeScan={handleBarcode}
          />
          <ProductGrid
            initial={initialProducts}
            categoryId={activeCategory}
            query={query}
            categoryName={categoryName}
            cartQuantities={cartQuantities}
            onAddProduct={(p) => setDialogProduct(p)}
            onIncrement={(p) => changeQty(p.id, 1)}
            onDecrement={(p) => changeQty(p.id, -1)}
          />
          <CartPanel
            customer={customer}
            customerBalance={customer.balance}
            lines={lines}
            method={method}
            paidAmount={paidValue}
            isPending={isPending}
            onChangeCustomer={() => setStep("customer")}
            onClearCustomer={resetSale}
            onSetQuantity={setQuantity}
            onRemove={removeLine}
            onClearCart={() => setLines([])}
            onHold={handleHold}
            onSetMethod={setMethod}
            onSetPaidAmount={(v) => {
              setPaidTouched(true);
              setPaidAmount(v);
            }}
            onPay={() => handlePay()}
          />
        </div>
      )}

      {dialogProduct && (
        <QuantityDialog
          key={dialogProduct.id}
          product={dialogProduct}
          initialQuantity={
            lines.find((l) => l.product.id === dialogProduct.id)?.quantity ?? 1
          }
          onConfirm={(quantity) => {
            addLineWithQuantity(dialogProduct, quantity);
            setDialogProduct(null);
          }}
          onClose={() => setDialogProduct(null)}
        />
      )}

      <SaleSuccessDialog
        sale={sale}
        onNewSale={resetSale}
        onEdit={reopenSaleForEdit}
      />

      <AlertDialog
        open={negativeBalance !== null}
        onOpenChange={(open) => !open && setNegativeBalance(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.invoices.insufficientBalanceTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {negativeBalance &&
                formatMessage(t.pos.negativeBalanceConfirm, {
                  available: formatCurrency(negativeBalance.available, locale),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setNegativeBalance(null);
                handlePay({ allowNegativeBalance: true, excessToBalance: false });
              }}
            >
              {t.invoices.insufficientBalanceGoNegative}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={excessPrompt !== null}
        onOpenChange={(open) => !open && setExcessPrompt(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.invoices.excessPaymentTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {excessPrompt &&
                formatMessage(t.pos.excessToBalancePrompt, {
                  excess: formatCurrency(excessPrompt.excess, locale),
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setExcessPrompt(null);
                handlePay({ excessToBalance: true });
              }}
            >
              {t.invoices.excessPaymentAddToBalance}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExcessPrompt(null);
                handlePay({ excessToBalance: false });
              }}
            >
              {t.invoices.excessPaymentDiscard}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
