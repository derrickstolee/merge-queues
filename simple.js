//
// Javascript for the simple merge queue strategy.
//
// It processes a list of queued PRs, looking at their queue time,
// short build time and status, long build time and status.
//
// It also takes an input batch size.
//
// The result is a list of commits, each either a representation of the
// PR merging into the queue, or the non-fast-forward merge of the queue
// into the target branch.
//
// (old) *--------------------------------------* (merge)
//        \                                    /
//         *----*----*----*----*----*----*----* (PR commits)
//
// Each PR commit gets added with a commit time matching the queue time
// for the PR, then a short build is started at that time, taking as long
// as the PR data dictates.
//
// A batch of PR commits are collected into a single merge if one of the
// following events occur:
//
// * The number of PR commits in the current batch reach the maximum
//   batch size.
//
// * The previous batch has completed its large build successfully and
//   all PR commits of this batch complete successfully before the next
//   PR commit is queued.
//
// The batching strategy indicates where long builds should run, but they
// don't start until all short builds succeed on the PR commits for the
// batch.
//
// The more interesting thing that happens is around when a short or long
// build fails.
//
// * If a short build fails, then that PR commit is ejected and the queue
//   is rebuilt from that point on. All ongoing builds after that point
//   are canceled, which would only be short builds.
//
// * If a long build fails, then that batch is ejected and the queue is
//   rebuilt from that point on. All ongoing builds after that point are
//   canceled, which includes short and long builds.
//
// This implementation takes the list of PR merge queue events and
// outputs an object with the following member lists:
//
// * Commits: The list of commits that were created.
// * Builds: The list of builds that were run (short and long).
// * Evictions: The list of commits or batches that were evicted from the
//              queue.
//
// A commit has an identifier string, a list of parent identifier
// strings (one for PR commits, two for merge commits), a commit time,
// a nullable time that specifies if and when it was merged, and a
// nullable time that specifies if and when it was evicted.
//
// At the end, we have some statistics to track:
//
// 1. Merge time for each PR. From that, we can deduce the "wait time".
//
// 2. Concurrent build capacity, summed by short and long builds.
//
// More statistics will be tracked as we investigate.
//
// We can generate a few interesting charts from these statistics and the
// list of "events" that are output:
//
// * Number of PRs ejected per time period.
// * Maximum queue size per time period.
// * Build resources consumed per time period.
// * ...
//
// More will be expanded as we implement things.
//
// Risks to reality: There is nothing in this schedule that accounts for
// build capacity. If we rebuild the merge queue, then all builds start
// at the exact same time, allowing us to flush the queue a lot faster
// than reality would allow.

function simulateSimpleStrategy(pullRequests, maxBatchSize)
{
    // Priority queue to manage PRs by queue time
    const eventQueue = {
        items: [],

        // Add item with key
        insert: function(key, value) {
            this.items.push({ key: key, value: value });
            this.items.sort((a, b) => a.key - b.key);
        },

        // Remove and return item with lowest key
        removeMin: function() {
            if (this.items.length === 0) {
                return null;
            }
            return this.items.shift().value;
        },

        // Check if empty
        isEmpty: function() {
            return this.items.length === 0;
        },

        // Get size
        size: function() {
            return this.items.length;
        }
    };

    // Initialize priority queue with pull requests using queuetime as key
    for (const pr of pullRequests) {
	var event = {
		time: pr.queuetime,
		type: "PR commit",
		obj: pr
	};
        eventQueue.insert(pr.queuetime, event);
    }

    // Create result object
    const result = {
        Commits: [],
        Builds: [],
        Evictions: []
    };

    // Simulate the on-line nature of the queue: only looking at events
    // in time-based order.
    while (eventQueue.size() > 0) {
	var event = eventQueue.removeMin();

	if (event.type == "PR commit")
	{
		// Perform queueing logic. Create build completion event.

		var buildEndEvent = {
			time: event.obj.queuetime + event.obj.FastBuildTime,
			type: "Build completion",
			obj: {
				startTime: event.obj.queuetime,
				duration: event.obj.FastBuildTime,
				type: "fast",
				passed: event.obj.FastBuildPasses,
			}
		};

		eventQueue.insert(buildEndEvent.time, buildEndEvent);
	}
	else if (event.type == "Build completion")
	{

	}
    }

    return result;
}

export { simulateSimpleStrategy };