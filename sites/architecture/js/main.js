import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput } from './utils/renderKit.js';
import { ProcessConsole } from './utils/console.js';
import { bindViewport } from './utils/viewport.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';

import { buildResidualWorld } from './worlds/residual.js';
import { buildNormWorld } from './worlds/norm.js';
import { buildActivationWorld } from './worlds/activation.js';
import { buildGluWorld } from './worlds/glu.js';

import { RESIDUAL_STEPS, NORM_STEPS, ACT_STEPS, GLU_STEPS } from './data/copy.js';
import { NORM_MODES, MODELS, BY_MODEL, normParams, LN_OPS, RMS_OPS, lnFlops, rmsFlops, count } from './data/norm.js';
import { ACTS, BY_ACT, GLUS, BY_GLU, PPL_BASE, USAGE, SELU_A, SELU_L } from './data/acts.js';

const viewport = document.getElementById( 'viewport' );
const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
container.appendChild( renderer.domElement );

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

const camera = new THREE.PerspectiveCamera( 28, 1, 0.1, 400 );
camera.position.set( -5.4, 0.4, 16.5 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 4;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.62;

const renderPipeline = createRenderPipeline( renderer );
bindViewport( viewport, camera, [ renderer, labelRenderer ] );

const worlds = {
	residual: buildResidualWorld(),
	norm: buildNormWorld(),
	activation: buildActivationWorld(),
	glu: buildGluWorld(),
};

const STEPS = { residual: RESIDUAL_STEPS, norm: NORM_STEPS, activation: ACT_STEPS, glu: GLU_STEPS };

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

const sceneOutputs = {};
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera, { strength: 0.24, radius: 0.6, threshold: 0.6 } );

let currentKey = 'residual';
renderPipeline.outputNode = sceneOutputs.residual;

const proc = new ProcessConsole( document.getElementById( 'console' ) );

function flyTo( view, duration = 0.9 ) {

	controls.enabled = false;
	tweenVec3( camera.position, view.position, duration, { easing: Easing.cubicInOut } );
	tweenVec3( controls.target, view.target, duration, {
		easing: Easing.cubicInOut,
		onComplete: () => { controls.enabled = true; },
	} );

}

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

		}, 3600 );

	} );

	paint();
	return { go, stop, get index() { return index; } };

}

function chipRow( root, items, onPick, activeKey ) {

	root.innerHTML = '';
	items.forEach( ( item ) => {

		const b = document.createElement( 'button' );
		b.className = 'chip' + ( item.key === activeKey ? ' active' : '' );
		b.textContent = item.label;
		b.dataset.key = item.key;
		b.addEventListener( 'click', () => {

			[ ...root.children ].forEach( ( c ) => c.classList.toggle( 'active', c === b ) );
			onPick( item );

		} );
		root.appendChild( b );

	} );

}

const pickChip = ( root, key ) => {

	const c = [ ...document.getElementById( root ).children ].find( ( b ) => b.dataset.key === key );
	if ( c && ! c.classList.contains( 'active' ) ) c.click();

};

const table = ( id, rows ) => {

	document.getElementById( id ).innerHTML = `<tbody>${ rows.map( ( r ) => `<tr class="${ r[ 2 ] || '' }"><td class="tag">${ r[ 0 ] }</td><td class="num">${ r[ 1 ] }</td></tr>` ).join( '' ) }</tbody>`;

};

const layerSlider = document.getElementById( 'layer-slider' );
const layerReadout = document.getElementById( 'layer-readout' );

chipRow( document.getElementById( 'mode-chips' ), NORM_MODES.map( ( m ) => ( { key: m.key, label: m.label } ) ), ( item ) => {

	const s = worlds.residual.setMode( item.key );
	renderResTable();
	logResidual( s );

}, 'pre' );

layerSlider.addEventListener( 'input', () => {

	const n = parseInt( layerSlider.value, 10 );
	layerReadout.textContent = String( n );
	worlds.residual.setLayers( n );
	renderResTable();

} );

layerSlider.addEventListener( 'change', () => logResidual( worlds.residual.getState() ) );

const resScrub = makeScrubber( 'residual', RESIDUAL_STEPS.length, ( i ) => {

	if ( i === 3 ) pickChip( 'mode-chips', 'post' );
	if ( i === 4 || i === 5 ) pickChip( 'mode-chips', 'pre' );
	if ( i <= 2 ) pickChip( 'mode-chips', 'none' );
	worlds.residual.setStep( i );
	setCard( 'residual', i );
	resTrace( i );
	flyTo( worlds.residual.getStepView( i ) );
	renderResTable();

} );

