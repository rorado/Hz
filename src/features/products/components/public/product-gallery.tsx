"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const DEFAULT_PRODUCT_IMAGE = "/cart.jpg";

export function ProductGallery({
  images,
  productName,
}: {
  images: { secureUrl: string }[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex];

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted">
        <Image
          src={active?.secureUrl ?? DEFAULT_PRODUCT_IMAGE}
          alt={productName}
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 40vw, 100vw"
          priority
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.secureUrl}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "relative size-16 shrink-0 overflow-hidden rounded-lg border-2",
                index === activeIndex
                  ? "border-primary"
                  : "border-transparent",
              )}
            >
              <Image
                src={image.secureUrl}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
