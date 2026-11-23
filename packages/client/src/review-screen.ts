/**
 * The review screen's bridge (STORY-69): one feature's review, live from the server's `review.watch`, which pushes it
 * again as its stories move, checks finish, proof arrives and the Dev Lead writes its summary.
 */
import { normalizeFeatureReview, type FeatureReview } from "@featra/work-format/review";
import type { ServerClient } from "./server-client.ts";

export type { FeatureReview };

/** What a review watch hears: the review now (null when the feature isn't in progress), and why it's out of date. */
export interface ReviewUpdate {
  review: FeatureReview | null;
  loading: boolean;
  error: string | null;
}

export interface ReviewBridge {
  /** Calls back with feature `id`'s review now and on every change; returns the stop. */
  watchReview: (dir: string, id: string, listener: (update: ReviewUpdate) => void) => () => void;
}

export function serverReviews(server: ServerClient): ReviewBridge {
  return {
    watchReview(dir, id, listener) {
      let last: FeatureReview | null = null;
      return server.watch(
        "review.watch",
        { dir, id },
        {
          data: (raw) => {
            last = normalizeFeatureReview(raw);
            listener({ review: last, loading: false, error: null });
          },
          error: (message) => listener({ review: last, loading: false, error: message }),
        },
      );
    },
  };
}

/** A browser tab has no folders, so no reviews. */
export function noReviews(error: string): ReviewBridge {
  return {
    watchReview(_dir, _id, listener) {
      listener({ review: null, loading: false, error });
      return () => {};
    },
  };
}