function renderResTable() {

	const s = worlds.residual.getState();
	table( 'res-table', [
		[ 'placement', NORM_MODES.find( ( m ) => m.key === s.mode ).label ],
		[ 'blocks L', String( s.layers ) ],
		[ 'residual writes', String( s.subs ) ],
		[ 'stream rms at the top', s.last.toFixed( 2 ), s.last > 4 ? 'is-warn' : '' ],
		[ 'sub-layer input rms', s.inputLast.toFixed( 2 ), s.mode === 'none' ? 'is-warn' : 'is-pick' ],
		[ 'attention logit scale', s.logit.toFixed( 0 ) + '×', s.logit > 16 ? 'is-warn' : '' ],
		[ 'norms on the residual path', s.mode === 'post' ? String( s.subs ) : '0' ],
		[ 'norm tensors in the model', s.mode === 'none' ? '0' : String( s.subs + ( s.mode === 'pre' ? 1 : 0 ) ) ],
	] );

	document.getElementById( 'res-summary' ).textContent = s.mode === 'none'
		? `nothing holds the scale down — rms √(1 + ${ s.subs }) = ${ s.last.toFixed( 2 ) } into every sub-layer`
		: s.mode === 'post'
			? `stream pinned at 1.00 · the gradient is rescaled ${ s.subs } times on the way down`
			: `stream free to reach ${ s.last.toFixed( 2 ) } · every sub-layer still reads rms 1.00`;

}

function resHeader() {

	proc.clear();
	proc.setTitle( 'residual stream — scale and placement' );
	proc.setStatus( 'computed', 'done' );
	proc.write( 'x = x + Attn(norm(x))', 'cmd' );
	proc.write( 'x = x + MLP(norm(x))', 'cmd' );
	proc.write( 'the same d-vector, 2L times', 'dim' );
	proc.rule();

}

