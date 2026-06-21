function escapeCsv(val) {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsv(entries) {
  const headers = ["Product", "Price", "Inventory", "Days Since Sale", "Reason", "Suggested Action", "Flagged At", "Resolved", "Resolved At"];
  const rows = entries.map((e) => [
    e.product.title,
    e.product.price,
    e.product.inventoryCount === -1 ? "Untracked" : e.product.inventoryCount,
    e.daysSinceSale,
    e.reason,
    e.suggestedAction,
    e.flaggedAt.toISOString(),
    e.resolved ? "Yes" : "No",
    e.resolvedAt ? e.resolvedAt.toISOString() : "",
  ].map(escapeCsv));
  return [headers.join(","), ...rows.join("\n")].join("\n");
}


