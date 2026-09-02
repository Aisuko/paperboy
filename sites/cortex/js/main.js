import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput } from './utils/renderKit.js';
import { ProcessConsole } from './utils/console.js';
import { bindViewport } from './utils/viewport.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';

import { buildMlpWorld } from './worlds/mlp.js';
import { buildLinearWorld } from './worlds/linear.js';
import { buildSoftmaxWorld } from './worlds/softmax.js';

import { MLP_STEPS, LINEAR_STEPS, SOFTMAX_STEPS } from './data/copy.js';
import {
	GPT2, SHOWN, PROMPT, VOCAB_ROWS, DEFAULTS, TAIL_LOGIT,
	decode, sample, fmt, fmtVec, gelu, W1, W2,
} from './data/model.js';

const viewport = document.getElementById( 'viewport' );
const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
container.appendChild( renderer.domElement );

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

const camera = new THREE.PerspectiveCamera( 28, 1, 0.1, 400 );
camera.position.set( 0.2, 2.6, 21 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI * 0.62;

const renderPipeline = createRenderPipeline( renderer );
bindViewport( viewport, camera, [ renderer, labelRenderer ] );

const worlds = {
	mlp: buildMlpWorld(),
	linear: buildLinearWorld(),
	softmax: buildSoftmaxWorld(),
};

const STEPS = { mlp: MLP_STEPS, linear: LINEAR_STEPS, softmax: SOFTMAX_STEPS };

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

const sceneOutputs = {};
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera, { strength: 0.22, radius: 0.6, threshold: 0.6 } );

let currentKey = 'mlp';
renderPipeline.outputNode = sceneOutputs.mlp;

const proc = new ProcessConsole( document.getElementById( 'console' ) );

function flyTo( view, duration = 0.9 ) {

	controls.enabled = false;
	tweenVec3( camera.position, view.position, duration, { easing: Easing.cubicInOut } );
	tweenVec3( controls.target, view.target, duration, {
		easing: Easing.cubicInOut,
		onComplete: () => { controls.enabled = true; },
	} );

}

/* ------------------------------------------------------------ step cards */

function setCard( key, index ) {

	const card = document.querySelector( `[data-card="${ key }"]` );
	const step = STEPS[ key ][ index ];
	card.querySelector( '[data-role="kicker"]' ).textContent = step.kicker;
	card.querySelector( '[data-role="num"]' ).textContent = index + 1;
	card.querySelector( '[data-role="total"]' ).textContent = STEPS[ key ].length;
	card.querySelector( '[data-role="title"]' ).textContent = step.title;
	card.querySelector( '[data-role="desc"]' ).textContent = step.desc;
	card.querySelector( '[data-role="formula"]' ).textContent = step.formula;

}

/* ------------------------------------------------------------- scrubbers */

function makeScrubber( key, count, onStep ) {

	const root = document.querySelector( `.scrubber[data-scrub="${ key }"]` );
	const track = root.querySelector( '.scrubber-track' );
	const nodes = [];
	let index = 0;
	let timer = null;

	function paint() {

		nodes.forEach( ( n, i ) => {

			n.classList.toggle( 'active', i === index );
			n.classList.toggle( 'done', i < index );

		} );

	}

	function stop() {

		if ( timer ) { clearInterval( timer ); timer = null; }
		root.querySelector( '[data-act="play"]' ).innerHTML = PLAY_ICON;

	}

	function go( i ) {

		index = Math.max( 0, Math.min( count - 1, i ) );
		paint();
		onStep( index );

	}

	for ( let i = 0; i < count; i ++ ) {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.addEventListener( 'click', () => { stop(); go( i ); } );
		track.appendChild( node );
		nodes.push( node );

	}

	root.querySelector( '[data-act="prev"]' ).addEventListener( 'click', () => { stop(); go( index - 1 ); } );
	root.querySelector( '[data-act="next"]' ).addEventListener( 'click', () => { stop(); go( index + 1 ); } );
	root.querySelector( '[data-act="play"]' ).addEventListener( 'click', ( e ) => {

		if ( timer ) { stop(); return; }
		e.currentTarget.innerHTML = PAUSE_ICON;
		if ( index >= count - 1 ) go( 0 );
		timer = setInterval( () => {

			if ( index >= count - 1 ) { stop(); return; }
			go( index + 1 );

		}, 3200 );

	} );

	paint();
	return { go, stop, get index() { return index; } };

}