function resTrace( i ) {

	const s = worlds.residual.getState();
	proc.write( `${ i + 1 }. ${ RESIDUAL_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'block = attention sub-layer + mlp sub-layer', 'out' );
		proc.write( `L = ${ s.layers } → ${ s.subs } writes into one vector`, 'calc' );
		proc.write( 'nothing ever reads a previous block directly — only the stream', 'dim' );

	} else if ( i === 1 ) {

		proc.write( 'var(x + F) = var(x) + var(F)   for uncorrelated x, F', 'cmd' );
		[ 1, 8, 24, 48, 96 ].forEach( ( l ) => proc.write( `L = ${ String( l ).padStart( 3 ) }   rms = √(1 + ${ 2 * l }) = ${ Math.sqrt( 1 + 2 * l ).toFixed( 2 ) }`, l === s.layers ? 'calc' : 'out' ) );
		proc.write( `at L = ${ s.layers } the stream is ${ Math.sqrt( 1 + 2 * s.layers ).toFixed( 2 ) }× the scale it started at`, 'warn' );

	} else if ( i === 2 ) {

		proc.write( 'q · k grows with the square of the scale', 'cmd' );
		proc.write( `s = ${ s.last.toFixed( 2 ) } → logits ${ s.logit.toFixed( 0 ) }× → softmax saturates toward one-hot`, 'warn' );
		proc.write( 'a saturated softmax has almost no gradient left to give', 'out' );
		proc.write( 'and every activation still has to stay under 65,504 in float16', 'dim' );

	} else if ( i === 3 ) {

		proc.write( 'x ← LayerNorm(x + F(x))        Vaswani et al. 2017', 'cmd' );
		proc.write( `stream rms   1.00 at every one of ${ s.subs } writes`, 'ok' );
		proc.write( `the backward pass is rescaled ${ s.subs } times between the loss and the embedding`, 'warn' );
		proc.write( 'gradients near the output start large — which is what warm-up was covering for', 'note' );

	} else if ( i === 4 ) {

		proc.write( 'x ← x + F(LayerNorm(x))        GPT-2 onwards', 'cmd' );
		proc.write( `stream rms   ${ s.last.toFixed( 2 ) } at the top — still growing`, 'out' );
		proc.write( 'sub-layer input rms   1.00 at every depth', 'ok' );
		proc.write( 'the residual path is now an unbroken identity, so ∂L/∂x reaches block 1 intact', 'ok' );
		proc.write( 'one final norm before the head cleans up the scale the logits are read from', 'note' );

	} else {

		proc.write( 'N(a · x) = N(x)', 'cmd' );
		proc.write( 'the layer stops caring about the magnitude of what it is fed', 'out' );
		proc.write( '→ the loss surface flattens, so the learning rate can go up', 'out' );
		proc.write( '→ attention logits, activation ranges and fp16 headroom all inherit a fixed scale', 'out' );
		proc.write( 'not "internal covariate shift" — that explanation did not survive its own ablations', 'note' );

	}

}

function logResidual( s ) {

	proc.write( `${ s.mode } · L = ${ s.layers } → stream rms ${ s.last.toFixed( 2 ) } · sub-layer input rms ${ s.inputLast.toFixed( 2 ) } · logits ${ s.logit.toFixed( 0 ) }×`, s.mode === 'none' ? 'warn' : 'calc' );

}

const shiftSlider = document.getElementById( 'shift-slider' );
const shiftReadout = document.getElementById( 'shift-readout' );

let normModelKey = 'gpt2';

shiftSlider.addEventListener( 'input', () => {

	const v = parseFloat( shiftSlider.value );
	shiftReadout.textContent = v.toFixed( 2 );
	worlds.norm.setShift( v );
	renderNormTable();

} );

shiftSlider.addEventListener( 'change', () => logNorm() );

chipRow( document.getElementById( 'model-chips' ), MODELS.map( ( m ) => ( { key: m.key, label: m.name } ) ), ( item ) => {

	normModelKey = item.key;
	renderNormTable();
	const m = BY_MODEL[ item.key ];
	proc.write( `${ m.name } · d ${ m.d.toLocaleString( 'en-AU' ) } · ${ m.layers } blocks · ${ m.norm } → ${ count( normParams( m ) ) } norm parameters`, 'calc' );

}, 'gpt2' );

const normScrub = makeScrubber( 'norm', NORM_STEPS.length, ( i ) => {

	worlds.norm.setStep( i );
	setCard( 'norm', i );
	normTrace( i );
	flyTo( worlds.norm.getStepView( i ) );
	renderNormTable();

} );

function renderNormTable() {

	const s = worlds.norm.getState();
	const m = BY_MODEL[ normModelKey ];
	const ln = ( m.norm === 'LayerNorm' ? 2 : 1 );
	document.getElementById( 'norm-head' ).textContent = normScrub.index >= 5 ? 'The cost' : 'This vector';

	const rows = normScrub.index >= 5 ? [
		[ 'model', `${ m.name } · d ${ m.d.toLocaleString( 'en-AU' ) }` ],
		[ 'norm used', m.norm, 'is-pick' ],
		[ 'norm sites', String( 2 * m.layers + 1 ) ],
		[ 'params per site', `${ ln }d = ${ ( ln * m.d ).toLocaleString( 'en-AU' ) }` ],
		[ 'norm parameters', count( normParams( m ) ) ],
		[ 'as LayerNorm', count( 2 * m.d * ( 2 * m.layers + 1 ) ) ],
		[ 'as RMSNorm', count( 1 * m.d * ( 2 * m.layers + 1 ) ), 'is-pick' ],
		[ 'ops per element', `${ lnFlops } → ${ rmsFlops }` ],
		[ 'reductions', '2 → 1' ],
	] : [
		[ 'mean μ', s.mu.toFixed( 4 ) ],
		[ 'σ (LayerNorm)', s.ln.sigma.toFixed( 4 ) ],
		[ 'rms (RMSNorm)', s.rm.rms.toFixed( 4 ) ],
		[ 'mean of LN output', '0.000 + β' ],
		[ 'mean of RMS output', s.outMean.toFixed( 4 ), Math.abs( s.outMean ) > 0.05 ? 'is-warn' : '' ],
		[ 'rms ‖x̂_LN − x̂_RMS‖', s.hatDiff.toFixed( 4 ), s.hatDiff > 0.01 ? 'is-warn' : 'is-pick' ],
		[ 'LayerNorm params', '2d' ],
		[ 'RMSNorm params', 'd', 'is-pick' ],
	];

	table( 'norm-table', rows );

	document.getElementById( 'norm-summary' ).textContent = normScrub.index >= 5
		? `${ m.name } spends ${ count( normParams( m ) ) } parameters on normalisation — ${ ( normParams( m ) / ( m.d * m.d * 12 * m.layers ) * 100 ).toFixed( 3 ) }% of the block weights, and every one of them is memory-bound`
		: s.hatDiff < 1e-4
			? 'mean is zero, so the two normalised vectors are identical — only β separates the outputs'
			: `shifted by ${ s.shift.toFixed( 2 ) }: LayerNorm output unchanged, RMSNorm output moved by ${ s.hatDiff.toFixed( 3 ) } rms`;

}

function normHeader() {

	proc.clear();
	proc.setTitle( 'normalisation — LayerNorm vs RMSNorm' );
	proc.setStatus( 'computed', 'done' );
	proc.write( 'x = tensor([1.2, -0.4, 2.1, 0.3, -1.5, 0.8, -0.2, 1.9])', 'cmd' );
	proc.write( 'both take the same row and both return a rescaled row', 'dim' );
	proc.rule();

}

function normTrace( i ) {

	const s = worlds.norm.getState();
	proc.write( `${ i + 1 }. ${ NORM_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'statistics run across the feature axis, per token', 'out' );
		proc.write( `x   ${ s.x.map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }`, 'calc' );
		proc.write( `mean ${ s.mu.toFixed( 4 ) }   rms ${ s.rm.rms.toFixed( 4 ) }`, 'out' );
		proc.write( 'no batch dimension is involved — batch size 1 and batch size 4096 behave identically', 'dim' );

	} else if ( i === 1 ) {

		proc.write( 'μ = (1/d) Σ xᵢ', 'cmd' );
		proc.write( `μ = ${ s.x.map( ( v ) => v.toFixed( 2 ) ).join( ' + ' ) } / 8 = ${ s.mu.toFixed( 4 ) }`, 'calc' );
		proc.write( `x − μ   ${ s.ln.centred.map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }`, 'out' );
		proc.write( 'one full reduction and one subtraction — the half RMSNorm removes', 'note' );

	} else if ( i === 2 ) {

		proc.write( 'σ = √((1/d) Σ (xᵢ − μ)² + ε)', 'cmd' );
		proc.write( `σ = ${ s.ln.sigma.toFixed( 4 ) }   ε = 1e−5`, 'calc' );
		proc.write( `x̂   ${ s.ln.hat.map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }`, 'out' );
		proc.write( `y   ${ s.ln.out.map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }   after γ and β`, 'ok' );
		proc.write( '2d learned parameters, and a second reduction that depends on the first', 'note' );

	} else if ( i === 3 ) {

		proc.write( 'rms(x) = √((1/d) Σ xᵢ² + ε)', 'cmd' );
		proc.write( `rms = ${ s.rm.rms.toFixed( 4 ) }`, 'calc' );
		proc.write( `x̂   ${ s.rm.hat.map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }`, 'out' );
		proc.write( `y   ${ s.rm.out.map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }   after γ, no β`, 'ok' );
		proc.write( 'one reduction, d parameters, and no dependency between the two passes', 'note' );

	} else if ( i === 4 ) {

		proc.write( 'LN(x + c·1) = LN(x)      RMS(x + c·1) ≠ RMS(x)', 'cmd' );
		[ -2, -1, 0, 1, 2 ].forEach( ( c ) => {

			const shifted = s.x.map( ( v ) => v - s.shift + c );
			const mu = shifted.reduce( ( a, b ) => a + b, 0 ) / shifted.length;
			const rms = Math.sqrt( shifted.reduce( ( a, b ) => a + b * b, 0 ) / shifted.length + 1e-5 );
			proc.write( `c = ${ String( c ).padStart( 2 ) }   μ = ${ mu.toFixed( 3 ).padStart( 7 ) }   rms = ${ rms.toFixed( 3 ).padStart( 6 ) }   LN output unchanged`, c === 0 ? 'ok' : 'out' );

		} );
		proc.write( `at the current shift the normalised rows differ by ${ s.hatDiff.toFixed( 4 ) } rms`, s.hatDiff > 0.01 ? 'warn' : 'ok' );
		proc.write( 'in a real model the mean is not free — it is whatever the previous layer left behind', 'note' );

	} else if ( i === 5 ) {

		proc.write( 'LayerNorm', 'cmd' );
		LN_OPS.forEach( ( [ t, n ] ) => proc.write( `  ${ t.padEnd( 12 ) } ${ n }`, 'dim' ) );
		proc.write( `  ${ 'total'.padEnd( 12 ) } ${ lnFlops } ops per element, 2 reductions, 2d params`, 'out' );
		proc.write( 'RMSNorm', 'cmd' );
		RMS_OPS.forEach( ( [ t, n ] ) => proc.write( `  ${ t.padEnd( 12 ) } ${ n }`, 'dim' ) );
		proc.write( `  ${ 'total'.padEnd( 12 ) } ${ rmsFlops } ops per element, 1 reduction, d params`, 'ok' );
		proc.write( 'both read d and write d, so both are memory-bound — the saving is passes and parameters, not FLOPs', 'note' );
		proc.write( 'Zhang & Sennrich report 7%–64% less running time depending on the model', 'calc' );

	} else {

		MODELS.forEach( ( m ) => proc.write( `${ m.name.padEnd( 13 ) } ${ m.norm.padEnd( 10 ) } ${ m.place.padEnd( 9 ) } ${ m.bias ? 'biases' : 'no biases' }   ${ count( normParams( m ) ) } params`, m.norm === 'RMSNorm' ? 'ok' : 'out' ) );
		proc.write( 'the migration was RMSNorm, no biases, and pre-norm arriving together', 'note' );

	}

}

