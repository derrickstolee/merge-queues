/**
 * UI coordination module
 * Handles DOM manipulation, event listeners, and coordination between modules
 */

import { generatePullRequests } from './generator.js';
import { simulateSimpleStrategy } from './simple.js';
import { renderQueue } from './renderer.js';

/**
 * Copies text content from a textarea to clipboard
 * @param {string} elementId - ID of the textarea element
 */
function copyToClipboard(elementId) {
	const element = document.getElementById(elementId);
	element.select();
	element.setSelectionRange(0, 99999); // For mobile devices
	navigator.clipboard.writeText(element.value)
		.catch(err => {
			console.error('Failed to copy: ', err);
		});
}

/**
 * Handles the Generate button click
 * Reads form values, generates PR data, and updates the textarea
 */
function handleGenerate() {
	// Get form values
	const config = {
		numPRs: parseInt(document.getElementById('numPRs').value) || 0,
		prsPerHour: parseInt(document.getElementById('prsPerHour').value) || 1,
		buildSpeedFast: parseInt(document.getElementById('buildSpeedFast').value) || 0,
		buildSuccessRateFast: parseFloat(document.getElementById('buildSuccessRateFast').value) || 0,
		buildSpeedVarianceFast: parseInt(document.getElementById('buildSpeedVarianceFast').value) || 0,
		buildSpeedFull: parseInt(document.getElementById('buildSpeedFull').value) || 0,
		buildSuccessRateFull: parseFloat(document.getElementById('buildSuccessRateFull').value) || 0,
		buildSpeedVarianceFull: parseInt(document.getElementById('buildSpeedVarianceFull').value) || 0
	};

	// Generate pull requests
	const pullRequests = generatePullRequests(config);

	// Populate the input data textarea with JSON
	document.getElementById('inputData').value = JSON.stringify(pullRequests, null, 2);
}

/**
 * Runs the simulation and renders the results
 */
function simulateAndRender() {
	const result = simulateQueue();
	if (result && result.batches) {
		const canvas = document.getElementById('queueCanvas');
		// Pass all batches (including failed and canceled) to renderer
		renderQueue(canvas, result.batches);

		// Render statistics
		if (result.statistics) {
			renderStatistics(result.statistics);
		}
	}
}

/**
 * Renders statistics in a table
 * @param {Object} stats - Statistics object from simulation
 */
function renderStatistics(stats) {
	const container = document.getElementById('statisticsContainer');

	// Format time in seconds to a readable format
	function formatTime(seconds) {
		if (seconds < 60) {
			return `${Math.round(seconds)}s`;
		} else if (seconds < 3600) {
			const mins = Math.floor(seconds / 60);
			const secs = Math.round(seconds % 60);
			return `${mins}m ${secs}s`;
		} else {
			const hours = Math.floor(seconds / 3600);
			const mins = Math.floor((seconds % 3600) / 60);
			return `${hours}h ${mins}m`;
		}
	}

	const html = `
		<table style="border-collapse: collapse; width: 100%; max-width: 800px;">
			<thead>
				<tr style="background-color: #f0f0f0;">
					<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Metric</th>
					<th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Value</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px;">Merged Pull Requests</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold; color: green;">${stats.mergedPRs}</td>
				</tr>
				<tr style="background-color: #f9f9f9;">
					<td style="border: 1px solid #ddd; padding: 8px;">Evicted Pull Requests</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-weight: bold; color: red;">${stats.evictedPRs}</td>
				</tr>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">Fairly Evicted (fast build failed)</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: #cc6600;">${stats.fairlyEvictedPRs}</td>
				</tr>
				<tr style="background-color: #f9f9f9;">
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">Unfairly Evicted (full build failed)</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right; color: #cc0000;">${stats.unfairlyEvictedPRs}</td>
				</tr>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px;">Queued Builds</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${stats.queuedBuilds}</td>
				</tr>
				<tr style="background-color: #f9f9f9;">
					<td style="border: 1px solid #ddd; padding: 8px;">Canceled Builds</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${stats.canceledBuilds}</td>
				</tr>
				<tr style="background-color: #e8f4f8;">
					<td colspan="2" style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Waiting Time Statistics (Merged PRs)</td>
				</tr>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">Median</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.waitingTimeMedian)}</td>
				</tr>
				<tr style="background-color: #f9f9f9;">
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">80th Percentile</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.waitingTimeP80)}</td>
				</tr>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">Maximum</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.waitingTimeMax)}</td>
				</tr>
				<tr style="background-color: #ffe8e8;">
					<td colspan="2" style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Time to Eviction (Evicted PRs)</td>
				</tr>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">Median</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.evictionTimeMedian)}</td>
				</tr>
				<tr style="background-color: #f9f9f9;">
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">80th Percentile</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.evictionTimeP80)}</td>
				</tr>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">Maximum</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.evictionTimeMax)}</td>
				</tr>
				<tr style="background-color: #e8f4f8;">
					<td colspan="2" style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Branch Staleness</td>
				</tr>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">Median</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.stalenessMedian)}</td>
				</tr>
				<tr style="background-color: #f9f9f9;">
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">80th Percentile</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.stalenessP80)}</td>
				</tr>
				<tr>
					<td style="border: 1px solid #ddd; padding: 8px; padding-left: 24px;">Maximum</td>
					<td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${formatTime(stats.stalenessMax)}</td>
				</tr>
			</tbody>
		</table>
		<p style="margin-top: 10px; font-size: 12px; color: #666;">
			<strong>Branch Staleness:</strong> Time since the last successful merge at any given second.
			Lower values mean the branch is updated more frequently.
		</p>
	`;

	container.innerHTML = html;
}

/**
 * Handles the Simulate button click
 * Reads settings and input data, runs simulation, and updates output
 * @returns {Array|null} Array of batches or null if error
 */
function simulateQueue() {
	try {
		// Get settings
		const maxBatchSize = parseInt(document.getElementById('maxBatchSize').value) || 1;
		const strategy = document.getElementById('strategy').value;

		// Parse input data
		const inputData = document.getElementById('inputData').value;
		const pullRequests = JSON.parse(inputData);

		if (!Array.isArray(pullRequests) || pullRequests.length === 0) {
			alert('Invalid or empty input data. Please generate pull requests first.');
			return null;
		}

		let result = simulateSimpleStrategy(pullRequests, maxBatchSize);

		// Debug: Log batch details to console
		console.log('Simulation complete. Batches:', result.batches.length);
		result.batches.forEach((batch, i) => {
			console.log(`Batch ${i}: status=${batch.status}, PRs=${batch.prs.length}, prEntries=${batch.prEntries.length}`);
		});

		// Populate the output data textarea with JSON
		document.getElementById('outputData').value = JSON.stringify(result, null, 2);

		return result;

	} catch (error) {
		alert('Error simulating queue: ' + error.message);
		console.error('Simulation error:', error);
		return null;
	}
}

// Initialize UI when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
	// Set up event listeners
	document.getElementById('generateBtn').addEventListener('click', handleGenerate);
	document.getElementById('simulateBtn').addEventListener('click', simulateAndRender);

	// Make copyToClipboard available globally for inline onclick handlers
	window.copyToClipboard = copyToClipboard;

	// Prevent form submissions to keep inputs editable
	document.querySelectorAll('form').forEach(form => {
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			return false;
		});
	});
});
