# Merge Queue Simulator

An experimental tool for testing different merge queue strategies and analyzing their performance characteristics.

## Overview

This simulator models merge queue behavior where pull requests are batched together and tested before merging to the main branch. The goal is to understand tradeoffs between throughput, latency, and reliability.

## Live Demo

Visit: https://derrickstolee.github.io/merge-queues/

## What is a Merge Queue?

Instead of merging PRs directly to the main branch, a merge queue:
1. Batches multiple PRs together
2. Runs fast builds on individual PRs
3. Runs full builds on batches
4. Merges successful batches
5. Evicts failed PRs and requeues affected ones

This ensures the main branch always stays green, but introduces latency and potential for cascading failures.

## Features

### Input Configuration
- **Number of PRs**: How many PRs to simulate
- **PR arrival rate**: PRs per hour
- **Fast build settings**: Speed, success rate, variance
- **Full build settings**: Speed, success rate, variance
- **Batch size**: Maximum PRs per batch

### Visualization

The simulator shows a row-per-batch timeline visualization:

**Visual Elements:**
- ⚫ **Black dot**: PR in a successfully merged batch
- ⭕ **Gray circle**: PR in a failed/canceled/incomplete batch
- ❌ **Gray X (on PR)**: PR evicted from queue
- 💎 **Blue diamond**: Batch created (full build started)
- 🟩 **Green square**: Batch merged successfully
- ❌ **Red X**: Batch failed (actual build failure)
- ❌ **Gray X**: Batch canceled (due to earlier failure)
- **Dashed line**: Build duration

**Reading the visualization:**
- Each row represents one batch attempt
- X-axis = time (PRs positioned at their original queue time)
- Y-axis = batch number (chronological order)
- Vertical columns show the same PR across multiple batch attempts

### Statistics

The simulator calculates comprehensive metrics:

**Counts:**
- Merged PRs vs Evicted PRs
- Fairly Evicted (fast build failed) vs Unfairly Evicted (full build failed)
- Queued Builds vs Canceled Builds

**Waiting Time Statistics (Merged PRs):**
- Time from PR queue to batch merge
- Median, 80th percentile, maximum

**Time to Eviction (Evicted PRs):**
- Time from PR queue to eviction
- Median, 80th percentile, maximum

**Branch Staleness:**
- Time since last successful merge (sampled every second)
- Shows how up-to-date the main branch stays
- Median, 80th percentile, maximum

## Current Implementation

### "Simple" Strategy

The current implementation uses a basic merge queue strategy:

**Batching Rules:**
- PRs are added to the current batch as they arrive
- A batch closes when:
  - It reaches maximum batch size, OR
  - All fast builds in the batch pass

**Build Process:**
1. Each PR gets a fast build when added to batch
2. When batch closes, a full build starts
3. Full build time = max(all PR full build times)
4. Full build succeeds only if all PRs would pass

**Failure Handling:**
- **Fast build fails** (before batch closes):
  - Evict only that PR
  - Continue with remaining PRs in batch
- **Fast build fails** (after batch closes):
  - Evict the failed PR
  - Cancel the full build
  - Reset queue from that batch forward
- **Full build fails**:
  - Evict entire batch (all PRs)
  - Reset queue from that batch forward

**Queue Reset:**
- Cancel all ongoing builds for affected PRs
- Re-batch and restart builds at current time
- PRs appear as gray circles (requeued) in new batches

## Architecture

The codebase is organized into ES6 modules:

- **`generator.js`**: Generates random PR data with configurable parameters
- **`simple.js`**: Implements the "simple" merge queue strategy simulation
- **`renderer.js`**: Renders the timeline visualization on canvas
- **`ui.js`**: Handles DOM interactions and coordinates modules
- **`index.html`**: Main page structure
- **`style.css`**: Basic styling

## Key Insights

The simulator helps answer questions like:

1. **What's the cost of failures?**
   - Unfairly evicted PRs show collateral damage
   - Canceled builds show wasted resources

2. **Are fast builds worth it?**
   - High "fairly evicted" count = fast builds catching issues early
   - High "unfairly evicted" count = need better fast build coverage

3. **What's the optimal batch size?**
   - Larger batches = more throughput but more unfair evictions
   - Smaller batches = less collateral damage but more overhead

4. **How fresh is the main branch?**
   - Staleness metrics show developer experience
   - High staleness = developers diverge from main

## Future Work

Potential enhancements:
- Additional merge queue strategies (e.g., dynamic batch sizing)
- Build capacity constraints (limited parallel builds)
- More sophisticated failure isolation
- Cost modeling (compute resources, developer time)
- Comparison mode (run multiple strategies side-by-side)

## License

This is an experimental tool for research and discussion purposes.
