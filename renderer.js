/**
 * Renderer module for visualizing merge queue simulation results
 */

/**
 * Calculates layout coordinates for batches and PRs
 * @param {Array} batches - Array of batch objects with pull requests
 * @returns {Object} Layout information including max dimensions
 */
function calculateLayout(batches) {
	let currentRow = 0;
	let maxTime = 0;
	let maxRow = 0;

	// Track all occupied time ranges by row for overlap detection
	let curVerticalStart = 0;
	let curVerticalEnd = 0;

	for (const batch of batches) {
		// Find max full build time for this batch
		let maxFullBuildTime = 0;
		let minQueueTime = batch.pullRequests[0].queuetime;

		for (const pr of batch.pullRequests) {
			if (pr.FullBuildTime > maxFullBuildTime) {
				maxFullBuildTime = pr.FullBuildTime;
			}
		}

		// Store batch-level info
		batch.maxFullBuildTime = maxFullBuildTime;
		batch.pullRequests_augmented = [];

		// Calculate the time range this batch will occupy
		const batchStartTime = batch.pullRequests[0].queuetime;
		const lastPR = batch.pullRequests[batch.pullRequests.length - 1];
		const batchEndTime = lastPR.queuetime + lastPR.FastBuildTime + maxFullBuildTime;

		// Check if we can fit starting from row 0
		if (currentRow > 0 && minQueueTime > curVerticalStart + (curVerticalEnd - curVerticalStart) / 2) {
			currentRow = 0;
			curVerticalStart = minQueueTime;
			curVerticalEnd = minQueueTime;
		}

		// Augment each PR with position
		let prRow = currentRow;
		for (const pr of batch.pullRequests) {
			pr.time = pr.queuetime;
			pr.row = prRow;
			pr.endTime = pr.queuetime + 2 * pr.FullBuildTime;

			if (pr.endTime > maxTime) {
				maxTime = pr.endTime;
			}

			prRow++;
		}

		// Augment batch separator with position
		batch.time = lastPR.queuetime + lastPR.FastBuildTime;
		batch.row = prRow;
		batch.endTime = batch.time + 2 * maxFullBuildTime;

		if (batch.endTime > maxTime) {
			maxTime = batch.endTime;
		}

		curVerticalEnd = batch.endTime;

		// Update currentRow to be ready for next batch if it needs to go beyond existing rows
		currentRow = Math.max(currentRow, prRow + 1);
		maxRow = Math.max(maxRow, prRow + 1);
	}

	maxRow = currentRow;

	return {
		maxTime,
		maxRow
	};
}

/**
 * Renders the queue visualization on a canvas
 * @param {HTMLCanvasElement} canvas - The canvas element to render on
 * @param {Array} batches - Array of batch objects (with layout already calculated)
 * @param {Object} layout - Layout information from calculateLayout
 */
function renderToCanvas(canvas, batches, layout) {
	const ctx = canvas.getContext('2d');
	const { maxTime, maxRow } = layout;

	// Constants for rendering
	const ROW_HEIGHT = 30;
	const PR_RADIUS = 8;
	const DIAMOND_SIZE = 10;
	const X_OFFSET = 50;
	const Y_OFFSET = 50;
	const MAX_CANVAS_WIDTH = 5000; // Maximum canvas width to avoid browser issues

	// Calculate scaling based on coordinates
	const availableWidth = MAX_CANVAS_WIDTH - (2 * X_OFFSET);
	const TIME_SCALE = availableWidth / maxTime; // pixels per second
	const requiredHeight = Y_OFFSET + (maxRow + 1) * ROW_HEIGHT;
	const requiredWidth = Math.min(MAX_CANVAS_WIDTH, (maxTime * TIME_SCALE) + (2 * X_OFFSET));

	// Set canvas dimensions before drawing
	canvas.height = Math.max(1000, requiredHeight);
	canvas.width = Math.max(2000, requiredWidth);

	// Clear canvas
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	// Step 1: Draw all connecting lines first
	let prevX = null;
	let prevY = null;

	ctx.strokeStyle = 'black';
	ctx.lineWidth = 3;

	for (const batch of batches) {
		// Draw lines to each PR in the batch
		for (const pr of batch.pullRequests) {
			const y = Y_OFFSET + pr.row * ROW_HEIGHT;
			const x = X_OFFSET + pr.time * TIME_SCALE;

			// Draw connecting line from previous element
			if (prevX !== null && prevY !== null) {
				ctx.beginPath();
				ctx.moveTo(prevX, prevY);
				ctx.lineTo(x, y);
				ctx.stroke();
			}

			// Update previous position
			prevX = x;
			prevY = y;
		}

		// Draw line to batch separator
		const diamondY = Y_OFFSET + batch.row * ROW_HEIGHT;
		const diamondX = X_OFFSET + batch.time * TIME_SCALE;

		if (prevX !== null && prevY !== null) {
			ctx.beginPath();
			ctx.moveTo(prevX, prevY);
			ctx.lineTo(diamondX, diamondY);
			ctx.stroke();
		}

		// Update previous position
		prevX = diamondX;
		prevY = diamondY;
	}

	// Step 2: Draw all other elements (rectangles, circles, diamonds)
	for (const batch of batches) {
		// Render each PR in the batch
		for (const pr of batch.pullRequests) {
			const y = Y_OFFSET + pr.row * ROW_HEIGHT;
			const x = X_OFFSET + pr.time * TIME_SCALE;

			// Draw fast build rectangle (green or red)
			ctx.fillStyle = 'green';
			const fastBuildWidth = Math.min(1, pr.FastBuildTime * TIME_SCALE);
			ctx.fillRect(x, y - PR_RADIUS, fastBuildWidth, PR_RADIUS * 2);

			// Draw PR circle (black)
			ctx.fillStyle = pr.FastBuildPasses ? 'black' : 'red';
			ctx.beginPath();
			ctx.arc(x, y, PR_RADIUS, 0.5 * Math.PI, 1.5 * Math.PI);
			ctx.fill();
		}

		// Draw batch separator (diamond and full build rectangle)
		const diamondY = Y_OFFSET + batch.row * ROW_HEIGHT;
		const diamondX = X_OFFSET + batch.time * TIME_SCALE;

		// Draw full build rectangle (red)
		ctx.fillStyle = batch.FullBuildPasses ? 'green' : 'red';
		const fullBuildWidth = Math.min(1, batch.maxFullBuildTime * TIME_SCALE);
		ctx.fillRect(diamondX, diamondY - DIAMOND_SIZE, fullBuildWidth, DIAMOND_SIZE * 2);

		// Draw diamond
		ctx.fillStyle = batch.FullBuildPasses ? 'blue' : 'red';
		ctx.beginPath();
		ctx.moveTo(diamondX, diamondY - DIAMOND_SIZE);
		ctx.lineTo(diamondX + DIAMOND_SIZE, diamondY);
		ctx.lineTo(diamondX, diamondY + DIAMOND_SIZE);
		ctx.lineTo(diamondX - DIAMOND_SIZE, diamondY);
		ctx.closePath();
		ctx.fill();
	}
}

/**
 * Main entry point: renders the queue visualization
 * @param {HTMLCanvasElement} canvas - The canvas element to render on
 * @param {Array} batches - Array of batch objects with pull requests
 */
export function renderQueue(canvas, batches) {
	const layout = calculateLayout(batches);
	renderToCanvas(canvas, batches, layout);
}
