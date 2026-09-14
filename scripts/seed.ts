/**
 * Optional Node alternative to seed.sql.
 *
 * seed.sql is the primary path — paste it into the Supabase SQL editor, no
 * terminal required. This script exists for anyone who prefers to seed from a
 * checkout. It is idempotent in the same way: categories upsert on `key`,
 * items insert only when absent.
 *
 *   npx tsx scripts/seed.ts
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * The service role key is required because the template tables are read-only
 * under RLS.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import seed from '../partner-visa-checklist-seed.json';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n' +
      'Copy .env.example to .env.local and fill them in.',
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Seeding ${seed.categories.length} categories…`);

  const { data: categories, error: categoryError } = await supabase
    .from('checklist_categories')
    .upsert(
      seed.categories.map((c) => ({
        key: c.key,
        name: c.name,
        pillar: c.pillar,
        description: c.description,
        sort_order: c.sort_order,
      })),
      { onConflict: 'key' },
    )
    .select('id, key');

  if (categoryError) throw new Error(`Categories failed: ${categoryError.message}`);

  const idByKey = new Map((categories ?? []).map((c) => [c.key as string, c.id as string]));

  // Only insert items that aren't already there, matched on (category, title).
  const { data: existing, error: existingError } = await supabase
    .from('checklist_items')
    .select('category_id, title');

  if (existingError) throw new Error(`Could not read existing items: ${existingError.message}`);

  const seen = new Set((existing ?? []).map((i) => `${i.category_id}::${i.title}`));

  const toInsert = seed.items
    .map((item, index) => {
      const categoryId = idByKey.get(item.category_key);
      if (!categoryId) {
        throw new Error(`Item "${item.title}" references unknown category "${item.category_key}"`);
      }
      return {
        category_id: categoryId,
        title: item.title,
        description: null,
        applies_to: item.applies_to,
        required: item.required,
        form_reference: item.form_reference,
        guidance: item.guidance,
        sort_order: index,
      };
    })
    .filter((item) => !seen.has(`${item.category_id}::${item.title}`));

  if (toInsert.length === 0) {
    console.log(`All ${seed.items.length} items already present — nothing to insert.`);
  } else {
    const { error: itemError } = await supabase.from('checklist_items').insert(toInsert);
    if (itemError) throw new Error(`Items failed: ${itemError.message}`);
    console.log(`Inserted ${toInsert.length} items.`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
