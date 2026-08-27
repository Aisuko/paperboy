// The four pipeline zones from the source Orchestra dashboard, kept as a
// single source of truth for colouring the overview world's legend and the
// platforms/connectors that represent each zone in 3D.

export const ZONES = [
	{
		key: 'input',
		index: '01',
		label: 'Input Data',
		color: 0x6ea8fe,
		blurb: 'Battery telemetry streamed in and projected into a 768-dimensional feature space.',
	},
	{
		key: 'council',
		index: '02',
		label: 'Multi-Agent Estimation',
		color: 0xa78bfa,
		blurb: 'Independent SOH and RUL agent groups, plus Risk and Uncertainty modules, estimate in parallel.',
	},
	{
		key: 'aggregation',
		index: '03',
		label: 'Uncertainty-Aware Aggregation',
		color: 0x4dd0e1,
		blurb: 'Agent outputs are combined by inverse-variance weighting, disagreement is measured, and weights are refined until they converge.',
	},
	{
		key: 'output',
		index: '04',
		label: 'Final Output',
		color: 0x4ec9b0,
		blurb: 'A single unified SOH, RUL, Risk and Uncertainty estimate, ready for downstream decisions.',
	},
];
