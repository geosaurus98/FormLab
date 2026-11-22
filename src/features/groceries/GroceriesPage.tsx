import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Download, Package, Plus, ShoppingCart, Trash2, Check } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, CardTitle, Checkbox, EmptyState, Field, Input, NumberInput, PageHeader, Select, Sheet, Tabs, Notice } from '../../components/ui';
import { useToast } from '../../components/toast';
import { CookNav } from '../recipes/RecipesPage';
import { estimateListCost, groceryListToText, type GroceryItem, type GroceryList } from '../../domain/recipes/shopping';
import { updateGroceryList } from '../../db/plannerService';
import { downloadText } from '../../db/backup';
import { GROCERY_CATEGORIES, type GroceryCategory } from '../../domain/recipes/types';
import { ALL_UNITS } from '../../lib/units';
import { formatNZD, nowIso } from '../../lib/utils';
import { newId } from '../../lib/id';
import { formatDateKey, isoToDateKey } from '../../lib/dates';

export function GroceriesPage() {
  const [tab, setTab] = useState<'list' | 'pantry' | 'prices'>('list');
  return (
    <div className="space-y-4">
      <CookNav />
      <PageHeader title="Groceries" />
      <Tabs value={tab} onChange={setTab} options={[{ value: 'list', label: 'Shopping list' }, { value: 'pantry', label: 'Pantry' }, { value: 'prices', label: 'Prices & packs' }]} />
      {tab === 'list' && <ListTab />}
      {tab === 'pantry' && <PantryTab />}
      {tab === 'prices' && <PricesTab />}
    </div>
  );
}

