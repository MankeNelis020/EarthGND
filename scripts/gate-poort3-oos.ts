/**
 * Poort 3 OOS gate — leave-one-site-out on Lab snapshot / DB evidence.
 * Exit 0 = technical pass (still NOT production approval).
 * Exit 2 = insufficient data
 * Exit 1 = failed technical criteria
 */

import { loadEvidenceLabSnapshot } from '@/lib/evidence-lab/load-snapshot';
import { POORT3 } from '@/lib/evidence-lab/gate-config';

async function main() {
  console.log('=== Poort 3 OOS gate (leave-one-site-out) ===');
  console.log('Thresholds:', JSON.stringify(POORT3, null, 2));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('SKIP — Supabase env missing (no fail).');
    process.exit(0);
  }

  const snap = await loadEvidenceLabSnapshot();
  const oos = snap.oos;

  if (!oos || oos.folds.length === 0) {
    console.log('INSUFFICIENT DATA — no OOS folds');
    console.log('Status: NOT ENOUGH DATA');
    process.exit(2);
  }

  console.log(`Held-out sites: ${oos.heldOutSiteCount}`);
  console.log(`Folds: ${oos.folds.length}`);
  console.log(`Theory MAE: ${oos.theoryMae?.toFixed(3)}`);
  console.log(`Empirical MAE: ${oos.empiricalMae?.toFixed(3)}`);
  console.log(`Theory MAPE: ${oos.theoryMape?.toFixed(2)}%`);
  console.log(`Empirical MAPE: ${oos.empiricalMape?.toFixed(2)}%`);
  console.log(`Status: ${oos.status}`);
  if (oos.blockers.length) {
    console.log('Blockers:');
    for (const b of oos.blockers) console.log(`  - ${b}`);
  }

  console.log('\nNOTE: Passing this gate does NOT approve production.');
  console.log('Production prediction behavior remains unchanged unless ops flips env.');

  if (oos.passedTechnical) {
    console.log('RESULT: PASSING TECHNICAL GATES → eligible for human review only');
    process.exit(0);
  }

  console.log('RESULT: FAIL');
  process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
