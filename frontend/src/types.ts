export interface Meta { granularity?: string; dataset_id: string; dataset_name: string; source: string; run_at: string }
export interface Category { category: string; value: number; share?: number }
export interface Metrics {
  rows: number; total_value?: number; date_min?: string; date_max?: string; n_categories?: number;
  top_categories?: Category[]; partial_last_month?: boolean; months_complete?: number;
  anomaly_months?: string[]; trend_direction?: string; top3_share?: number;
  last_month?: string; last_value?: number; prev_month?: string; change_pct?: number | null;
}
export interface Quality {
  rows_in: number; rows_out: number; rows_dropped: number; duplicates_removed: number; invalid_dates: number;
  missing_category: number; invalid_values: number; negative_values: number; outliers_flagged: number;
  value_is_count: boolean; notes: string[];
}
export interface Fact { id: string; text: string; evidence: Record<string, string> }
export interface Sentence { fact_id: string; text: string; evidence: Record<string, string>; fallback: boolean }
export interface Summary { provider: string; model: string | null; fallback_count: number; error: string | null; sentences: Sentence[] }
export interface Overview { meta: Meta; metrics: Metrics; quality: Quality; facts: Fact[]; summary: Summary }
export interface SeriesPoint { month: string; value: number; partial: boolean }
export interface SampleCategory { name: string; weight: number }
export interface SampleParams {
  seed: number; start: string; end: string; categories: SampleCategory[]; base_level: number;
  growth_pct_per_month: number; anomaly_month: string | null; anomaly_factor: number; add_dirty_rows: boolean;
}
