// Next-token candidates for the running prompt "How is the weather today",
// plus the decoding maths the 04 Output page runs live.
//
// The logits are illustrative but the arithmetic on top of them is not: every
// probability, cut-off and loss shown anywhere in this exhibit is computed by
// the functions below from these numbers, so the panels can never drift out of
// agreement with each other the way hard-coded values do.
//
// These five are the top of a 50,257-long logit vector. Softmax over the full
// vocabulary is not something a page can show, so everything here is
// renormalised over this top-5 slice and labelled as such.

import { GPT2 } from './gpt2.js';

export const CANDIDATES = [
	{ token: '?', display: '?', id: 30, logit: 9.42 },
	{ token: ' in', display: '·in', id: 287, logit: 7.31 },
	{ token: ',', display: ',', id: 11, logit: 6.88 },
	{ token: ' here', display: '·here', id: 994, logit: 6.05 },
	{ token: ' and', display: '·and', id: 290, logit: 5.71 },
];

// The token that actually continues the sentence — the training target used by
// 05 Train to turn a probability into a loss.
export const TARGET_ID = 30;

export const VOCAB_SIZE = GPT2.vocabSize;

export const DEFAULTS = { temperature: 1.0, topP: 0.9 };

// --------------------------------------------------------------- softmax

// Numerically stable softmax with temperature. T < 1 sharpens the
// distribution, T > 1 flattens it, T -> 0 approaches argmax.
export function softmax( logits, temperature = 1 ) {

	const t = Math.max( 0.01, temperature );
	const scaled = logits.map( ( z ) => z / t );
	const max = Math.max( ...scaled );
	const exps = scaled.map( ( z ) => Math.exp( z - max ) );
	const sum = exps.reduce( ( a, b ) => a + b, 0 );
	return exps.map( ( e ) => e / sum );

}

// --------------------------------------------------------------- nucleus

// Top-p (nucleus) sampling: sort by probability, keep the shortest prefix whose
// cumulative probability reaches p, drop the rest, renormalise what is left.
// The first candidate is always kept, even when its own probability already
// exceeds p — otherwise a very confident step would leave nothing to sample.
export function nucleus( probs, p ) {

	const order = probs
		.map( ( prob, index ) => ( { index, prob } ) )
		.sort( ( a, b ) => b.prob - a.prob );

	const kept = [];
	let cumulative = 0;

	for ( const entry of order ) {

		kept.push( { ...entry, cumulativeBefore: cumulative } );
		cumulative += entry.prob;
		if ( cumulative >= p ) break;

	}

	const keptMass = kept.reduce( ( sum, e ) => sum + e.prob, 0 );
	const keptSet = new Set( kept.map( ( e ) => e.index ) );

	return {
		keptIndices: keptSet,
		cumulative: keptMass,
		// Probabilities after the dropped tail is removed and the survivors are
		// renormalised — this is what a sampler actually draws from.
		renormalised: probs.map( ( prob, index ) => ( keptSet.has( index ) ? prob / keptMass : 0 ) ),
		ranked: kept,
	};

}

// One call that produces every number the output page and its console need.
export function decode( { temperature = DEFAULTS.temperature, topP = DEFAULTS.topP } = {} ) {

	const logits = CANDIDATES.map( ( c ) => c.logit );
	const probs = softmax( logits, temperature );
	const nuc = nucleus( probs, topP );
	const targetIndex = CANDIDATES.findIndex( ( c ) => c.id === TARGET_ID );

	const rows = CANDIDATES.map( ( c, i ) => ( {
		...c,
		index: i,
		scaledLogit: c.logit / Math.max( 0.01, temperature ),
		prob: probs[ i ],
		kept: nuc.keptIndices.has( i ),
		sampleProb: nuc.renormalised[ i ],
		isTarget: c.id === TARGET_ID,
	} ) );

	const argmaxIndex = probs.indexOf( Math.max( ...probs ) );

	return {
		temperature,
		topP,
		rows,
		argmaxIndex,
		keptCount: nuc.keptIndices.size,
		keptMass: nuc.cumulative,
		targetProb: probs[ targetIndex ],
		// Cross-entropy loss for this position: -log of the probability the
		// model gave the token that actually comes next.
		nll: -Math.log( Math.max( 1e-12, probs[ targetIndex ] ) ),
		entropy: -probs.reduce( ( sum, p ) => sum + ( p > 0 ? p * Math.log( p ) : 0 ), 0 ),
	};

}

export const SCORE_TABLE = [
	{ type: 'Logit', range: '(-∞, +∞)', meaning: 'Raw score straight out of the linear layer' },
	{ type: 'Probability', range: '[0, 1]', meaning: 'Logit after temperature and softmax' },
	{ type: 'Log probability', range: '(-∞, 0]', meaning: 'log p — additive across a sequence' },
	{ type: 'NLL / cross-entropy', range: '[0, +∞)', meaning: '−log p of the correct token; the training loss' },
];