function logNorm() {

	const s = worlds.norm.getState();
	proc.write( `shift ${ s.shift.toFixed( 2 ) } → μ ${ s.mu.toFixed( 4 ) } · σ ${ s.ln.sigma.toFixed( 4 ) } · rms ${ s.rm.rms.toFixed( 4 ) } · Δx̂ ${ s.hatDiff.toFixed( 4 ) }`, s.hatDiff > 0.01 ? 'warn' : 'calc' );

}

const probeSlider = document.getElementById( 'probe-slider' );
const probeReadout = document.getElementById( 'probe-readout' );
const betaSlider = document.getElementById( 'beta-slider' );
const betaReadout = document.getElementById( 'beta-readout' );
const derivChip = document.getElementById( 'deriv-chip' );

chipRow( document.getElementById( 'act-chips' ), ACTS.map( ( a ) => ( { key: a.key, label: a.label } ) ), ( item ) => {

	worlds.activation.setFocus( item.key );
	renderActTable();
	const a = BY_ACT[ item.key ];
	proc.write( `${ a.label } · ${ a.expr }`, 'cmd' );

}, 'gelu' );

probeSlider.addEventListener( 'input', () => {

	const v = parseFloat( probeSlider.value );
	probeReadout.textContent = v.toFixed( 2 );
	worlds.activation.setProbe( v );
	renderActTable();

} );

