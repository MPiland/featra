/**
 * The stage board (STORY-17): Work's story rows grouped into one column per stage. Pure, over the Work list the
 * server sends (ADR 0016), so the board computes no second rollup (ADR 0003). Read-only: a card moves between columns
 * only when its stage changes, through an agent, a merge or the card pane.
 */
import type { FeatureRow, StageColumn, StoryRow, WorkList } from "./work-list-types.ts";

/** A feature the board can be narrowed to. */
export interface BoardFeature {
  id: string;
  title: string;
}

/** One card on the board: a story or bug row, with the feature it is under (null for a story under none). */
export interface BoardCard {
  story: StoryRow;
  feature: BoardFeature | null;
}

export interface BoardColumn extends StageColumn {
  cards: BoardCard[];
}

const features = (list: WorkList): FeatureRow[] => list.epics.flatMap((e) => e.features);

const named = (f: FeatureRow): BoardFeature | null => (f.id === null ? null : { id: f.id, title: f.title });

/** The features the board's filter offers: each with a card and at least one story or bug, in the list's order. */
export function boardFeatures(list: WorkList): BoardFeature[] {
  return features(list).flatMap((f) => {
    const feature = named(f);
    return feature && f.stories.length > 0 ? [feature] : [];
  });
}

/** The feature the board shows: `chosen` while the filter still offers it, else null for all features. */
export function boardFilter(list: WorkList, chosen: string | null): string | null {
  return chosen !== null && boardFeatures(list).some((f) => f.id === chosen) ? chosen : null;
}

/**
 * One column per stage, each holding the stories and bugs of every feature (`feature` null) or of one feature, in the
 * Work list's order, the columns in `config.stages` order (the client and server ship together, so the list always
 * carries them). A story under no feature shows only with all features. A card whose stage is not a column is left
 * out on purpose: a cancelled one, or one whose stage the project's config does not list, which card validation
 * already reports as a problem. So are the project's bugs, which belong to no feature (STORY-13).
 */
export function stageBoard(list: WorkList, feature: string | null): BoardColumn[] {
  const columns = (list.stages ?? []).map(({ name, tone }): BoardColumn => ({ name, tone, cards: [] }));
  const byStage = new Map(columns.map((c) => [c.name, c]));
  for (const f of features(list)) {
    if (feature !== null && f.id !== feature) continue;
    for (const story of f.stories) byStage.get(story.stage)?.cards.push({ story, feature: named(f) });
  }
  return columns;
}
