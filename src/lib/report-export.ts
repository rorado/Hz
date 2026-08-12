import "server-only";
import ExcelJS from "exceljs";

const IMAGE_URL_PATTERN = /^https?:\/\/.+\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i;

function imageUrls(value: string | number): string[] {
  return String(value ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => IMAGE_URL_PATTERN.test(url));
}

function asPngUrl(url: string): string {
  // ExcelJS cannot embed WebP. Cloudinary can return the same asset as PNG.
  return url.includes("/upload/")
    ? url.replace("/upload/", "/upload/f_png/")
    : url;
}

export function buildCsv(headers: string[], rows: (string | number)[][]) {
  const escapeCell = (value: string | number) => {
    const str = String(value ?? "");
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers, ...rows].map((row) =>
    row.map((cell) => escapeCell(imageUrls(cell).length > 0 ? "" : cell)).join(","),
  );
  return "﻿" + lines.join("\n");
}

export async function buildXlsx(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ rightToLeft: true }],
  });
  sheet.addRow(headers);
  rows.forEach((row) =>
    sheet.addRow(row.map((cell) => (imageUrls(cell).length > 0 ? "" : cell))),
  );
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((column) => {
    column.width = 22;
  });

  await Promise.all(
    rows.flatMap((row, rowIndex) =>
      row.flatMap((cell, columnIndex) => {
        const urls = imageUrls(cell);
        if (urls.length === 0) return [];

        return [
          (async () => {
            try {
              const response = await fetch(asPngUrl(urls[0]));
              if (!response.ok) return;
              const base64 = Buffer.from(await response.arrayBuffer()).toString("base64");
              const imageId = workbook.addImage({
                base64: `data:image/png;base64,${base64}`,
                extension: "png",
              });
              sheet.getRow(rowIndex + 2).height = 52;
              sheet.addImage(imageId, {
                tl: { col: columnIndex + 0.1, row: rowIndex + 1.1 },
                ext: { width: 60, height: 60 },
                editAs: "oneCell",
              });
            } catch {
              // Leave the cell empty when a remote image is unavailable;
              // never fall back to exposing its raw URL.
            }
          })(),
        ];
      }),
    ),
  );
  return workbook.xlsx.writeBuffer();
}
