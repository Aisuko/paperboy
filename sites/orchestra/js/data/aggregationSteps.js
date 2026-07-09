// The four-step uncertainty-aware aggregation sequence from the source
// Orchestra dashboard's Zone 3.

export const AGGREGATION_STEPS = [
	{
		title: 'Aggregate outputs',
		description: 'Combine SOH, RUL, Risk and Uncertainty outputs from every agent using uncertainty-aware weighting to form an initial estimate.',
		tags: [ 'SOH', 'RUL', 'Risk', 'Unc.' ],
	},
	{
		title: 'Detect disagreement',
		description: 'Measure inter-agent disagreement among the council\'s predictions against a threshold τ. Low disagreement moves straight to a final estimate; high disagreement loops back to refine the weights.',
		tags: [],
	},
	{
		title: 'Refine aggregation weights',
		description: 'When disagreement exceeds τ, reweight contributions using the uncertainty estimates and renormalize before aggregating again.',
		tags: [],
	},
	{
		title: 'Produce unified estimate',
		description: 'Once the council converges, generate the final unified SOH, RUL, Risk and Uncertainty estimate for downstream decision-making.',
		tags: [ 'SOH ✓', 'RUL ✓', 'Risk ✓', 'Unc. ✓' ],
	},
];
