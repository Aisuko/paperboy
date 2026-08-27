// The four-step uncertainty-aware aggregation loop. `trace` is what the
// left-hand console prints for each step; the numbers in it are computed at
// runtime from data/council.js so the log and the 3D scene always agree.

export const AGGREGATION_STEPS = [
	{
		title: 'Collect the votes',
		description: 'Every agent reports a point estimate and its own uncertainty σ. Nothing is combined yet — the council is just on the record.',
	},
	{
		title: 'Weight by confidence',
		description: 'Weights are set to 1/σ² and renormalised, so a confident agent pulls the consensus harder than a hesitant one. This is inverse-variance weighting, the same rule used to combine independent measurements anywhere else.',
	},
	{
		title: 'Measure disagreement',
		description: 'Spread is the sample standard deviation of the point estimates, taken relative to the consensus so one threshold covers both a percentage and a cycle count. Under τ the pipeline finalises; over it, the weights are refined and the loop runs again.',
	},
	{
		title: 'Unified estimate',
		description: 'Once the council converges, the weighted mean and its combined σ become the system\'s answer, and the risk band is derived from them.',
	},
];