probeSlider.addEventListener( 'change', () => logAct() );

betaSlider.addEventListener( 'input', () => {

	const v = parseFloat( betaSlider.value );
	betaReadout.textContent = v.toFixed( 2 );
	worlds.activation.setBeta( v );
	renderActTable();

} );

betaSlider.addEventListener( 'change', () => {

	const s = worlds.activation.getState();
	proc.write( `β = ${ s.beta.toFixed( 2 ) } → swish(${ s.probe.toFixed( 2 ) }) = ${ BY_ACT.swish.f( s.probe, s.beta ).toFixed( 4 ) }   ${ s.beta < 0.3 ? '≈ x/2' : s.beta > 5 ? '≈ relu' : '' }`, 'calc' );

} );

derivChip.addEventListener( 'click', () => {

	const on = ! derivChip.classList.contains( 'active' );
	derivChip.classList.toggle( 'active', on );
	worlds.activation.setDeriv( on );
	renderActTable();

} );

const actScrub = makeScrubber( 'activation', ACT_STEPS.length, ( i ) => {

	if ( i >= 1 && i <= 4 ) pickChip( 'act-chips', ACTS[ i - 1 ].key );
	worlds.activation.setStep( i );
	setCard( 'activation', i );
	actTrace( i );
	flyTo( worlds.activation.getStepView( i ) );
	renderActTable();

} );

function renderActTable() {

	const s = worlds.activation.getState();
	document.getElementById( 'act-head' ).textContent = `At x = ${ s.probe.toFixed( 2 ) }`;

	document.getElementById( 'act-table' ).innerHTML = `
		<thead><tr><th>fn</th><th>f(x)</th><th>f′(x)</th></tr></thead>
		<tbody>${ s.rows.map( ( r ) => `<tr class="${ r.act.key === s.focus ? 'is-pick' : '' }"><td class="tag">${ r.act.label }</td><td class="num">${ r.y.toFixed( 4 ) }</td><td class="num">${ r.dy.toFixed( 4 ) }</td></tr>` ).join( '' ) }</tbody>`;

	const dead = s.rows.filter( ( r ) => Math.abs( r.dy ) < 1e-6 ).map( ( r ) => r.act.label );
	document.getElementById( 'act-summary' ).textContent = dead.length
		? `${ dead.join( ', ' ) } has no gradient here — a unit sitting at this input never moves again`
		: `${ s.active.label } · ${ s.active.flops } FLOPs per element · every one of these is memory-bound`;

}

function actHeader() {

	proc.clear();
	proc.setTitle( 'activations — the pointwise choice' );
	proc.setStatus( 'computed', 'done' );
	proc.write( 'h = act(x @ W1)', 'cmd' );
	proc.write( 'y = h @ W2', 'cmd' );
	proc.write( 'remove act and W2 @ W1 is one matrix', 'dim' );
	proc.rule();

}

