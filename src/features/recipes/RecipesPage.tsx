import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Clock, Plus, Search, Star, CalendarDays, ShoppingCart, FlaskConical } from 'lucide-react';
import { db } from '../../db/db';
import { Badge, Button, Card, Input, PageHeader, Select, Checkbox, EmptyState } from '../../components/ui';
import { MacroLine, ValidationBadge } from '../../components/nutrition';
import { useNutritionLookup } from '../../hooks/data';
import { calculateRecipeNutrition } from '../../domain/recipes/nutrition';
import { estimateRecipeCost } from '../../domain/recipes/shopping';
import { APPLIANCE_LABEL, APPLIANCES, type ApplianceId } from '../../domain/recipes/types';
import { formatNZD } from '../../lib/utils';

export function CookNav() {
  return (
    <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 lg:hidden">
      <Link to="/recipes"><Badge className="px-3 py-1.5 text-sm">Recipes</Badge></Link>
      <Link to="/planner"><Badge className="px-3 py-1.5 text-sm"><CalendarDays className="h-3.5 w-3.5" /> Planner</Badge></Link>
      <Link to="/groceries"><Badge className="px-3 py-1.5 text-sm"><ShoppingCart className="h-3.5 w-3.5" /> Groceries</Badge></Link>
      <Link to="/lab"><Badge className="px-3 py-1.5 text-sm"><FlaskConical className="h-3.5 w-3.5" /> Lab</Badge></Link>
    </div>
  );
}

export function RecipesPage() {
  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []);
  const versions = useLiveQuery(() => db.recipeVersions.toArray(), []);
  const lookup = useNutritionLookup();
  const [q, setQ] = useState('');
  const [appliance, setAppliance] = useState<'' | ApplianceId>('');
  const [favOnly, setFavOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<'name' | 'protein' | 'time' | 'cost'>('name');

  const rows = useMemo(() => {
    if (!recipes || !versions || !lookup) return [];
    const vmap = new Map(versions.map((v) => [v.id, v]));
    return recipes
      .map((r) => {
        const v = vmap.get(r.currentVersionId)!;
        const n = v ? calculateRecipeNutrition(v, lookup) : null;
        const cost = v ? estimateRecipeCost(v, lookup.ingredients) : null;
        return { r, v, n, cost };
      })
      .filter(({ r, v }) => v && (showArchived ? r.archived : !r.archived) && (!favOnly || r.favourite) && (!appliance || v.appliances.includes(appliance)))
      .filter(({ r }) => !q || `${r.name} ${r.cuisine} ${r.tags.join(' ')} ${r.description}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) =>
        sort === 'protein' ? (b.n?.perServing.proteinG ?? 0) - (a.n?.perServing.proteinG ?? 0) : sort === 'time' ? a.v.prepMinutes + a.v.cookMinutes - (b.v.prepMinutes + b.v.cookMinutes) : sort === 'cost' ? (a.cost?.perServing ?? 99) - (b.cost?.perServing ?? 99) : a.r.name.localeCompare(b.r.name)
      );
  }, [recipes, versions, lookup, q, appliance, favOnly, showArchived, sort]);

  return (
    <div className="space-y-4">
      <CookNav />
      <PageHeader title="Recipes" subtitle="PantryGenome" actions={<Link to="/recipes/new"><Button><Plus className="h-4 w-4" /> New recipe</Button></Link>} />
      <div className="grid gap-2 sm:grid-cols-[1fr_11rem_9rem]">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes, cuisines, tags" className="pl-9" aria-label="Search recipes" />
        </div>
        <Select value={appliance} onChange={(e) => setAppliance(e.target.value as ApplianceId)} aria-label="Appliance">
          <option value="">Any appliance</option>
          {APPLIANCES.map((a) => (
            <option key={a} value={a}>
              {APPLIANCE_LABEL[a]}
            </option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="name">Name</option>
          <option value="protein">Protein</option>
          <option value="time">Quickest</option>
          <option value="cost">Cheapest</option>
        </Select>
      </div>
      <div className="flex gap-4">
        <Checkbox checked={favOnly} onChange={setFavOnly} label="Favourites" />
        <Checkbox checked={showArchived} onChange={setShowArchived} label="Archived" />
      </div>
      {rows.length === 0 && <EmptyState title="No recipes match" />}
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map(({ r, v, n, cost }) => (
          <Link key={r.id} to={`/recipes/${r.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-tight">{r.name}</h2>
                {r.favourite && <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />}
              </div>
              <p className="mb-2 line-clamp-2 text-sm text-slate-500">{r.description}</p>
              {n && <MacroLine n={n.perServing} incomplete={!n.complete} />}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {v.prepMinutes + v.cookMinutes} min
                </span>
                <span>· {v.servings} servings</span>
                {cost && cost.total > 0 && <span>· ≈{formatNZD(cost.perServing)}/serving{cost.unpriced.length ? '+' : ''}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <ValidationBadge status={v.validation} />
                {v.appliances.map((a) => (
                  <Badge key={a}>{APPLIANCE_LABEL[a].replace(' (Instant Pot)', '')}</Badge>
                ))}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
