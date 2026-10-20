// Session summary from two /v1/usage snapshots. Plan quota micros are micro-USD of provider cost
// (checked against the public deepseek-v4.1-flash rate). PAYG units are not verified, so no PAYG figure is shown.

export function usageSnapshot(body) {
  const q = body?.quota;
  const cost = q?.used_provider_cost_micros;
  if (!q || !Number.isFinite(cost)) return null;
  return {
    providerCost: cost,
    monthlyLimit: q.windows?.monthly?.limit_micros,
    paygBalance: body.payg?.balance_micros,
    paygSpend: body.payg?.current_period_spend_micros,
  };
}

export function usd(micros) {
  return `$${(micros / 1e6).toFixed(micros >= 10000 ? 4 : 6)}`;
}

export function costDelta(before, after) {
  return after.providerCost - before.providerCost;
}

export function paygChanged(before, after) {
  return after.paygBalance !== before.paygBalance || after.paygSpend !== before.paygSpend;
}

export function formatSummary(before, after, { free = false } = {}) {
  const cost = costDelta(before, after);
  const lines = [];
  if (cost > 0) {
    const pct = after.monthlyLimit > 0 ? ` (${((cost / after.monthlyLimit) * 100).toFixed(2)}% dari kuota bulanan)` : '';
    lines.push(`Kuota paket terpakai: ${usd(cost)}${pct}`);
  } else {
    lines.push(`Kuota paket terpakai: tidak ada perubahan terdeteksi${free ? ' (model gratis tidak memakai kuota)' : ''}.`);
  }
  if (paygChanged(before, after)) lines.push('Saldo PAYG berubah. Lihat rinciannya di Workspace.');
  lines.push('Ini selisih akun; pemakaian lain di akun yang sama ikut terhitung.');
  return lines.join('\n') + '\n';
}