/* ------------------------------------------------------------ 01 · MLP */

let mlpToken = PROMPT.length - 1;

const mlpChips = document.getElementById( 'mlp-chips' );
PROMPT.forEach( ( token, i ) => {

	const chip = document.createElement( 'button' );
	chip.className = 'chip' + ( i === mlpToken ? ' active' : '' );
	chip.textContent = `"${ token.trim() }"`;
	chip.addEventListener( 'click', () => {

		mlpToken = i;
		[ ...mlpChips.children ].forEach( ( c, j ) => c.classList.toggle( 'active', j === i ) );
		worlds.mlp.setToken( i );
		mlpHeader();
		mlpStepTrace( mlpScrub.index );
		renderMlpTable();

	} );
	mlpChips.appendChild( chip );

} );

const mlpScrub = makeScrubber( 'mlp', MLP_STEPS.length, ( i ) => {

	worlds.mlp.setStep( i );
	setCard( 'mlp', i );
	mlpStepTrace( i );
	flyTo( worlds.mlp.getStepView( i ) );
	renderMlpTable();

} );

function renderMlpTable() {

	const s = worlds.mlp.getState();
	document.getElementById( 'mlp-table' ).innerHTML = `
		<tbody>
			<tr><td>shape</td><td class="num">768 → 3072 → 768</td></tr>
			<tr><td>drawn</td><td class="num">${ SHOWN.d } → ${ SHOWN.dff } → ${ SHOWN.d }</td></tr>
			<tr><td>firing</td><td class="num">${ s.fired } / ${ SHOWN.dff }</td></tr>
			<tr><td>params / block</td><td class="num">4.72 M</td></tr>
			<tr><td>share of model</td><td class="num">≈ 2 / 3</td></tr>
		</tbody>`;

}

function mlpHeader() {

	const s = worlds.mlp.getState();
	proc.clear();
	proc.setTitle( 'mlp — position-wise feed-forward' );
	proc.setStatus( 'computed', 'done' );
	proc.write( `x = residual["${ PROMPT[ mlpToken ].trim() }"]`, 'cmd' );
	proc.write( `x        ${ fmtVec( s.x ) }`, 'out' );
	proc.write( `W1       [${ GPT2.dFF } × ${ GPT2.dModel }]   b1 [${ GPT2.dFF }]`, 'dim' );
	proc.write( `W2       [${ GPT2.dModel } × ${ GPT2.dFF }]   b2 [${ GPT2.dModel }]`, 'dim' );
	proc.rule();

}

