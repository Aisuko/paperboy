// The council's arithmetic, in one place.
//
// The earlier version of this exhibit hard-coded a consensus of 94.2% next to
// three agent estimates that did not actually average to it, and a risk band
// that was simply asserted. Everything below is computed instead: the panels,
// the 3D gauges and the console trace all read the same functions, so they
// cannot drift apart.
//
// The aggregation rule is inverse-variance weighting — the standard way to
// combine estimators that each report their own uncertainty. An agent that is
// confident (small σ) pulls the consensus harder than one that is not.

export const SOH_AGENTS = [
	{ id: 'soh-1', name: 'SOH Agent 1', estimate: 94.2, sigma: 0.9, unit: '%', blurb: 'Capacity-fade expert: fits the discharge-capacity curve against cycle count.' },
	{ id: 'soh-2', name: 'SOH Agent 2', estimate: 93.8, sigma: 1.4, unit: '%', blurb: 'Internal-resistance expert: infers health from DC resistance growth.' },
	{ id: 'soh-3', name: 'SOH Agent 3', estimate: 94.5, sigma: 1.1, unit: '%', blurb: 'Differential-voltage expert: tracks the movement of dQ/dV peaks.' },
];

export const RUL_AGENTS = [
	{ id: 'rul-1', name: 'RUL Agent 1', estimate: 315, sigma: 22, unit: ' cyc', blurb: 'Extrapolates the cycle-to-cycle fade rate to the 80% end-of-life threshold.' },
	{ id: 'rul-2', name: 'RUL Agent 2', estimate: 308, sigma: 31, unit: ' cyc', blurb: 'Conditions the same extrapolation on the pack\'s thermal history.' },
	{ id: 'rul-3', name: 'RUL Agent 3', estimate: 312, sigma: 26, unit: ' cyc', blurb: 'Matches this pack against the nearest trajectories in a reference fleet.' },
];

// Disagreement is measured relative to the size of the quantity, so one
// threshold can cover both a percentage (SOH) and a cycle count (RUL). Above
// this, the pipeline loops back and reweights instead of finalising.
export const DISAGREEMENT_THRESHOLD = 0.015; // 1.5% of the consensus value

function mean( values ) {

	return values.reduce( ( a, b ) => a + b, 0 ) / values.length;

}

// Sample standard deviation of the point estimates — the council's own measure
// of how much its members disagree, independent of the σ each one reports.
export function spread( agents ) {

	const values = agents.map( ( a ) => a.estimate );
	if ( values.length < 2 ) return 0;
	const m = mean( values );
	const variance = values.reduce( ( sum, v ) => sum + ( v - m ) ** 2, 0 ) / ( values.length - 1 );
	return Math.sqrt( variance );

}

// Inverse-variance weighted mean, plus the combined σ that comes with it.
export function combine( agents ) {

	const weights = agents.map( ( a ) => 1 / ( a.sigma ** 2 ) );
	const total = weights.reduce( ( a, b ) => a + b, 0 );
	const value = agents.reduce( ( sum, a, i ) => sum + a.estimate * weights[ i ], 0 ) / total;

	const sd = spread( agents );
	const relative = Math.abs( value ) > 1e-9 ? sd / Math.abs( value ) : 0;

	return {
		value,
		sigma: Math.sqrt( 1 / total ),
		weights: weights.map( ( w ) => w / total ),
		spread: sd,
		relativeSpread: relative,
		converged: relative <= DISAGREEMENT_THRESHOLD,
	};

}

// Degradation risk, derived from the two consensus numbers rather than
// asserted: how far below full health the pack has fallen, plus how little
// life it has left against a 400-cycle planning horizon.
export const RISK_BANDS = [
	{ max: 33, label: 'Low', color: 0x6fcf7f },
	{ max: 66, label: 'Medium', color: 0xe8a33d },
	{ max: 101, label: 'High', color: 0xe5644e },
];

export function riskFrom( soh, rul ) {

	const health = ( 100 - soh ) * 2; // 0 at full health, 100 at 50% SOH
	const life = ( ( 400 - rul ) / 400 ) * 100; // 0 with 400 cycles left, 100 at end of life
	const index = Math.max( 0, Math.min( 100, health * 0.5 + life * 0.5 ) );
	const band = RISK_BANDS.find( ( b ) => index < b.max ) || RISK_BANDS[ RISK_BANDS.length - 1 ];
	return { index, ...band };

}

// Robust reweighting: when the council disagrees badly, one member is usually
// wrong rather than all of them being slightly off. Members further than
// `cutoff` robust standard deviations from the median are dropped and the rest
// are recombined — this is what the aggregation loop does on its second pass.
export function robustCombine( agents, { cutoff = 3 } = {} ) {

	const values = agents.map( ( a ) => a.estimate ).sort( ( a, b ) => a - b );
	const median = values[ Math.floor( values.length / 2 ) ];

	const deviations = agents.map( ( a ) => Math.abs( a.estimate - median ) ).sort( ( a, b ) => a - b );
	const mad = deviations[ Math.floor( deviations.length / 2 ) ];
	// 1.4826 rescales a median absolute deviation to a standard deviation for
	// normally distributed data.
	const scale = Math.max( 1e-6, mad * 1.4826 );

	const kept = agents.filter( ( a ) => Math.abs( a.estimate - median ) / scale <= cutoff );
	const rejected = agents.filter( ( a ) => ! kept.includes( a ) );

	return { ...combine( kept.length >= 2 ? kept : agents ), kept, rejected };

}

// One call producing every number the pages need.
export function assess( { sohAgents = SOH_AGENTS, rulAgents = RUL_AGENTS } = {} ) {

	const soh = combine( sohAgents );
	const rul = combine( rulAgents );
	const risk = riskFrom( soh.value, rul.value );

	return {
		soh,
		rul,
		risk,
		converged: soh.converged && rul.converged,
	};

}

export const MODULES = [
	{
		id: 'risk',
		name: 'Risk module',
		category: 'Degradation risk',
		color: 0xe8a33d,
		blurb: 'Turns the two consensus numbers into a single Low / Medium / High band.',
		description: 'The risk index weights how far state of health has fallen against how little useful life is left, on a 400-cycle planning horizon. It is derived, not estimated — change either consensus number and the band moves with it.',
	},
	{
		id: 'uncertainty',
		name: 'Uncertainty module',
		category: 'Uncertainty estimation',
		color: 0x4dd0e1,
		blurb: 'Reports the combined σ of the weighted consensus.',
		description: 'Inverse-variance weighting produces its own error bar: σ = √(1 / Σ 1/σᵢ²). Combining three agents always yields a tighter interval than any one of them alone, which is the mathematical reason a council beats a single estimator.',
	},
];

export function getAgent( id ) {

	return [ ...SOH_AGENTS, ...RUL_AGENTS, ...MODULES ].find( ( a ) => a.id === id ) || null;

}