function actTrace( i ) {

	const s = worlds.activation.getState();
	proc.write( `${ i + 1 }. ${ ACT_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'FFN(x) = σ(x W₁) W₂', 'cmd' );
		proc.write( 'σ = identity  →  FFN(x) = x (W₁W₂)  →  one linear map', 'warn' );
		proc.write( 'the nonlinearity is what stops depth from collapsing', 'out' );
		proc.write( 'it is also where two thirds of a transformer\'s parameters end up', 'dim' );

	} else if ( i === 5 ) {

		proc.write( 'heldout log-perplexity, matched T5 baseline, 65k steps', 'cmd' );
		proc.write( `relu   ${ PPL_BASE.toFixed( 3 ) }`, 'out' );
		proc.write( 'swish  1.994', 'out' );
		proc.write( 'gelu   1.983', 'out' );
		proc.write( 'the spread between them is 0.014 — real, reproducible, and small', 'note' );
		proc.write( 'what separates them: smoothness at 0, and whether the negative half keeps a gradient', 'out' );
		proc.write( 'the change that moved the number by four times as much was structural — page 04', 'calc' );

	} else {

		const a = ACTS[ i - 1 ];
		const y = a.key === 'swish' ? a.f( s.probe, s.beta ) : a.f( s.probe );
		const d = a.key === 'swish' ? a.d( s.probe, s.beta ) : a.d( s.probe );
		proc.write( a.expr, 'cmd' );
		proc.write( `${ a.label }(${ s.probe.toFixed( 2 ) }) = ${ y.toFixed( 5 ) }   slope ${ d.toFixed( 5 ) }`, 'calc' );
		proc.write( `${ a.flops } FLOPs per element   ·   used by ${ a.users }`, 'out' );

		if ( a.key === 'relu' ) {

			proc.write( `${ [ -2, -0.5, 0.5, 2 ].map( ( x ) => `f(${ x }) = ${ a.f( x ).toFixed( 2 ) }` ).join( '   ' ) }`, 'out' );
			proc.write( 'slope is 0 for every negative input — no gradient, no recovery', 'warn' );

		} else if ( a.key === 'gelu' ) {

			proc.write( `tanh approximation error at x = ${ s.probe.toFixed( 2 ) }: ${ s.approxErr.toExponential( 2 ) }`, 'out' );
			proc.write( 'minimum −0.170 at x ≈ −0.752 — the curve goes below zero and comes back', 'out' );
			proc.write( 'the negative half keeps a small gradient, which is most of why it beat relu', 'note' );

		} else if ( a.key === 'swish' ) {

			proc.write( `β = ${ s.beta.toFixed( 2 ) }`, 'out' );
			proc.write( `β → 0 gives x/2   ·   β → ∞ gives relu   ·   β = 1 is SiLU`, 'out' );
			proc.write( 'SiLU is the function inside SwiGLU, which is what most current models ship', 'note' );

		} else {

			proc.write( `λ = ${ SELU_L }`, 'out' );
			proc.write( `α = ${ SELU_A }`, 'out' );
			proc.write( 'solved so that activations converge to mean 0, variance 1 under LeCun-normal init', 'out' );
			proc.write( 'it needs that init, AlphaDropout, and no residual stream to work — transformers have all three problems', 'warn' );

		}

	}

}

function logAct() {

	const s = worlds.activation.getState();
	proc.write( `x = ${ s.probe.toFixed( 2 ) } → ${ s.rows.map( ( r ) => `${ r.act.label } ${ r.y.toFixed( 3 ) }` ).join( '   ' ) }`, 'calc' );

}

const DM = [
	{ key: 'd768', label: '768 · GPT-2', d: 768 },
	{ key: 'd4096', label: '4096 · LLaMA-7B', d: 4096 },
	{ key: 'd8192', label: '8192 · LLaMA-70B', d: 8192 },
	{ key: 'd12288', label: '12288 · GPT-3', d: 12288 },
];

chipRow( document.getElementById( 'glu-chips' ), GLUS.map( ( g ) => ( { key: g.key, label: g.label } ) ), ( item ) => {

	const s = worlds.glu.setVariant( item.key );
	renderGluTable();
	proc.write( `${ s.variant.label }   ${ s.variant.expr }`, 'cmd' );
	proc.write( `${ s.variant.mats } matrices · d_ff ${ s.dff.toLocaleString( 'en-AU' ) } · ${ ( s.params / 1e6 ).toFixed( 1 ) } M params · log-ppl ${ s.variant.ppl.toFixed( 3 ) }`, 'calc' );

}, 'swiglu' );

chipRow( document.getElementById( 'dm-chips' ), DM, ( item ) => {

	const s = worlds.glu.setModel( item.d );
	renderGluTable();
	proc.write( `d = ${ s.dModel.toLocaleString( 'en-AU' ) } → 4d = ${ s.naive.toLocaleString( 'en-AU' ) } → ⅔ · 4d = ${ s.parity.toLocaleString( 'en-AU' ) } → ${ s.rounded.toLocaleString( 'en-AU' ) } rounded to 256`, 'calc' );

}, 'd4096' );

const gluScrub = makeScrubber( 'glu', GLU_STEPS.length, ( i ) => {

	if ( i === 0 ) pickChip( 'glu-chips', 'plain' );
	if ( i === 1 ) pickChip( 'glu-chips', 'glu' );
	if ( i >= 2 ) pickChip( 'glu-chips', 'swiglu' );
	worlds.glu.setStep( i );
	setCard( 'glu', i );
	gluTrace( i );
	flyTo( worlds.glu.getStepView( i ) );
	renderGluTable();

} );

function renderGluTable() {

	const s = worlds.glu.getState();
	const v = s.variant;
	table( 'glu-table', [
		[ 'variant', v.label, 'is-pick' ],
		[ 'matrices', String( v.mats ) ],
		[ 'gate function', v.gateLabel ],
		[ 'd_model', s.dModel.toLocaleString( 'en-AU' ) ],
		[ '4d', s.naive.toLocaleString( 'en-AU' ) ],
		[ 'd_ff used', s.dff.toLocaleString( 'en-AU' ), v.mats === 3 ? 'is-pick' : '' ],
		[ 'FFN parameters', ( s.params / 1e6 ).toFixed( 1 ) + ' M' ],
		[ 'plain FFN at 4d', ( s.basis / 1e6 ).toFixed( 1 ) + ' M' ],
		[ 'log-perplexity', v.ppl.toFixed( 3 ), v.ppl < 1.96 ? 'is-pick' : 'is-warn' ],
	] );

	document.getElementById( 'glu-summary' ).textContent = v.mats === 3
		? `${ v.label } holds ${ ( s.params / 1e6 ).toFixed( 1 ) } M against the plain FFN's ${ ( s.basis / 1e6 ).toFixed( 1 ) } M — ${ ( ( s.params / s.basis - 1 ) * 100 ).toFixed( 1 ) }% apart, and ${ ( PPL_BASE - v.ppl ).toFixed( 3 ) } better than relu`
		: `two matrices at d_ff = 4d · ${ ( s.basis / 1e6 ).toFixed( 1 ) } M parameters · the baseline every gated variant is measured against`;

}

function gluHeader() {

	proc.clear();
	proc.setTitle( 'feed-forward — gated or not' );
	proc.setStatus( 'computed', 'done' );
	proc.write( 'h = act(x @ W) * (x @ V)', 'cmd' );
	proc.write( 'y = h @ W2', 'cmd' );
	proc.write( 'three matrices where 2017 had two', 'dim' );
	proc.rule();

}

function gluTrace( i ) {

	const s = worlds.glu.getState();
	proc.write( `${ i + 1 }. ${ GLU_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'FFN(x) = σ(x W₁) W₂', 'cmd' );
		proc.write( `d ${ s.dModel.toLocaleString( 'en-AU' ) } → d_ff ${ s.naive.toLocaleString( 'en-AU' ) } → d`, 'out' );
		proc.write( `2 · ${ s.dModel.toLocaleString( 'en-AU' ) } · ${ s.naive.toLocaleString( 'en-AU' ) } = ${ ( s.basis / 1e6 ).toFixed( 1 ) } M parameters per block`, 'calc' );
		proc.write( 'every hidden unit is one number through one fixed curve', 'dim' );

	} else if ( i === 1 ) {

		proc.write( 'GLU(x) = σ(xW) ⊗ (xV)          Dauphin et al. 2017', 'cmd' );
		proc.write( 'one branch becomes a gate, the other stays linear', 'out' );
		proc.write( `gate  ${ s.gate.slice( 0, 6 ).map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }`, 'out' );
		proc.write( `value ${ ( s.up || s.a ).slice( 0, 6 ).map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }`, 'out' );
		proc.write( `h     ${ s.h.slice( 0, 6 ).map( ( v ) => v.toFixed( 2 ).padStart( 6 ) ).join( '' ) }`, 'ok' );
		proc.write( 'h is now quadratic in x — a product of two learned functions, not one bent one', 'note' );

	} else if ( i === 2 ) {

		GLUS.filter( ( g ) => g.mats === 3 ).forEach( ( g ) => proc.write( `${ g.label.padEnd( 8 ) } gate = ${ g.gateLabel.padEnd( 10 ) } ${ g.expr }`, g.key === s.variant.key ? 'calc' : 'out' ) );
		proc.write( 'LiGLU puts no function on the gate at all and still beats every ungated FFN', 'warn' );
		proc.write( 'so the gain is the multiplication, not the curve', 'note' );

	} else if ( i === 3 ) {

		proc.write( 'hold parameters fixed, then compare', 'cmd' );
		proc.write( `plain   2 · ${ s.dModel.toLocaleString( 'en-AU' ) } · ${ s.naive.toLocaleString( 'en-AU' ) } = ${ ( s.basis / 1e6 ).toFixed( 1 ) } M`, 'out' );
		proc.write( `⅔ · 4d = ${ s.parity.toLocaleString( 'en-AU' ) }   →   rounded to ${ s.rounded.toLocaleString( 'en-AU' ) }`, 'calc' );
		proc.write( `gated   3 · ${ s.dModel.toLocaleString( 'en-AU' ) } · ${ s.dff.toLocaleString( 'en-AU' ) } = ${ ( s.params / 1e6 ).toFixed( 1 ) } M`, 'out' );
		proc.write( 'LLaMA-7B: d 4096 → 4d 16384 → ⅔ 10922 → 11008, a multiple of 256', 'ok' );
		proc.write( 'the FLOPs match too, so the comparison is compute-equivalent as well', 'dim' );

	} else if ( i === 4 ) {

		USAGE.forEach( ( [ who, act, mats ] ) => proc.write( `${ who.padEnd( 24 ) } ${ act.padEnd( 8 ) } ${ mats }`, act.includes( 'GLU' ) ? 'ok' : 'out' ) );
		proc.write( 'SeLU appears in none of them', 'dim' );
		proc.write( 'the 2024 default is pre-norm + RMSNorm + SwiGLU + no biases', 'note' );

	} else {

		proc.write( 'heldout log-perplexity, matched parameters and FLOPs, 65k steps', 'cmd' );
		[ ...GLUS ].sort( ( a, b ) => a.ppl - b.ppl ).forEach( ( g ) => proc.write( `${ g.label.padEnd( 8 ) } ${ g.ppl.toFixed( 3 ) }   ${ g.mats } matrices`, g.mats === 3 ? 'ok' : 'out' ) );
		proc.write( `relu     ${ PPL_BASE.toFixed( 3 ) }   2 matrices`, 'out' );
		proc.write( `best gated beats relu by ${ ( PPL_BASE - 1.942 ).toFixed( 3 ) }; the pointwise choices spanned 0.014`, 'calc' );
		proc.write( '"we attribute their success, as all else, to divine benevolence" — Shazeer 2020', 'note' );

	}

}

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

	const hits = raycaster.intersectObjects( worlds[ currentKey ].interactables, true )
		.filter( ( h ) => visibleChain( h.object ) && h.object.userData.kind );

	if ( ! hits.length ) return;
	openDetail( worlds[ currentKey ].describe( hits[ 0 ].object ) );

} );

const navLinks = document.querySelectorAll( '.nav-link' );
const worldPanels = document.querySelectorAll( '.world' );

function setWorldLabelsVisible( key, visible ) {

	worlds[ key ].scene.traverse( ( obj ) => {

		if ( obj.isCSS2DObject ) obj.element.style.display = visible ? '' : 'none';

	} );

}

const ENTER = { residual: enterResidual, norm: enterNorm, activation: enterActivation, glu: enterGlu };

function switchWorld( key ) {

	if ( key === currentKey || ! worlds[ key ] ) return;

	resScrub.stop();
	normScrub.stop();
	actScrub.stop();
	gluScrub.stop();
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

function enterResidual() {

	worlds.residual.setStep( resScrub.index );
	resHeader();
	resTrace( resScrub.index );
	setCard( 'residual', resScrub.index );
	renderResTable();
	flyTo( worlds.residual.getStepView( resScrub.index ) );

}

function enterNorm() {

	worlds.norm.setStep( normScrub.index );
	normHeader();
	normTrace( normScrub.index );
	setCard( 'norm', normScrub.index );
	renderNormTable();
	flyTo( worlds.norm.getStepView( normScrub.index ) );

}

function enterActivation() {

	worlds.activation.setStep( actScrub.index );
	actHeader();
	actTrace( actScrub.index );
	setCard( 'activation', actScrub.index );
	renderActTable();
	flyTo( worlds.activation.getStepView( actScrub.index ) );

}

function enterGlu() {

	worlds.glu.setStep( gluScrub.index );
	gluHeader();
	gluTrace( gluScrub.index );
	setCard( 'glu', gluScrub.index );
	renderGluTable();
	flyTo( worlds.glu.getStepView( gluScrub.index ) );

}

setCard( 'norm', 0 );
setCard( 'activation', 0 );
setCard( 'glu', 0 );
renderNormTable();
renderActTable();
renderGluTable();

navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === 'residual' ) );
worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === 'residual' ) );
Object.keys( worlds ).forEach( ( key ) => setWorldLabelsVisible( key, key === 'residual' ) );
enterResidual();

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
