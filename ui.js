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
	const batches = simulateQueue();
	if (batches) {
		const canvas = document.getElementById('queueCanvas');
		renderQueue(canvas, batches);
	}
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
