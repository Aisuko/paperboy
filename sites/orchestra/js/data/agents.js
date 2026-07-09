// Agent/module roster for the Multi-Agent Council world, sourced from the
// original Orchestra dashboard's SOH/RUL agent groups and Risk/Uncertainty
// modules.

export const SOH_AGENTS = [
	{ id: 'soh-1', name: 'SOH Agent 1', estimate: '94.2%', blurb: 'State-of-health expert trained on capacity-fade curves.' },
	{ id: 'soh-2', name: 'SOH Agent 2', estimate: '93.8%', blurb: 'State-of-health expert weighting internal-resistance drift.' },
	{ id: 'soh-n', name: 'SOH Agent N', estimate: '94.5%', blurb: 'Additional council members trained on complementary degradation signals.' },
];

export const RUL_AGENTS = [
	{ id: 'rul-1', name: 'RUL Agent 1', estimate: '315 cyc', blurb: 'Remaining-useful-life expert extrapolating cycle-to-cycle fade rate.' },
	{ id: 'rul-2', name: 'RUL Agent 2', estimate: '308 cyc', blurb: 'Remaining-useful-life expert conditioned on thermal history.' },
	{ id: 'rul-n', name: 'RUL Agent N', estimate: '312 cyc', blurb: 'Additional council members trained on complementary degradation signals.' },
];

export const MODULES = [
	{
		id: 'risk',
		name: 'Risk Module',
		category: 'Degradation Risk Assessment',
		estimate: 'Low',
		color: 0xf5a623,
		blurb: 'Turns SOH/RUL estimates into a Low / Med / High degradation-risk gauge.',
		description: 'The Risk module consumes the council\'s SOH and RUL estimates and maps their trajectory onto a continuous risk gauge, flagging packs that are degrading faster than their cohort.',
	},
	{
		id: 'uncertainty',
		name: 'Uncertainty Module',
		category: 'Uncertainty Estimation',
		estimate: '±2.1%',
		color: 0x06b6d4,
		blurb: 'Estimates a prediction interval (σ) around the council\'s consensus.',
		description: 'The Uncertainty module fits a distribution over the council\'s disagreement, producing the σ that the aggregation stage uses to decide whether to trust the consensus or keep refining it.',
	},
];

export function getAgent( id ) {

	return [ ...SOH_AGENTS, ...RUL_AGENTS, ...MODULES ].find( ( a ) => a.id === id );

}
