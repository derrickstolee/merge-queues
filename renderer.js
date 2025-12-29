/**
 * Renderer module for visualizing merge queue simulation results
 * New design: row per batch, showing PR events, batch creation, and completion
 */

/**
 * Calculates layout for row-per-batch visualization
 * @param {Array} batches - Array of batch objects
 * @returns {Object} Layout information including dimensions
 */
function calculateLayout(batches) {
	let maxTime = 0;

	// Find the maximum time across all events
	for (const batch of batches) {
		// Check PR queue times
		for (const entry of batch.prEntries) {
			if (entry.queueTime > maxTime) {
				maxTime = entry.queueTime;
			}
		}

		// Check batch create time
		if (batch.batchCreateTime && batch.batchCreateTime > maxTime) {
			maxTime = batch.batchCreateTime;
		}

		// Check build complete time
		if (batch.buildCompleteTime && batch.buildCompleteTime > maxTime) {
			maxTime = batch.buildCompleteTime;
		}

		// Check canceled time
		if (batch.canceledTime && batch.canceledTime > maxTime) {
			maxTime = batch.canceledTime;
		}
	}

	return {
		maxTime,
		numRows: batches.length
	};
}

/**
 * Renders the queue visualization on a canvas
 * @param {HTMLCanvasElement} canvas - The canvas element to render on
 * @param {Array} batches - Array of batch objects with lifecycle events
 * @param {Object} layout - Layout information from calculateLayout
 */
