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
    // Add IDs to pull requests
    for (let i = 0; i < pullRequests.length; i++) {
        pullRequests[i].id = i;
    }

    // Priority queue with removal capability
    let nextEventId = 0;
    const eventQueue = {
        items: [],

        insert: function(time, event) {
            event.eventId = nextEventId++;
            this.items.push({ key: time, value: event });
            this.items.sort((a, b) => a.key - b.key);
        },

        removeMin: function() {
            if (this.items.length === 0) return null;
            return this.items.shift().value;
        },

        removeMatching: function(predicate) {
            const removed = [];
            this.items = this.items.filter(item => {
                if (predicate(item.value)) {
                    removed.push(item.value);
                    return false;
                }
                return true;
            });
            return removed;
        },

        isEmpty: function() {
            return this.items.length === 0;
        },

        size: function() {
            return this.items.length;
        }
    };

    // Initialize with PR commit events
    for (const pr of pullRequests) {
        eventQueue.insert(pr.queuetime, {
            time: pr.queuetime,
            type: "PR commit",
            prId: pr.id
        });
    }

    // Simulation state
    let nextBatchId = 0;
    const state = {
        currentBatch: {
            prs: [],
            prEntries: [], // {pr, queueTime, isRequeued}
            fastBuildStatus: {} // prId -> {completed, passed}
        },
        activeBatches: [], // Batches with full builds running
        prMap: {}, // id -> pr object
        prAppearances: {} // prId -> count (to detect requeues)
    };

    // Initialize PR map and appearance tracking
    for (const pr of pullRequests) {
        state.prMap[pr.id] = pr;
        state.prAppearances[pr.id] = 0;
    }

    // Result tracking
    const result = {
        batches: [], // All batches (successful, failed, canceled)
        pullRequests: [], // For backwards compatibility - successful batches only
        Commits: [],
        Builds: [],
        Evictions: []
    };

    // Helper: Check if current batch is ready to close
    function isCurrentBatchReady() {
        if (state.currentBatch.prs.length === 0) return false;

        for (const pr of state.currentBatch.prs) {
            const status = state.currentBatch.fastBuildStatus[pr.id];
            if (!status || !status.completed || !status.passed) {
                return false;
            }
        }
        return true;
    }

    // Helper: Close current batch
    function closeCurrentBatch(currentTime) {
        if (state.currentBatch.prs.length === 0) return;

        const batchId = nextBatchId++;
        const batch = {
            id: batchId,
            rowNumber: nextBatchId - 1, // Row in visualization
            prs: [...state.currentBatch.prs],
            prEntries: [...state.currentBatch.prEntries], // Detailed PR entry info
            pullRequests: [...state.currentBatch.prs], // For backwards compatibility
            batchCreateTime: currentTime,
            startTime: currentTime, // For backwards compatibility
            status: 'building' // Will be updated to 'success', 'failed', or 'canceled'
        };

        // Calculate full build parameters
        let maxFullBuildTime = 0;
        let allPass = true;
        for (const pr of batch.prs) {
            if (pr.FullBuildTime > maxFullBuildTime) {
                maxFullBuildTime = pr.FullBuildTime;
            }
            if (!pr.FullBuildPasses) {
                allPass = false;
            }
        }

        batch.fullBuildTime = maxFullBuildTime;
        batch.fullBuildPasses = allPass;
        batch.FullBuildPasses = allPass; // For backwards compatibility

        // Add to active batches and results
        state.activeBatches.push(batch);
        result.batches.push(batch);

        // Schedule full build completion
        const fullBuildEndTime = currentTime + maxFullBuildTime;
        eventQueue.insert(fullBuildEndTime, {
            time: fullBuildEndTime,
            type: "Full build completion",
            batchId: batchId,
            passed: allPass
        });

        // Reset current batch
        state.currentBatch = {
            prs: [],
            prEntries: [],
            fastBuildStatus: {}
        };
    }

    // Helper: Reset queue from a list of PRs
    function resetQueue(prsToRebatch, currentTime) {
        // Cancel all builds for these PRs
        const prIds = new Set(prsToRebatch.map(pr => pr.id));

        // Remove fast build events
        const removed = eventQueue.removeMatching(event => {
            if (event.type === "Fast build completion" && prIds.has(event.prId)) {
                return true;
            }
            if (event.type === "Full build completion") {
                const batch = state.activeBatches.find(b => b.id === event.batchId);
                if (batch && batch.prs.some(pr => prIds.has(pr.id))) {
                    return true;
                }
            }
            return false;
        });

        // Log canceled builds
        for (const event of removed) {
            result.Builds.push({
                type: event.type === "Fast build completion" ? "fast" : "full",
                status: "canceled",
                time: currentTime
            });
        }

        // Mark affected batches as canceled and remove from active batches
        state.activeBatches = state.activeBatches.filter(batch => {
            if (batch.prs.some(pr => prIds.has(pr.id))) {
                batch.status = 'canceled';
                batch.canceledTime = currentTime;
                return false;
            }
            return true;
        });

        // Clear current batch if it contains affected PRs
        if (state.currentBatch.prs.some(pr => prIds.has(pr.id))) {
            state.currentBatch = {
                prs: [],
                prEntries: [],
                fastBuildStatus: {}
            };
        }

        // Re-batch PRs
        for (const pr of prsToRebatch) {
            // Check if this PR has appeared before (requeue)
            const isRequeued = state.prAppearances[pr.id] > 0;
            state.prAppearances[pr.id]++;

            // Add to current batch
            state.currentBatch.prs.push(pr);
            state.currentBatch.prEntries.push({
                pr: pr,
                queueTime: pr.queuetime, // Original queue time (never changes)
                isRequeued: isRequeued
            });
            state.currentBatch.fastBuildStatus[pr.id] = {
                completed: false,
                passed: false
            };

            // Start fast build
            const fastBuildEndTime = currentTime + pr.FastBuildTime;
            eventQueue.insert(fastBuildEndTime, {
                time: fastBuildEndTime,
                type: "Fast build completion",
                prId: pr.id,
                passed: pr.FastBuildPasses
            });

            // Check if batch is full
            if (state.currentBatch.prs.length >= maxBatchSize) {
                closeCurrentBatch(currentTime);
            }
        }
    }

    // Main event loop
    while (!eventQueue.isEmpty()) {
        const event = eventQueue.removeMin();
        const currentTime = event.time;

        if (event.type === "PR commit") {
            const pr = state.prMap[event.prId];

            // Check if this PR has appeared before (should be first time here)
            const isRequeued = state.prAppearances[pr.id] > 0;
            state.prAppearances[pr.id]++;

            // Add to current batch
            state.currentBatch.prs.push(pr);
            state.currentBatch.prEntries.push({
                pr: pr,
                queueTime: pr.queuetime, // Original queue time (never changes)
                isRequeued: isRequeued
            });
            state.currentBatch.fastBuildStatus[pr.id] = {
                completed: false,
                passed: false
            };

            // Start fast build
            const fastBuildEndTime = currentTime + pr.FastBuildTime;
            eventQueue.insert(fastBuildEndTime, {
                time: fastBuildEndTime,
                type: "Fast build completion",
                prId: pr.id,
                passed: pr.FastBuildPasses
            });

            // Check if batch is full
            if (state.currentBatch.prs.length >= maxBatchSize) {
                closeCurrentBatch(currentTime);
            }
        }
        else if (event.type === "Fast build completion") {
            const pr = state.prMap[event.prId];

            // Update status
            if (state.currentBatch.fastBuildStatus[pr.id]) {
                state.currentBatch.fastBuildStatus[pr.id] = {
                    completed: true,
                    passed: event.passed
                };
            }

            if (!event.passed) {
                // Fast build failed - mark PR as evicted
                pr.evicted = true;
                pr.evictedTime = currentTime;
                pr.evictedReason = "Fast build failed";

                result.Evictions.push({
                    prId: pr.id,
                    time: currentTime,
                    reason: "Fast build failed"
                });

                // Find if PR is in current batch or an active batch
                const isInCurrentBatch = state.currentBatch.prs.some(p => p.id === pr.id);
                const activeBatch = state.activeBatches.find(b => b.prs.some(p => p.id === pr.id));

                if (isInCurrentBatch && !activeBatch) {
                    // Case 1: Failed before batch closed - just remove it
                    state.currentBatch.prs = state.currentBatch.prs.filter(p => p.id !== pr.id);
                    delete state.currentBatch.fastBuildStatus[pr.id];
                } else if (activeBatch) {
                    // Case 2: Failed after batch closed - mark batch as failed and reset queue
                    activeBatch.status = 'failed';
                    activeBatch.failedTime = currentTime;

                    const prsToRebatch = [];

                    // Collect all PRs from this batch (except the failed one)
                    for (const p of activeBatch.prs) {
                        if (p.id !== pr.id) {
                            prsToRebatch.push(p);
                        }
                    }

                    // Collect PRs from later batches
                    for (const batch of state.activeBatches) {
                        if (batch.id > activeBatch.id) {
                            prsToRebatch.push(...batch.prs);
                        }
                    }

                    // Collect PRs from current batch
                    prsToRebatch.push(...state.currentBatch.prs);

                    resetQueue(prsToRebatch, currentTime);
                }
            } else {
                // Fast build passed - check if batch is ready
                if (isCurrentBatchReady()) {
                    closeCurrentBatch(currentTime);
                }
            }
        }
        else if (event.type === "Full build completion") {
            const batch = state.activeBatches.find(b => b.id === event.batchId);
            if (!batch) continue; // Already canceled

            batch.buildCompleteTime = currentTime;

            if (event.passed) {
                // Success - branch update
                batch.status = 'success';
                batch.completedTime = currentTime; // For backwards compatibility

                // Add to pullRequests for backwards compatibility with renderer
                result.pullRequests.push(batch);

                // Remove from active batches
                state.activeBatches = state.activeBatches.filter(b => b.id !== event.batchId);
            } else {
                // Failure - mark batch and evict all PRs
                batch.status = 'failed';
                batch.failedTime = currentTime; // For backwards compatibility

                for (const pr of batch.prs) {
                    pr.evicted = true;
                    pr.evictedTime = currentTime;
                    pr.evictedReason = "Full build failed";

                    result.Evictions.push({
                        prId: pr.id,
                        time: currentTime,
                        reason: "Full build failed"
                    });
                }

                // Collect PRs to rebatch (everything after this batch)
                const prsToRebatch = [];
                for (const b of state.activeBatches) {
                    if (b.id > event.batchId) {
                        prsToRebatch.push(...b.prs);
                    }
                }
                prsToRebatch.push(...state.currentBatch.prs);

                resetQueue(prsToRebatch, currentTime);
            }
        }
    }

    // Handle any remaining PRs in currentBatch at end of simulation
    if (state.currentBatch.prs.length > 0) {
        const batchId = nextBatchId++;
        const batch = {
            id: batchId,
            rowNumber: nextBatchId - 1,
            prs: [...state.currentBatch.prs],
            prEntries: [...state.currentBatch.prEntries],
            pullRequests: [...state.currentBatch.prs],
            batchCreateTime: undefined, // Not closed, so no batch create time
            startTime: undefined,
            status: 'incomplete' // Special status for incomplete batches
        };
        result.batches.push(batch);
    }

    return result;
}

export { simulateSimpleStrategy };