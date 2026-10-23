import { round2 } from "./helpers";

/** Tiered residential tariff (BDT per kWh). Values are configurable constants. */
const SLABS = [
  { upTo: 75, rate: 5.26 },
  { upTo: 200, rate: 7.2 },
  { upTo: 300, rate: 7.59 },
  { upTo: 400, rate: 8.02 },
  { upTo: 600, rate: 12.67 },
  { upTo: Number.POSITIVE_INFINITY, rate: 14.61 },
] as const;
const DEMAND_CHARGE = 42;
const VAT_RATE = 0.05;

export const calculateBill = (units: number) => {
  let remaining = units;
  let previousLimit = 0;
  let energyCharge = 0;
  const slabs: { units: number; rate: number; charge: number }[] = [];

  for (const slab of SLABS) {
    const slabUnits = Math.min(remaining, slab.upTo - previousLimit);
    if (slabUnits <= 0) break;
    const charge = round2(slabUnits * slab.rate);
    slabs.push({ units: round2(slabUnits), rate: slab.rate, charge });
    energyCharge += charge;
    remaining -= slabUnits;
    previousLimit = slab.upTo;
  }

  const subtotal = energyCharge + DEMAND_CHARGE;
  const vat = round2(subtotal * VAT_RATE);
  return {
    amount: round2(subtotal + vat),
    breakdown: { slabs, energyCharge: round2(energyCharge), demandCharge: DEMAND_CHARGE, vatRate: VAT_RATE, vat },
  };
};