function mlpStepTrace( i ) {

	const s = worlds.mlp.getState();
	proc.write( `${ i + 1 }. ${ MLP_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'y = GELU(x @ W1.T + b1) @ W2.T + b2', 'calc' );
		proc.write( `${ GPT2.dModel } → ${ GPT2.dFF } → ${ GPT2.dModel }  ·  applied to every position separately, with the same weights`, 'out' );

	} else if ( i === 1 ) {

		proc.write( 'attention:  out_t = Σs α[t,s] · v_s        <b>linear</b> in v', 'out' );
		proc.write( 'two linear maps in a row collapse into one matrix', 'warn' );
		proc.write( 'GELU between them is what stops that collapse', 'calc' );

	} else if ( i === 2 ) {

		const terms = W1[ 0 ].map( ( w, d ) => w * s.x[ d ] );
		proc.write( `pre[0] = Σ W1[0,d]·x[d] + b1[0]`, 'cmd' );
		proc.write( `       = ${ terms.slice( 0, 4 ).map( ( t ) => fmt( t, 2 ) ).join( ' + ' ) } + … = ${ fmt( s.pre[ 0 ], 4 ) }`, 'calc' );
		proc.write( `pre      ${ fmtVec( s.pre, 2, 8 ) }`, 'out' );
		proc.write( `range    ${ fmt( Math.min( ...s.pre ), 3 ) } … ${ fmt( Math.max( ...s.pre ), 3 ) }`, 'dim' );

	} else if ( i === 3 ) {

		proc.write( 'act = GELU(pre)', 'cmd' );
		proc.write( `GELU(${ fmt( s.pre[ 0 ], 2 ) }) = ${ fmt( gelu( s.pre[ 0 ] ), 4 ) }`, 'calc' );
		proc.write( `firing   ${ s.fired } of ${ SHOWN.dff } drawn neurons pass 0.05`, 'ok' );
		proc.write( 'negative pre-activations are gated toward zero — the layer is sparse', 'out' );

	} else if ( i === 4 ) {

		const j = s.act.indexOf( Math.max( ...s.act ) );
		proc.write( 'y = Σj act[j] · W2[:,j] + b2', 'cmd' );
		proc.write( `loudest  neuron ${ j }  act ${ fmt( s.act[ j ], 3 ) }  writes ${ fmtVec( W2.map( ( row ) => row[ j ] * s.act[ j ] ), 2 ) }`, 'calc' );
		proc.write( `y        ${ fmtVec( s.y ) }`, 'out' );

	} else {

		proc.write( 'x ← x + MLP(LayerNorm(x))', 'cmd' );
		proc.write( `x + y    ${ fmtVec( s.out ) }`, 'ok' );
		proc.write( `params   2 · ${ GPT2.dModel } · ${ GPT2.dFF } = 4.72M per block × ${ GPT2.layers } = 56.7M`, 'dim' );
		proc.write( 'that is about two thirds of every non-embedding parameter in GPT-2 small', 'note' );

	}

}

/* -------------------------------------------------------- 02 · LM head */

const mixSlider = document.getElementById( 'mix-slider' );
const mixReadout = document.getElementById( 'mix-readout' );

mixSlider.addEventListener( 'input', () => {

	const v = parseFloat( mixSlider.value );
	mixReadout.textContent = v.toFixed( 2 );
	worlds.linear.setMix( v );
	renderLinTable();

} );

mixSlider.addEventListener( 'change', () => {

	const s = worlds.linear.getState();
	const best = s.logits.indexOf( Math.max( ...s.logits ) );
	proc.write( `mix ${ s.mix.toFixed( 2 ) }  →  argmax "${ VOCAB_ROWS[ best ].token.trim() }"  logit ${ fmt( s.logits[ best ], 3 ) }`, 'calc' );

} );

const linScrub = makeScrubber( 'linear', LINEAR_STEPS.length, ( i ) => {

	worlds.linear.setStep( i );
	setCard( 'linear', i );
	linStepTrace( i );
	flyTo( worlds.linear.getStepView( i ) );
	renderLinTable();

} );

function renderLinTable() {

	const s = worlds.linear.getState();
	const rows = VOCAB_ROWS.map( ( r, v ) => ( { token: r.token, z: s.logits[ v ] } ) ).sort( ( a, b ) => b.z - a.z ).slice( 0, 5 );
	document.getElementById( 'lin-table' ).innerHTML = `
		<thead><tr><th>token</th><th>logit</th></tr></thead>
		<tbody>${ rows.map( ( r, i ) => `<tr class="${ i === 0 ? 'is-top' : '' }"><td class="tok">${ r.token }</td><td class="num">${ fmt( r.z, 3 ) }</td></tr>` ).join( '' ) }</tbody>`;

}

function linHeader() {

	proc.clear();
	proc.setTitle( 'lm_head — the output linear layer' );
	proc.setStatus( 'computed', 'done' );
	proc.write( 'logits = h @ lm_head.weight.T', 'cmd' );
	proc.write( `h        ${ fmtVec( worlds.linear.getState().hidden ) }   (${ SHOWN.d } of ${ GPT2.dModel })`, 'out' );
	proc.write( `weight   [${ GPT2.vocab.toLocaleString( 'en-AU' ) } × ${ GPT2.dModel }]  ·  tied to wte  ·  no bias`, 'dim' );
	proc.rule();

}

function linStepTrace( i ) {

	const s = worlds.linear.getState();
	proc.write( `${ i + 1 }. ${ LINEAR_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( `${ GPT2.dModel } × ${ GPT2.vocab.toLocaleString( 'en-AU' ) } = 38.6M weights — more than every attention matrix in the model put together (28.3M)`, 'out' );
		proc.write( 'no activation, no bias, nothing after it but softmax', 'dim' );

	} else if ( i === 1 ) {

		proc.write( 'the trunk has no notion of words — only 768 continuous numbers', 'out' );
		proc.write( 'this layer is the only place the vocabulary re-enters after the input embedding', 'note' );

	} else if ( i === 2 ) {

		VOCAB_ROWS.slice( 0, 5 ).forEach( ( r, v ) => proc.write( `h · e["${ r.token.trim() }"]${ ' '.repeat( Math.max( 0, 8 - r.token.length ) ) } = ${ fmt( s.logits[ v ], 4 ) }`, v === 0 ? 'calc' : 'out' ) );
		proc.write( `lowest drawn row  ${ fmt( Math.min( ...s.logits ), 4 ) }`, 'dim' );

	} else if ( i === 3 ) {

		proc.write( 'logit = |h| |e| cosθ', 'cmd' );
		proc.write( `|h| = ${ fmt( Math.hypot( ...s.hidden ), 3 ) }  ·  the ranking is the ordering of cosθ scaled by each row's length`, 'out' );
		proc.write( 'drag the slider to rotate h — every logit moves, no weights change', 'note' );

	} else {

		proc.write( 'trunk = 12 decoder blocks   →   head = one task-specific layer', 'out' );
		proc.write( 'lm_head.weight is wte.weight — a logit is how much h looks like that token’s embedding', 'calc' );
		proc.write( 'swap the head for Linear(768, 2) and the same trunk does classification', 'note' );

	}

}

/* -------------------------------------------------------- 03 · softmax */

const params = { ...DEFAULTS };
let smResult = decode( params );

const tempSlider = document.getElementById( 'temp-slider' );
const kSlider = document.getElementById( 'k-slider' );
const pSlider = document.getElementById( 'p-slider' );
const modeChips = document.getElementById( 'mode-chips' );

function syncModeChips() {

	[ ...modeChips.children ].forEach( ( c ) => c.classList.toggle( 'active', c.dataset.mode === params.mode ) );

}

function refreshSoftmax() {

	smResult = decode( params );
	worlds.softmax.setResult( smResult );
	renderSmTable();

}

function renderSmTable() {

	const rows = [ ...smResult.rows.slice( 0, 6 ), smResult.tail ];
	document.getElementById( 'sm-table' ).innerHTML = `
		<thead><tr><th>token</th><th>p</th><th>after</th></tr></thead>
		<tbody>${ rows.map( ( r ) => {

			const cls = [ r.isTail ? 'is-tail' : '', ! r.kept ? 'is-dropped' : '', r === smResult.rows[ 0 ] ? 'is-top' : '' ].join( ' ' );
			return `<tr class="${ cls }"><td class="tok">${ r.isTail ? '50,245 others' : r.token }</td><td class="num">${ r.prob.toFixed( 4 ) }</td><td class="num">${ r.kept ? r.final.toFixed( 4 ) : '—' }</td></tr>`;

		} ).join( '' ) }</tbody>`;

	document.getElementById( 'sm-summary' ).textContent =
		`T ${ smResult.temperature.toFixed( 2 ) } · ${ smResult.mode === 'none' ? 'no filter' : smResult.mode === 'both' ? `k ${ params.topK } + p ${ params.topP.toFixed( 2 ) }` : smResult.mode === 'k' ? `k ${ params.topK }` : `p ${ params.topP.toFixed( 2 ) }` } · ${ smResult.keptCount.toLocaleString( 'en-AU' ) } kept · H ${ smResult.entropy.toFixed( 3 ) } nats`;

}

tempSlider.addEventListener( 'input', () => {

	params.temperature = parseFloat( tempSlider.value );
	document.getElementById( 'temp-readout' ).textContent = params.temperature.toFixed( 2 );
	refreshSoftmax();

} );

kSlider.addEventListener( 'input', () => {

	params.topK = parseInt( kSlider.value, 10 );
	document.getElementById( 'k-readout' ).textContent = params.topK;
	refreshSoftmax();

} );

pSlider.addEventListener( 'input', () => {

	params.topP = parseFloat( pSlider.value );
	document.getElementById( 'p-readout' ).textContent = params.topP.toFixed( 2 );
	refreshSoftmax();

} );

[ tempSlider, kSlider, pSlider ].forEach( ( el ) => el.addEventListener( 'change', () => {

	proc.write( `T ${ smResult.temperature.toFixed( 2 ) } · k ${ params.topK } · p ${ params.topP.toFixed( 2 ) }  →  ${ smResult.keptCount.toLocaleString( 'en-AU' ) } candidates, top p = ${ smResult.rows[ 0 ].final.toFixed( 4 ) }`, 'calc' );

} ) );

modeChips.addEventListener( 'click', ( e ) => {

	const btn = e.target.closest( '.chip' );
	if ( ! btn ) return;
	params.mode = btn.dataset.mode;
	syncModeChips();
	refreshSoftmax();
	proc.write( `filter = ${ params.mode === 'none' ? 'none' : params.mode === 'both' ? 'top-k then top-p' : params.mode === 'k' ? 'top-k' : 'top-p' }  →  ${ smResult.keptCount.toLocaleString( 'en-AU' ) } candidates`, 'warn' );

} );

document.getElementById( 'sample-btn' ).addEventListener( 'click', () => {

	const row = sample( smResult );
	const index = smResult.all.indexOf( row );
	worlds.softmax.setSampled( index );
	proc.write( `sample() → ${ row.isTail ? 'one of the 50,245 tail tokens' : `"${ row.token.trim() }"` }   p = ${ row.final.toFixed( 4 ) }`, 'ok' );

} );

const smScrub = makeScrubber( 'softmax', SOFTMAX_STEPS.length, ( i ) => {

	const mode = i === 4 ? 'k' : i === 5 ? 'p' : i === 6 ? 'both' : 'none';
	params.mode = mode;
	syncModeChips();
	refreshSoftmax();
	worlds.softmax.setStep( i );
	setCard( 'softmax', i );
	smStepTrace( i );
	flyTo( worlds.softmax.getStepView( i ) );

} );

function smHeader() {

	proc.clear();
	proc.setTitle( 'softmax — logits to a distribution' );
	proc.setStatus( 'computed', 'done' );
	proc.write( 'probs = softmax(logits / T)', 'cmd' );
	proc.write( `logits   ${ SHOWN.vocab } drawn of ${ GPT2.vocab.toLocaleString( 'en-AU' ) }`, 'dim' );
	proc.write( `tail     the other ${ smResult.tailCount.toLocaleString( 'en-AU' ) } modelled at z ≈ ${ fmt( TAIL_LOGIT, 2 ) }, drawn as one bar`, 'dim' );
	proc.write( 'these are the logits page 02 produces with h unsteered', 'dim' );
	proc.rule();

}

function smStepTrace( i ) {

	const r = smResult;
	proc.write( `${ i + 1 }. ${ SOFTMAX_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( `z        ${ fmtVec( r.rows.map( ( x ) => x.logit ), 2, 8 ) }`, 'out' );
		proc.write( `max z    ${ fmt( r.rows[ 0 ].logit, 3 ) }   ·   softmax is unchanged if you subtract it from every score`, 'calc' );

	} else if ( i === 1 ) {

		proc.write( `exp(z−max)  ${ fmtVec( r.rows.map( ( x ) => x.exp ), 3, 6 ) }`, 'calc' );
		proc.write( `a gap of 1.0 in logits is a factor of e = 2.718 in probability`, 'out' );

	} else if ( i === 2 ) {

		proc.write( `Σ exp = ${ ( r.rows.reduce( ( s, x ) => s + x.exp, 0 ) + r.tail.exp ).toFixed( 4 ) }`, 'cmd' );
		r.rows.slice( 0, 4 ).forEach( ( x ) => proc.write( `p("${ x.token.trim() }")${ ' '.repeat( Math.max( 0, 8 - x.token.length ) ) } = ${ x.prob.toFixed( 4 ) }`, 'out' ) );
		proc.write( `Σ p = ${ ( r.rows.reduce( ( s, x ) => s + x.prob, 0 ) + r.tail.prob ).toFixed( 6 ) }`, 'ok' );

	} else if ( i === 3 ) {

		[ 0.5, 1, 1.6 ].forEach( ( T ) => {

			const d = decode( { ...params, temperature: T, mode: 'none' } );
			proc.write( `T = ${ T.toFixed( 1 ) }   top p = ${ d.rows[ 0 ].prob.toFixed( 4 ) }   H = ${ d.entropy.toFixed( 3 ) } nats`, T === 1 ? 'calc' : 'out' );

		} );
		proc.write( 'temperature rescales scores — every candidate survives it', 'note' );
		proc.write( `at T = 2 the ${ r.tailCount.toLocaleString( 'en-AU' ) } tail tokens hold ${ ( decode( { ...params, temperature: 2, mode: 'none' } ).tail.prob * 100 ).toFixed( 1 ) }% of the mass — flattening feeds the unlikely`, 'warn' );

	} else if ( i === 4 ) {

		proc.write( `top-k  k = ${ params.topK }`, 'cmd' );
		proc.write( `kept     ${ r.rows.filter( ( x ) => x.kept ).map( ( x ) => x.token.trim() ).join( ', ' ) }`, 'out' );
		proc.write( `mass before renormalising  ${ r.keptMass.toFixed( 4 ) }  →  1.000`, 'calc' );
		proc.write( 'k is fixed: the same width whether the model is sure or not', 'note' );

	} else if ( i === 5 ) {

		proc.write( `top-p  p = ${ params.topP.toFixed( 2 ) }`, 'cmd' );
		const kept = r.all.filter( ( x ) => x.kept );
		kept.forEach( ( x ) => proc.write( `  ${ ( x.isTail ? 'tail' : x.token.trim() ).padEnd( 8 ) } p ${ x.prob.toFixed( 4 ) }   cum ${ x.cum.toFixed( 4 ) }`, 'out' ) );
		proc.write( `nucleus  ${ r.keptCount.toLocaleString( 'en-AU' ) } tokens, mass ${ r.keptMass.toFixed( 4 ) } ≥ ${ params.topP.toFixed( 2 ) }`, 'ok' );
		proc.write( 'the count adapts to how confident the step is', 'note' );

	} else {

		proc.write( 'z / T  →  softmax  →  top-k  →  top-p  →  renormalise  →  sample', 'cmd' );
		proc.write( 'implementations set the rejected logits to −inf and softmax once — same result', 'dim' );
		proc.write( `now: T ${ r.temperature.toFixed( 2 ) } · k ${ params.topK } · p ${ params.topP.toFixed( 2 ) } · ${ r.keptCount.toLocaleString( 'en-AU' ) } candidates`, 'calc' );
		proc.write( 'neither filter is part of softmax — both act on what it produced', 'warn' );

	}

}

/* ------------------------------------------------------------- detail card */

const detailCard = document.getElementById( 'detail-card' );
document.getElementById( 'detail-close' ).addEventListener( 'click', closeDetail );

function openDetail( payload ) {

	if ( ! payload ) return;
	document.getElementById( 'detail-category' ).textContent = payload.category || '';
	document.getElementById( 'detail-name' ).textContent = payload.name || '';
	document.getElementById( 'detail-blurb' ).textContent = payload.blurb || '';
	document.getElementById( 'detail-description' ).textContent = payload.description || '';
	const hasMetric = Boolean( payload.metric );
	document.getElementById( 'detail-metric-block' ).classList.toggle( 'hidden', ! hasMetric );
	if ( hasMetric ) {

		document.getElementById( 'detail-metric-label' ).textContent = payload.metricLabel || 'Value';
		document.getElementById( 'detail-metric' ).textContent = payload.metric;

	}
	detailCard.classList.add( 'open' );
	detailCard.setAttribute( 'aria-hidden', 'false' );

}

function closeDetail() {

	detailCard.classList.remove( 'open' );
	detailCard.setAttribute( 'aria-hidden', 'true' );

}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function visibleChain( object ) {

	let o = object;
	while ( o ) { if ( ! o.visible ) return false; o = o.parent; }
	return true;

}

renderer.domElement.addEventListener( 'pointerdown', ( event ) => {

	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = -( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
	raycaster.setFromCamera( pointer, camera );

	const hits = raycaster.intersectObjects( worlds[ currentKey ].interactables, true ).filter( ( h ) => {

		const u = h.object.userData;
		return visibleChain( h.object ) && ( u.index !== undefined || u.row !== undefined || u.rank !== undefined );

	} );

	if ( ! hits.length ) return;
	openDetail( worlds[ currentKey ].describe( hits[ 0 ].object ) );

} );

/* ------------------------------------------------------------------- nav */

const navLinks = document.querySelectorAll( '.nav-link' );
const worldPanels = document.querySelectorAll( '.world' );

function setWorldLabelsVisible( key, visible ) {

	worlds[ key ].scene.traverse( ( obj ) => {

		if ( obj.isCSS2DObject ) obj.element.style.display = visible ? '' : 'none';

	} );

}

const ENTER = { mlp: enterMlp, linear: enterLinear, softmax: enterSoftmax };

function switchWorld( key ) {

	if ( key === currentKey || ! worlds[ key ] ) return;

	mlpScrub.stop();
	linScrub.stop();
	smScrub.stop();
	proc.cancel();
	closeDetail();

	setWorldLabelsVisible( currentKey, false );
	currentKey = key;
	document.body.dataset.world = key;
	navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === key ) );
	worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === key ) );

	renderPipeline.outputNode = sceneOutputs[ key ];
	renderPipeline.needsUpdate = true;
	setWorldLabelsVisible( key, true );

	ENTER[ key ]();

}

navLinks.forEach( ( btn ) => btn.addEventListener( 'click', () => switchWorld( btn.dataset.goto ) ) );

function enterMlp() {

	mlpHeader();
	mlpStepTrace( mlpScrub.index );
	setCard( 'mlp', mlpScrub.index );
	worlds.mlp.setStep( mlpScrub.index );
	renderMlpTable();
	flyTo( worlds.mlp.getStepView( mlpScrub.index ) );

}

function enterLinear() {

	worlds.linear.setStep( linScrub.index );
	linHeader();
	linStepTrace( linScrub.index );
	setCard( 'linear', linScrub.index );
	renderLinTable();
	flyTo( worlds.linear.getStepView( linScrub.index ) );

}

function enterSoftmax() {

	refreshSoftmax();
	worlds.softmax.setStep( smScrub.index );
	smHeader();
	smStepTrace( smScrub.index );
	setCard( 'softmax', smScrub.index );
	flyTo( worlds.softmax.getStepView( smScrub.index ) );

}

/* ----------------------------------------------------------------- start */

syncModeChips();
worlds.linear.setStep( 0 );
worlds.softmax.setResult( smResult );
worlds.softmax.setStep( 0 );
setCard( 'linear', 0 );
setCard( 'softmax', 0 );

navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === 'mlp' ) );
worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === 'mlp' ) );
Object.keys( worlds ).forEach( ( key ) => setWorldLabelsVisible( key, key === 'mlp' ) );
enterMlp();

setTimeout( () => document.getElementById( 'loading' ).classList.add( 'hidden' ), 700 );

const clock = new THREE.Clock();

renderer.setAnimationLoop( () => {

	const dt = Math.min( 0.05, clock.getDelta() );
	updateTweens( dt );
	worlds[ currentKey ].update( dt );
	controls.update();
	renderPipeline.render();
	labelRenderer.render( worlds[ currentKey ].scene, camera );

} );