function renderToCanvas(canvas, batches, layout) {
	const ctx = canvas.getContext('2d');
	const { maxTime, numRows } = layout;

	// Constants for rendering
	const ROW_HEIGHT = 40;
	const PR_RADIUS = 6;
	const DIAMOND_SIZE = 8;
	const SQUARE_SIZE = 10;
	const X_OFFSET = 80;
	const Y_OFFSET = 30;
	const MAX_CANVAS_WIDTH = 5000;

	// Calculate scaling
	const availableWidth = MAX_CANVAS_WIDTH - (2 * X_OFFSET);
	const TIME_SCALE = availableWidth / (maxTime || 1);
	const requiredHeight = Y_OFFSET + numRows * ROW_HEIGHT + Y_OFFSET;
	const requiredWidth = Math.min(MAX_CANVAS_WIDTH, (maxTime * TIME_SCALE) + (2 * X_OFFSET));

	// Set canvas dimensions
	canvas.height = Math.max(600, requiredHeight);
	canvas.width = Math.max(1200, requiredWidth);

	// Clear canvas
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	// Draw background grid (optional light gray lines)
	ctx.strokeStyle = '#f0f0f0';
	ctx.lineWidth = 1;
	for (let i = 0; i <= numRows; i++) {
		const y = Y_OFFSET + i * ROW_HEIGHT;
		ctx.beginPath();
		ctx.moveTo(X_OFFSET, y);
		ctx.lineTo(canvas.width - X_OFFSET, y);
		ctx.stroke();
	}

	// Draw each batch in its row
	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = batches[batchIndex];
		const rowY = Y_OFFSET + batchIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

		// Draw batch label
		ctx.fillStyle = 'black';
		ctx.font = '12px monospace';
		ctx.textAlign = 'right';
		const label = batch.status === 'incomplete' ? `Batch ${batchIndex}*` : `Batch ${batchIndex}`;
		ctx.fillText(label, X_OFFSET - 10, rowY + 4);

		// Draw PR events
		const prEntries = batch.prEntries || [];
		for (const entry of prEntries) {
			const x = X_OFFSET + entry.queueTime * TIME_SCALE;

			if (entry.isRequeued) {
				// Requeued PR: gray circle (outline only)
				ctx.strokeStyle = 'gray';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.arc(x, rowY, PR_RADIUS, 0, 2 * Math.PI);
				ctx.stroke();
			} else {
				// First-time PR: filled dot
				ctx.fillStyle = 'black';
				ctx.beginPath();
				ctx.arc(x, rowY, PR_RADIUS, 0, 2 * Math.PI);
				ctx.fill();
			}

			// If PR was evicted, draw gray X on top
			if (entry.pr.evicted) {
				ctx.strokeStyle = 'gray';
				ctx.lineWidth = 2;
				const xSize = PR_RADIUS + 2;
				ctx.beginPath();
				ctx.moveTo(x - xSize, rowY - xSize);
				ctx.lineTo(x + xSize, rowY + xSize);
				ctx.moveTo(x + xSize, rowY - xSize);
				ctx.lineTo(x - xSize, rowY + xSize);
				ctx.stroke();
			}
		}

		// Draw batch creation diamond
		if (batch.batchCreateTime !== undefined) {
			const diamondX = X_OFFSET + batch.batchCreateTime * TIME_SCALE;

			ctx.fillStyle = 'blue';
			ctx.beginPath();
			ctx.moveTo(diamondX, rowY - DIAMOND_SIZE);
			ctx.lineTo(diamondX + DIAMOND_SIZE, rowY);
			ctx.lineTo(diamondX, rowY + DIAMOND_SIZE);
			ctx.lineTo(diamondX - DIAMOND_SIZE, rowY);
			ctx.closePath();
			ctx.fill();
		}

		// Draw build completion or cancellation
		const completionTime = batch.buildCompleteTime || batch.canceledTime;
		if (completionTime !== undefined) {
			const completeX = X_OFFSET + completionTime * TIME_SCALE;

			if (batch.status === 'success') {
				// Green square for success
				ctx.fillStyle = 'green';
				ctx.fillRect(
					completeX - SQUARE_SIZE / 2,
					rowY - SQUARE_SIZE / 2,
					SQUARE_SIZE,
					SQUARE_SIZE
				);
			} else if (batch.status === 'failed') {
				// Red X for failure
				ctx.strokeStyle = 'red';
				ctx.lineWidth = 3;
				const xSize = SQUARE_SIZE;
				ctx.beginPath();
				ctx.moveTo(completeX - xSize, rowY - xSize);
				ctx.lineTo(completeX + xSize, rowY + xSize);
				ctx.moveTo(completeX + xSize, rowY - xSize);
				ctx.lineTo(completeX - xSize, rowY + xSize);
				ctx.stroke();
			} else if (batch.status === 'canceled') {
				// Gray X for canceled
				ctx.strokeStyle = 'gray';
				ctx.lineWidth = 3;
				const xSize = SQUARE_SIZE;
				ctx.beginPath();
				ctx.moveTo(completeX - xSize, rowY - xSize);
				ctx.lineTo(completeX + xSize, rowY + xSize);
				ctx.moveTo(completeX + xSize, rowY - xSize);
				ctx.lineTo(completeX - xSize, rowY + xSize);
				ctx.stroke();
			}

			// Draw line from diamond to completion/cancellation marker
			if (batch.batchCreateTime !== undefined) {
				const diamondX = X_OFFSET + batch.batchCreateTime * TIME_SCALE;
				ctx.strokeStyle = '#ccc';
				ctx.lineWidth = 1;
				ctx.setLineDash([5, 3]);
				ctx.beginPath();
				ctx.moveTo(diamondX, rowY);
				ctx.lineTo(completeX, rowY);
				ctx.stroke();
				ctx.setLineDash([]);
			}
		}
	}

	// Draw legend
	const legendX = canvas.width - 200;
	const legendY = 20;
	ctx.font = '11px sans-serif';
	ctx.textAlign = 'left';

	let legendYOffset = legendY;

	// First-time PR
	ctx.fillStyle = 'black';
	ctx.beginPath();
	ctx.arc(legendX, legendYOffset, PR_RADIUS, 0, 2 * Math.PI);
	ctx.fill();
	ctx.fillText('PR queued', legendX + 15, legendYOffset + 4);
	legendYOffset += 20;

	// Requeued PR
	ctx.strokeStyle = 'gray';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.arc(legendX, legendYOffset, PR_RADIUS, 0, 2 * Math.PI);
	ctx.stroke();
	ctx.fillStyle = 'black';
	ctx.fillText('PR requeued', legendX + 15, legendYOffset + 4);
	legendYOffset += 20;

	// Evicted PR
	ctx.strokeStyle = 'gray';
	ctx.lineWidth = 2;
	const xSize = PR_RADIUS + 2;
	ctx.beginPath();
	ctx.moveTo(legendX - xSize, legendYOffset - xSize);
	ctx.lineTo(legendX + xSize, legendYOffset + xSize);
	ctx.moveTo(legendX + xSize, legendYOffset - xSize);
	ctx.lineTo(legendX - xSize, legendYOffset + xSize);
	ctx.stroke();
	ctx.fillText('PR evicted', legendX + 15, legendYOffset + 4);
	legendYOffset += 20;

	// Batch created
	ctx.fillStyle = 'blue';
	ctx.beginPath();
	ctx.moveTo(legendX, legendYOffset - DIAMOND_SIZE);
	ctx.lineTo(legendX + DIAMOND_SIZE, legendYOffset);
	ctx.lineTo(legendX, legendYOffset + DIAMOND_SIZE);
	ctx.lineTo(legendX - DIAMOND_SIZE, legendYOffset);
	ctx.closePath();
	ctx.fill();
	ctx.fillStyle = 'black';
	ctx.fillText('Batch created', legendX + 15, legendYOffset + 4);
	legendYOffset += 20;

	// Success
	ctx.fillStyle = 'green';
	ctx.fillRect(legendX - SQUARE_SIZE / 2, legendYOffset - SQUARE_SIZE / 2, SQUARE_SIZE, SQUARE_SIZE);
	ctx.fillStyle = 'black';
	ctx.fillText('Merged', legendX + 15, legendYOffset + 4);
	legendYOffset += 20;

	// Failed
	ctx.strokeStyle = 'red';
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(legendX - SQUARE_SIZE, legendYOffset - SQUARE_SIZE);
	ctx.lineTo(legendX + SQUARE_SIZE, legendYOffset + SQUARE_SIZE);
	ctx.moveTo(legendX + SQUARE_SIZE, legendYOffset - SQUARE_SIZE);
	ctx.lineTo(legendX - SQUARE_SIZE, legendYOffset + SQUARE_SIZE);
	ctx.stroke();
	ctx.fillStyle = 'black';
	ctx.fillText('Failed', legendX + 15, legendYOffset + 4);
	legendYOffset += 20;

	// Canceled
	ctx.strokeStyle = 'gray';
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(legendX - SQUARE_SIZE, legendYOffset - SQUARE_SIZE);
	ctx.lineTo(legendX + SQUARE_SIZE, legendYOffset + SQUARE_SIZE);
	ctx.moveTo(legendX + SQUARE_SIZE, legendYOffset - SQUARE_SIZE);
	ctx.lineTo(legendX - SQUARE_SIZE, legendYOffset + SQUARE_SIZE);
	ctx.stroke();
	ctx.fillStyle = 'black';
	ctx.fillText('Canceled', legendX + 15, legendYOffset + 4);
	legendYOffset += 20;

	// Incomplete batch note
	ctx.fillStyle = 'black';
	ctx.font = '10px sans-serif';
	ctx.fillText('* = Incomplete batch', legendX - 5, legendYOffset + 4);
}

/**
 * Main entry point: renders the queue visualization
 * @param {HTMLCanvasElement} canvas - The canvas element to render on
 * @param {Array} batches - Array of batch objects with lifecycle events
 */
export function renderQueue(canvas, batches) {
	const layout = calculateLayout(batches);
	renderToCanvas(canvas, batches, layout);
}
