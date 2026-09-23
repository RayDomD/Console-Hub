# Partial results never lower a Recipe guarantee

Explore may finish with at least one completed response, but names every failed slot and labels the result partial. Synthesize requires at least two completed proposals before its merge runs. Debate continues only while two slots survive. Coordinate requires at least two planning proposals, and a failed required task blocks its dependents and final integration until retried or the graph is explicitly replanned. Validate never succeeds without a green gate. Direct succeeds only when its one turn completes. Console makes no success judgment and shows only its process exit status.

No Recipe silently lowers these thresholds. A partial result exists only where the remaining output still satisfies the Recipe's stated guarantee.

**Status:** accepted
