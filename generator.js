/**
 * Generator module for creating pull request data
 */

/**
 * Generates a list of pull requests with random timing and build characteristics
 * @param {Object} config - Configuration for PR generation
 * @param {number} config.numPRs - Number of PRs to generate
 * @param {number} config.prsPerHour - Expected PRs per hour
 * @param {number} config.buildSpeedFast - Average fast build time in seconds
 * @param {number} config.buildSuccessRateFast - Fast build success rate (0-100)
 * @param {number} config.buildSpeedVarianceFast - Variance in fast build time
 * @param {number} config.buildSpeedFull - Average full build time in seconds
 * @param {number} config.buildSuccessRateFull - Full build success rate (0-100)
 * @param {number} config.buildSpeedVarianceFull - Variance in full build time
 * @returns {Array} Array of pull request objects
 */
export function generatePullRequests(config) {
	const {
		numPRs,
		prsPerHour,
		buildSpeedFast,
		buildSuccessRateFast,
		buildSpeedVarianceFast,
		buildSpeedFull,
		buildSuccessRateFull,
		buildSpeedVarianceFull
	} = config;

	// Generate pull requests
	const pullRequests = [];
	const secondsBetweenPRs = 3600 / prsPerHour;
	let cumulativeTime = 0;

	for (let i = 0; i < numPRs; i++) {
		// Add variance to the time between PRs using exponential distribution
		// This creates realistic bursts while maintaining the expected rate
		const randomFactor = -Math.log(1 - Math.random());
		const timeSinceLastPR = secondsBetweenPRs * randomFactor;
		cumulativeTime += timeSinceLastPR;

		// Calculate queue time with variance (in seconds)
		const queuetime = Math.round(cumulativeTime);

		// Determine if fast build passes (based on success rate)
		const FastBuildPasses = Math.random() * 100 < buildSuccessRateFast;

		// Determine if full build passes (based on success rate)
		const FullBuildPasses = FastBuildPasses && (Math.random() * 100 < buildSuccessRateFull);

		// Generate fast build time with variance (in seconds)
		const fastVariance = (Math.random() - 0.5) * 2 * buildSpeedVarianceFast;
		const FastBuildTime = Math.max(1, Math.round(buildSpeedFast + fastVariance));

		// Generate full build time with variance (in seconds)
		const fullVariance = (Math.random() - 0.5) * 2 * buildSpeedVarianceFull;
		const FullBuildTime = Math.max(1, Math.round(buildSpeedFull + fullVariance));

		pullRequests.push({
			queuetime: queuetime,
			FastBuildPasses: FastBuildPasses,
			FullBuildPasses: FullBuildPasses,
			FastBuildTime: FastBuildTime,
			FullBuildTime: FullBuildTime
		});
	}

	return pullRequests;
}