function ListTab() {
  const [params, setParams] = useSearchParams();
  const lists = useLiveQuery(() => db.groceryLists.orderBy('createdAt').reverse().toArray(), []);
  const [adding, setAdding] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);
  const toast = useToast();
  const list = lists?.find((l) => l.id === params.get('list')) ?? lists?.[0];
  const cost = useMemo(() => (list ? estimateListCost(list.items) : null), [list]);
  if (!lists) return null;

  const newManualList = async () => {
    const l: GroceryList = { id: newId('gl'), name: `Shopping — ${formatDateKey(isoToDateKey(nowIso()))}`, mealPlanId: null, items: [], createdAt: nowIso(), updatedAt: nowIso() };
    await db.groceryLists.add(l);
    setParams({ list: l.id });
  };
  if (!list)
    return (
      <EmptyState icon={<ShoppingCart className="h-6 w-6" />} title="No shopping lists" action={<Button onClick={() => void newManualList()}>Start a list</Button>}>
        Generate one from a meal plan (Planner → Grocery list), or start a manual list.
      </EmptyState>
    );

  const patchItem = (id: string, patch: Partial<GroceryItem>) => void updateGroceryList({ ...list, items: list.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const remaining = list.items.filter((i) => !i.checked).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={list.id} onChange={(e) => setParams({ list: e.target.value })} className="max-w-xs" aria-label="List">
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Button variant="outline" size="sm" onClick={() => void newManualList()}>
          <Plus className="h-4 w-4" /> New list
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(groceryListToText(list));
              toast('Copied to clipboard');
            } catch {
              downloadText(groceryListToText(list), 'groceries.txt');
            }
          }}
        >
          <Copy className="h-4 w-4" /> Copy
        </Button>
        <Button variant="outline" size="sm" onClick={() => downloadText(groceryListToText(list), `${list.name}.txt`)}>
          <Download className="h-4 w-4" /> Export
        </Button>
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-semibold">{remaining}</span> of {list.items.length} items left
        </div>
        {cost && (
          <div className="text-sm">
            Estimated {formatNZD(cost.total)}
            {cost.unpricedCount > 0 && <span className="text-xs text-slate-500"> + {cost.unpricedCount} unpriced</span>}
          </div>
        )}
        <Checkbox checked={hideChecked} onChange={setHideChecked} label="Hide ticked" />
      </Card>
      <Notice className="text-xs">Nothing is assumed to be in stock unless it's in your pantry. Quantities are rounded up to typical pack sizes where known.</Notice>
      {GROCERY_CATEGORIES.map((cat) => {
        const items = list.items.filter((i) => i.category === cat && (!hideChecked || !i.checked));
        if (!items.length) return null;
        return (
          <Card key={cat} className="p-0">
            <div className="px-4 pt-3 text-xs font-semibold uppercase text-slate-500">{cat}</div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button onClick={() => patchItem(i.id, { checked: !i.checked })} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${i.checked ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 dark:border-slate-600'}`} aria-label={i.checked ? `Untick ${i.name}` : `Tick ${i.name}`} aria-pressed={i.checked}>
                    {i.checked && <Check className="h-4 w-4" />}
                  </button>
                  <div className={`min-w-0 flex-1 ${i.checked ? 'text-slate-400 line-through' : ''}`}>
                    <div className="text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-slate-500">
                      {i.quantity != null && `${i.quantity} ${i.unit ?? ''}`}
                      {i.packages != null && ` → ${i.packages} × ${i.packageLabel}`}
                      {i.estimatedCostNZD != null && ` · ${formatNZD(i.estimatedCostNZD)}`}
                      {i.sources.length > 0 && ` · for ${i.sources.join(', ')}`}
                      {i.note && ` · ${i.note}`}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Remove ${i.name}`} onClick={() => void updateGroceryList({ ...list, items: list.items.filter((x) => x.id !== i.id) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add item
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const bought = list.items.filter((i) => i.checked && i.ingredientId && i.quantity != null && i.unit);
            for (const b of bought) await db.pantry.add({ id: newId('pan'), ingredientId: b.ingredientId!, quantity: b.quantity!, unit: b.unit!, staple: false, updatedAt: nowIso() });
            toast(`Added ${bought.length} ticked item(s) to pantry`);
          }}
        >
          <Package className="h-4 w-4" /> Ticked → pantry
        </Button>
      </div>
      <Button
        variant="ghost"
        className="text-red-600"
        onClick={async () => {
          if (!confirm('Delete this list?')) return;
          await db.groceryLists.delete(list.id);
          setParams({});
        }}
      >
        Delete list
      </Button>
      <AddItemSheet open={adding} onClose={() => setAdding(false)} onAdd={(item) => void updateGroceryList({ ...list, items: [...list.items, item] })} />
    </div>
  );
}

function AddItemSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (i: GroceryItem) => void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState<number | null>(null);
  const [unit, setUnit] = useState('each');
  const [category, setCategory] = useState<GroceryCategory>('Other');
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add item"
      footer={
        <Button
          className="w-full"
          disabled={!name.trim()}
          onClick={() => {
            onAdd({ id: newId('gi'), ingredientId: null, name: name.trim(), quantity: qty, unit: qty != null ? unit : null, category, packages: null, packageLabel: null, estimatedCostNZD: null, checked: false, manual: true, note: '', sources: [] });
            setName('');
            setQty(null);
            onClose();
          }}
        >
          Add
        </Button>
      }
    >
      <div className="space-y-3">
        <Field label="Item">{(fid) => <Input id={fid} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dish soap" />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">{(fid) => <NumberInput id={fid} value={qty} onChange={setQty} min={0} placeholder="optional" />}</Field>
          <Field label="Unit">
            {(fid) => (
              <Select id={fid} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {ALL_UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Category">
          {(fid) => (
            <Select id={fid} value={category} onChange={(e) => setCategory(e.target.value as GroceryCategory)}>
              {GROCERY_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Sheet>
  );
}

function PantryTab() {
  const pantry = useLiveQuery(() => db.pantry.toArray(), []);
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []);
  const [ingId, setIngId] = useState('');
  const [qty, setQty] = useState<number | null>(null);
  const [unit, setUnit] = useState('g');
  const [staple, setStaple] = useState(false);
  const name = (id: string) => ingredients?.find((i) => i.id === id)?.name ?? id;
  return (
    <div className="space-y-3">
      <Notice className="text-xs">Pantry stock is subtracted from new grocery lists. Mark long-life basics (salt, spices, oil) as <strong>staples</strong> to always treat them as in stock — only you decide this.</Notice>
      <Card className="space-y-2">
        <CardTitle>Add to pantry</CardTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_6rem_6rem_auto_auto]">
          <Select value={ingId} onChange={(e) => setIngId(e.target.value)} aria-label="Ingredient" className="col-span-2 sm:col-span-1">
            <option value="">Ingredient…</option>
            {(ingredients ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
          <NumberInput value={qty} onChange={setQty} min={0} placeholder="qty" aria-label="Quantity" />
          <Select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
            {ALL_UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
          <Checkbox checked={staple} onChange={setStaple} label="Staple" />
          <Button
            disabled={!ingId || (!staple && !qty)}
            onClick={async () => {
              await db.pantry.add({ id: newId('pan'), ingredientId: ingId, quantity: qty ?? 0, unit, staple, updatedAt: nowIso() });
              setIngId('');
              setQty(null);
              setStaple(false);
            }}
          >
            Add
          </Button>
        </div>
      </Card>
      {pantry?.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pantry
              .sort((a, b) => name(a.ingredientId).localeCompare(name(b.ingredientId)))
              .map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="flex-1 text-sm font-medium">{name(p.ingredientId)}</span>
                  {p.staple ? <Badge tone="teal">staple</Badge> : <NumberInput value={p.quantity} onChange={(v) => void db.pantry.update(p.id, { quantity: v ?? 0, updatedAt: nowIso() })} className="h-8 w-20" aria-label="Quantity" />}
                  {!p.staple && <span className="w-10 text-xs text-slate-500">{p.unit}</span>}
                  <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => void db.pantry.delete(p.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<Package className="h-6 w-6" />} title="Pantry is empty">Optional: track what you already have so grocery lists only include what you need.</EmptyState>
      )}
    </div>
  );
}

function PricesTab() {
  const ingredients = useLiveQuery(() => db.ingredients.orderBy('name').toArray(), []);
  const [q, setQ] = useState('');
  return (
    <div className="space-y-3">
      <Notice className="text-xs">Seed prices are indicative placeholders, not current store prices. Update them to what you pay; edited prices are marked with the date.</Notice>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ingredients" aria-label="Search ingredients" />
      <Card className="p-0">
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {(ingredients ?? [])
            .filter((i) => !i.tags.includes('no-shop') && (!q || i.name.toLowerCase().includes(q.toLowerCase())))
            .map((i) => (
              <li key={i.id} className="grid grid-cols-[1fr_6rem] items-center gap-2 px-4 py-2 sm:grid-cols-[1fr_10rem_7rem]">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{i.name}</div>
                  <div className="text-xs text-slate-500">
                    {i.packageSize ? i.packageSize.label ?? `${i.packageSize.quantity} ${i.packageSize.unit}` : 'No pack size'} · {i.priceUpdatedAt ? `updated ${formatDateKey(isoToDateKey(i.priceUpdatedAt))}` : 'indicative'}
                  </div>
                </div>
                <span className="hidden text-xs text-slate-500 sm:block">{i.category}</span>
                <NumberInput value={i.packagePriceNZD} onChange={(v) => void db.ingredients.update(i.id, { packagePriceNZD: v, priceUpdatedAt: nowIso(), updatedAt: nowIso() })} step={0.1} min={0} placeholder="NZ$" aria-label={`${i.name} price`} className="h-9" />
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
