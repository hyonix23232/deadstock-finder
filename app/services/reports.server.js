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
    e.product.inventoryCount,
    e.daysSinceSale,
    e.reason,
    e.suggestedAction,
    e.flaggedAt.toISOString(),
    e.resolved ? "Yes" : "No",
    e.resolvedAt ? e.resolvedAt.toISOString() : "",
  ].map(escapeCsv));
  return [headers.join(","), ...rows.join("\n")].join("\n");
}

export function generateHtmlReport(entries, shop) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Dead Stock Report</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;max-width:1200px;margin:0 auto}
h1{color:#202223}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e1e3e5}
th{background:#f6f6f7;font-weight:600;color:#202223}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:500}
.badge-active{background:#fff0f0;color:#d82c0d}
.badge-resolved{background:#eff7ed;color:#008060}</style></head>
<body>
<h1>Dead Stock Finder Report</h1>
<p>Generated: ${new Date().toLocaleDateString()} | Shop: ${shop}</p>
<table>
<tr><th>Product</th><th>Price</th><th>Inventory</th><th>Days</th><th>Reason</th><th>Suggested Action</th><th>Status</th></tr>
${entries
  .map(
    (e) =>
      `<tr><td>${e.product.title}</td><td>$${e.product.price}</td><td>${e.product.inventoryCount}</td><td>${e.daysSinceSale}d</td><td>${e.reason}</td><td>${e.suggestedAction}</td><td><span class="badge ${e.resolved ? "badge-resolved" : "badge-active"}">${e.resolved ? "Resolved" : "Active"}</span></td></tr>`
  )
  .join("")}
</table></body></html>`;
}
