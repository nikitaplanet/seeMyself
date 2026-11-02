import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  chartDbErrorMessage,
  fromChartRow,
  toChartInsert,
  toChartUpdate,
  type ChartMeta,
  type ComputedChart,
  type SavedChart,
} from './mapping';

// Browser-side CRUD on public.charts. Every query runs as the signed-in user; RLS limits it to the
// user's own rows, so no user_id filter is needed (or trusted) here.

export type RepoResult<T> = { ok: true; data: T } | { ok: false; message: string };

function fail<T>(err: unknown): RepoResult<T> {
  return { ok: false, message: chartDbErrorMessage(err as { code?: string; message?: string }) };
}

export async function listCharts(): Promise<RepoResult<SavedChart[]>> {
  try {
    const { data, error } = await getSupabaseBrowserClient()
      .from('charts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: (data ?? []).map(fromChartRow).filter((c): c is SavedChart => c !== null) };
  } catch (e) {
    return fail(e);
  }
}

export async function insertChart(chart: ComputedChart, meta: ChartMeta): Promise<RepoResult<SavedChart>> {
  try {
    const { data, error } = await getSupabaseBrowserClient()
      .from('charts')
      .insert(toChartInsert(chart, meta))
      .select('*')
      .single();
    if (error) return fail(error);
    const saved = fromChartRow(data);
    return saved ? { ok: true, data: saved } : fail(null);
  } catch (e) {
    return fail(e);
  }
}

export async function updateChart(id: string, meta: ChartMeta): Promise<RepoResult<SavedChart>> {
  try {
    const { data, error } = await getSupabaseBrowserClient()
      .from('charts')
      .update(toChartUpdate(meta))
      .eq('id', id)
      .select('*')
      .single();
    if (error) return fail(error);
    const saved = fromChartRow(data);
    return saved ? { ok: true, data: saved } : fail(null);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteChart(id: string): Promise<RepoResult<null>> {
  try {
    const { error } = await getSupabaseBrowserClient().from('charts').delete().eq('id', id);
    if (error) return fail(error);
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
